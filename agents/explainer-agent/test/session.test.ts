/** The prompt stream (session.ts): open while background workers run, closed on delivery or a run limit, nudged when the agent stops early. */
import assert from "node:assert/strict";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { NUDGE, STORYBOARD_NUDGE, TurnKeeper } from "../src/session.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const m = (x: Record<string, unknown>) => x as unknown as SDKMessage;
const result = (subtype = "success") => m({ type: "result", subtype, total_cost_usd: 1, num_turns: 3, result: "ok" });
const idle = m({ type: "system", subtype: "session_state_changed", state: "idle" });
const running = m({ type: "system", subtype: "session_state_changed", state: "running" });
const tasks = (...ids: string[]) => m({ type: "system", subtype: "background_tasks_changed", tasks: ids.map((task_id) => ({ task_id, task_type: "local_agent", description: task_id })) });
const assistant = (worker = false) => m({ type: "assistant", parent_tool_use_id: worker ? "toolu_w" : null, message: { content: [] } });

/** Read what the stream yields until it ends or `max` messages arrive. */
async function drain(k: TurnKeeper, max = 10) {
  const out: string[] = [];
  for await (const u of k.prompt) {
    out.push(String(u.message.content));
    if (out.length >= max) break;
  }
  return out;
}

// delivered: the turn's result closes the stream; the first message is the prompt
{
  let delivered = false;
  const k = new TurnKeeper("Make the video", { delivered: () => delivered });
  const got = drain(k);
  await sleep(5);
  k.observe(assistant());
  delivered = true;
  k.observe(result());
  assert.equal(k.isClosed, true);
  assert.deepEqual(await got, ["Make the video"]);
}

// a run limit closes it too, without a nudge
{
  const k = new TurnKeeper("go", { delivered: () => false });
  k.observe(result("error_max_budget_usd"));
  assert.equal(k.isClosed, true);
  assert.equal(k.nudgesSent, 0);
}

// workers in the background: the turn's end doesn't close or nudge; their notices start the next turn
{
  let nudged = 0;
  const k = new TurnKeeper("go", { delivered: () => false, settleMs: 10, onNudge: () => nudged++ });
  const got = drain(k, 3);
  k.observe(tasks("w1", "w2"));
  k.observe(result());
  k.observe(idle);
  await sleep(40);
  assert.equal(k.isClosed, false, "kept open while workers run");
  assert.equal(nudged, 0);
  // a worker reports → the main agent's next turn; then the last one, and the agent stops without delivering
  k.observe(running);
  k.observe(assistant(true));
  k.observe(tasks());
  k.observe(assistant());
  k.observe(result());
  k.observe(idle);
  assert.equal(nudged, 1, "nothing running, nothing delivered: one nudge");
  // the nudged turn ends the same way; then the second nudge; the third time it closes
  k.observe(assistant());
  k.observe(result());
  k.observe(idle);
  assert.equal(nudged, 2);
  k.observe(assistant());
  k.observe(result());
  k.observe(idle);
  assert.equal(k.isClosed, true, "after two nudges the stream closes and the safety net runs");
  assert.deepEqual(await got, ["go", NUDGE, NUDGE]);
}

// no "idle" from the CLI: the settle timer stands in; a new turn cancels it
{
  let nudged = 0;
  const k = new TurnKeeper("go", { delivered: () => false, settleMs: 15, onNudge: () => nudged++ });
  k.observe(result());
  k.observe(assistant()); // a turn started before the timer fired
  await sleep(40);
  assert.equal(nudged, 0);
  k.observe(result());
  await sleep(40);
  assert.equal(nudged, 1, "settled by the timer");
  k.close();
}

// the storyboard phase nudges toward present_storyboard, and closes once it was presented
{
  let presented = false;
  const k = new TurnKeeper("Plan it", { delivered: () => presented, nudge: STORYBOARD_NUDGE, settleMs: 10 });
  const got = drain(k, 3);
  k.observe(assistant());
  k.observe(result());
  k.observe(idle);
  presented = true;
  k.observe(assistant());
  k.observe(result());
  assert.equal(k.isClosed, true);
  assert.deepEqual(await got, ["Plan it", STORYBOARD_NUDGE]);
  assert.match(STORYBOARD_NUDGE, /present_storyboard/);
}

// a hung session: the stall watchdog closes it
{
  let stalled = false;
  const k = new TurnKeeper("go", { delivered: () => false, stallMs: 20, onStall: () => (stalled = true) });
  const got = drain(k);
  await sleep(50);
  assert.equal(stalled, true);
  assert.equal(k.isClosed, true);
  assert.deepEqual(await got, ["go"]);
}

console.log("✓ session OK");
