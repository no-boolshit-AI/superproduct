# Skill extensions

`hyperframes/` mirrors the bundled HyperFrames plugin (`../vendor/hyperframes/`) and holds what explainer-agent adds
to it. `src/extensions.ts` lays it over the plugin — on `npm run setup`, after `npm run skills:update` downloads a new
release, and before every job — so Claude loads the additions as ordinary `hyperframes:*` skills:

- a file is copied to the same path in the plugin (a new skill, rules, blueprints, a frame preset);
- `<name>.append.md` is appended to `<name>.md` between `<!-- explainer-agent extension: … -->` markers, once
  (re-applying replaces the block, so edits here propagate).

Edit the files here, never their copies in `vendor/hyperframes` (a skills update replaces those).

What is here now:

**The teaching method** — every run

| path | what |
|---|---|
| `skills/clear-explainer/` | the skill (TED-Ed-style: one question, ≤ 3 main points, plain words, concrete before abstract, a recap; the newcomer test) and `references/storyboard-sheet.md` (the sketch sheet presented for review) |
| `skills/faceless-explainer/references/story-design.append.md` | a pointer to it inside the workflow's own story method |

**The editorial style** (the default)

| path | what |
|---|---|
| `skills/editorial/` | the skill (`SKILL.md`: the looks per brand, the workflow steps, the blueprint menu; `references/storyboard-guide.md`) and the kit (`assets/`: `editorial.js` + grain, vignette, grid and halftone textures), staged into a job's project at `assets/editorial/` |
| `skills/hyperframes-animation/rules/editorial-*.md` | motion rules (kit, camera, cut-outs, callouts, graphics, transitions) |
| `skills/hyperframes-animation/blueprints/editorial-*.md` | 11 shot blueprints |
| `skills/hyperframes-creative/frame-presets/editorial/` | the frame preset + its documentary caption skin |

**The vox-collage style**

| path | what |
|---|---|
| `skills/vox-collage/` | the skill (`SKILL.md`, `references/storyboard-guide.md`) and the collage kit (`assets/`: `collage.js` + textures), staged into a job's project at `assets/collage/` |
| `skills/hyperframes-animation/rules/collage-*.md` | motion rules |
| `skills/hyperframes-animation/blueprints/collage-*.md` | shot blueprints |
| `skills/hyperframes-creative/frame-presets/vox-collage/` | the frame preset + caption skin |

Shared: `skills/hyperframes-animation/rules-index.append.md` and `blueprints-index.append.md` list both styles' rules and blueprints; `skills/hyperframes-creative/references/visual-styles.append.md` adds both to the visual style library.
