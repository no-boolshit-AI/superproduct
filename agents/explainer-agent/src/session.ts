/**
 * The prompt as a stream that stays open while the job has work left.
 *
 * With a plain string prompt the Agent SDK treats the run as a single user turn: once that turn ends — at the latest
 * ten minutes after its result while background tasks still run — it closes Claude Code's input, and from then on
 * every permission check, frame workers' writes included, comes back "cancelled" ("The user doesn't want to take this
 * action right now. STOP…"), which the model reads as the person telling it to stop. Frame workers run in the
 * background, so a main agent that ends its turn to wait for them lost every frame that way.
 *
 * Kept open, a worker's completion notice starts the main agent's next turn as usual. The stream closes once the
 * video is delivered or a run limit stopped the agent. When a turn ends with nothing running and nothing delivered,
 * the agent gets a nudge to carry on (at most `maxNudges`); after that the stream closes and the safety net runs.
 */
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export const NUDGE =
  "Nobody can answer questions in this run, so don't wait for a reply: decide and continue. The video isn't delivered yet. Carry on from where the project stands (frames, assembly, checks, the render) and call mcp__explainer__deliver.";
/** The nudge while the storyboard is being made: the turn may only end once it has been presented. */
export const STORYBOARD_NUDGE =
  "Nobody can answer questions in this run, so don't wait for a reply: decide and continue. The storyboard hasn't been presented yet. Finish STORYBOARD.md and the sketch sheet (storyboard.html) and call mcp__explainer__present_storyboard; the person reviews it after this run.";

const user = (text: string): SDKUserMessage => ({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });

export interface TurnKeeperOptions {
  /** true once the run's result has been handed over (the video, or the storyboard) */
  delivered: () => boolean;
  /** what a nudge says (default NUDGE) */
  nudge?: string;
  maxNudges?: number;
  /** after a result with nothing running, how long to wait for the session to report idle before settling anyway */
  settleMs?: number;
  /** close when no message arrives for this long (a hung worker): 45 minutes by default */
  stallMs?: number;
  onNudge?: (n: number) => void;
  onStall?: () => void;
}

export class TurnKeeper {
  readonly prompt: AsyncIterable<SDKUserMessage>;
  private queue: SDKUserMessage[];
  private wake: (() => void) | null = null;
  private closed = false;
  /** a result that wasn't a success: the budget or turn limit, an error */
  private stopped = false;
  private turnEnded = false;
  private background = new Set<string>();
  private nudges = 0;
  private settleTimer: NodeJS.Timeout | undefined;
  private stallTimer: NodeJS.Timeout | undefined;

  constructor(
    first: string,
    private readonly o: TurnKeeperOptions,
  ) {
    this.queue = [user(first)];
    this.prompt = this.stream();
    this.armStall();
  }

  get isClosed() {
    return this.closed;
  }

  get nudgesSent() {
    return this.nudges;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.settleTimer);
    clearTimeout(this.stallTimer);
    this.wake?.();
  }

  /** Every SDK message goes through here. */
  observe(msg: SDKMessage) {
    if (this.closed) return;
    this.armStall();
    if (msg.type === "system" && msg.subtype === "background_tasks_changed") {
      this.background = new Set(msg.tasks.filter((t) => !t.ambient).map((t) => t.task_id));
      return;
    }
    if (msg.type === "system" && msg.subtype === "session_state_changed") {
      if (msg.state === "idle") {
        if (this.turnEnded) this.settle();
      } else this.activity();
      return;
    }
    if (msg.type === "result") {
      this.turnEnded = true;
      if (msg.subtype !== "success") this.stopped = true;
      if (this.o.delivered() || this.stopped) return this.close();
      clearTimeout(this.settleTimer);
      // workers still running: their notices start the next turn; otherwise expect "idle", and settle if it never comes
      if (!this.background.size) this.settleTimer = setTimeout(() => this.settle(), this.o.settleMs ?? 20_000);
      return;
    }
    if (msg.type === "assistant" && !msg.parent_tool_use_id) this.activity();
  }

  private activity() {
    this.turnEnded = false;
    clearTimeout(this.settleTimer);
  }

  private settle() {
    clearTimeout(this.settleTimer);
    if (this.closed || !this.turnEnded || this.background.size) return;
    if (this.o.delivered() || this.stopped || this.nudges >= (this.o.maxNudges ?? 2)) return this.close();
    this.nudges++;
    this.o.onNudge?.(this.nudges);
    this.turnEnded = false;
    this.queue.push(user(this.o.nudge ?? NUDGE));
    this.wake?.();
  }

  private armStall() {
    clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      this.o.onStall?.();
      this.close();
    }, this.o.stallMs ?? 45 * 60_000);
    this.stallTimer.unref?.();
  }

  private async *stream(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.queue.length) yield this.queue.shift()!;
      if (this.closed) return;
      await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
  }
}
