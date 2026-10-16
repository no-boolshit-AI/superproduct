# The storyboard sheet — explainer-agent

What the person reviews before the video is built: one self-contained page, `storyboard.html` in the project root, drawn from `STORYBOARD.md`, plus the summary you pass to `mcp__explainer__present_storyboard`. It follows `hyperframes-creative/references/storyboard-recipe.md` § 3 with these differences.

## The page

- **Width 1600 px** (the harness photographs it at 1600 px wide for the person and for you): `body { width: 1600px; margin: 0; }`. Light neutral page background (`#ECEAE6`), so cells in any ground colour stand out.
- **Header**: the title and `v1` (bump on every revision), then four short lines: **The question** · **The answer** (the message) · **Main points** (numbered, one line each) · **Format** (aspect, length, narration yes/no, style and look).
- **Cells at the video's aspect** (`aspect-ratio: 4 / 5` for portrait, `9 / 16` vertical, `1 / 1` square, `16 / 9` landscape), `container-type: inline-size`, sizes inside in `cqw` so the sketch scales with the cell. Three columns (four for 9:16), chronological. Each cell has `id="frame-NN"` (the build reads its layout from there).
- **Under each cell**, four lines:
  - `NN · Name · 5.0 s` (and the seam into the next frame, small)
  - **Point** — what the viewer understands after this frame, one plain sentence
  - **Says** — every word on screen, verbatim in quotes (and the narration line, if any)
  - **Moves** — one sentence: what enters first, the camera, the effect that guides the eye
- **Closing cells**: *Pictures to make* (each generated picture: file name, kind, what it shows — made after approval), *Look* (palette by role with hex, type roles, the look and why it fits the brand), and *Open questions / placeholders* (facts the brief didn't give, shown as `[X]` on screen).

## The sketch in each cell

A sketch is the frame's **key moment** (usually the held read), static, in the real treatment:

- real fonts (the Brand kit's `@font-face` block; paths `assets/fonts/captured-…` resolve from the project root), real colours by role from `frame.md`, the actual words where they will sit;
- the style's signature drawn simply: for **editorial** the colour field shape, the giant type behind, line-art as inline SVG (rings, connectors with dots, the spotlight as a dark overlay with a clear circle); for **vox-collage** torn paper (a rotated rectangle with a ragged SVG edge), a highlighter band, a marker loop;
- pictures not made yet as **labelled placeholders** in their place and size: a mid-grey silhouette block (a rounded shape, a 45° dot pattern if the picture will be halftone) with a small caption ("cut-out: the baker, B&W halftone");
- images the person supplied (`public/…`) and the logo files as real `<img>` (relative paths from the project root).

**No motion, no scripts, no external assets**; it must open from `file://`. A few dozen lines per cell; reuse one CSS class per element type. Check it the way the person will: the harness returns the photographed sheet — look at it, fix what's broken (text overflowing a cell, a missing font, an empty cell) and present again.

## present_storyboard

Call it once the sheet is drawn and `STORYBOARD.md` (and `SCRIPT.md` with narration) are written. It photographs the sheet, writes `storyboard.md` (the review document) in the job folder and ends this phase. Give it: the title, the question, the message, the main points, the audience, the style and look with a one-line reason, every frame (id, name, seconds, point, the words on screen, the narration line, what you see, how it moves), the pictures to make, the placeholders, and the questions you want the person to answer (choices you made that they may want to change: the analogy, the look, the length). Then end your turn with one line. The person's answer arrives later as a new message: changes (revise only the frames they name, bump the version, present again) or approval (build).
