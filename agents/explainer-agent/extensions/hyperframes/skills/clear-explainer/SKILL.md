---
name: clear-explainer
description: The teaching method explainer-agent uses for every video — explain like the clearest TED-Ed lessons, for someone new to the subject — one driving question, at most three main points, plain words with every term defined, concrete before abstract, one idea and one picture per frame, a recap before the call to action. Also how to present the storyboard for review before anything is built (the storyboard sheet and present_storyboard). Load it right after the workflow skill, in every style; it governs Step 3 (story and script), the on-screen words and the storyboard checkpoint.
---

# Clear explainer

A good explainer leaves a newcomer able to **repeat the main points after one viewing**. Everything here serves that. It sits on top of the workflow's story method (`faceless-explainer/references/story-design.md`: structures, hook strategies, clarity techniques) and decides between its options in favour of clarity.

## The viewer

Write for a smart person who has **never met this subject**: no jargon, no assumed knowledge, no insider shorthand, 45 seconds of attention. If the brief names an expert audience, raise the vocabulary — never the number of ideas.

## The method (Step 3)

1. **One driving question.** The video exists to answer one question the viewer would actually ask ("Why does sourdough take a whole day?", "What does an AI agent do that a chatbot doesn't?"). Open on it — or on the surprising fact or everyday situation that raises it — answer it, and close on the answer.
2. **The answer in one sentence** (`message:`), in words a 12-year-old understands. If it can't be said that simply, the story isn't ready.
3. **At most three main points** — the spine. 30 s: one or two; 45–60 s: two or three; 90 s: three (four only for a list). Each point is one sentence the viewer could repeat. Signpost them ("First…", a "1/3" counter, the same position on screen).
4. **Concrete before abstract.** Every point starts with something the viewer can picture — an everyday example, an analogy from their world (a kitchen, a queue, a library), a worked case with small round numbers — and only then names the general rule. Never explain one technical thing with another.
5. **Define every term** in plain words the first time it appears, on screen ("RAG — looking things up before answering"). At most two new terms per video; prefer none.
6. **One idea per frame, one picture per idea.** Each frame shows one visual metaphor for its one idea. Keep the metaphor across frames (the same object grows, gains a part, changes colour) — a consistent stage builds understanding; a new picture every frame resets it.
7. **Numbers a newcomer can feel**: rounded ("about 1 in 3"), compared ("twice as long as…"), from the brief or the product facts only. One number per frame.
8. **Recap before the call to action**: the main points again, one short line each, with the picture that taught each one (a callback). Then the takeaway — what to think or do differently.
9. **Earn the next second.** Each frame ends on a reason to keep watching: a question, a "but", a reveal about to happen. Cut every frame that doesn't move the viewer closer to the answer.

A typical 45–60 s arc (TED-Ed concept lesson): **question** (hook) → **everyday picture** (what you already know) → **name it** (the idea, defined) → **how it works** (2–3 steps on one stage) → **why it matters** (the consequence) → **recap** → **call to action**. A how-to: problem → steps on one stage → result → recap. A story: a person in a situation → tension → turn → the lesson, generalised → recap.

## Words on screen

- **Short**: ≤ 8 words per line, ≤ 2 lines per frame; ≤ 12 words on screen at once on a silent video. With narration, the screen shows the key words, not the sentence.
- **Plain**: everyday words, active voice, numbers as digits, no acronym without its meaning, no "leverage / unlock / seamless / synergy".
- **One highlighted word per frame** — the word to remember.
- **Reading time** (silent videos): ≈ 0.3 s per word on screen + 1 s before the next thing competes with it. The last frame holds ≥ 1.5 s.
- The same idea keeps the same word all video long (don't call it "agent" in frame 2 and "assistant" in frame 4).

## Narration (with --voice)

- Conversational and direct ("you"), 130–150 words a minute, one short sentence per cue; pauses at the turns.
- The picture shows what the words say **as** they say it — never ahead, never a slide behind.

## The newcomer test (before presenting the storyboard)

For each frame: (1) could someone new to this say in five words what the frame shows? (2) is every word on screen one they would use? (3) does it answer something the previous frame raised? (4) is anything there that the message doesn't need — cut it. For the whole video: can the viewer repeat the main points after one viewing? Does the recap use the same words as the frames?

## The storyboard checkpoint

explainer-agent shows the plan to the person **before anything is built**: `STORYBOARD.md` (the workflow's plan) plus a sketch sheet, `storyboard.html`, presented with `mcp__explainer__present_storyboard`. How to draw the sheet and what goes in each cell: `references/storyboard-sheet.md`. Pictures, voices and frames are made only after approval.
