# Skill extensions

`hyperframes/` mirrors the bundled HyperFrames plugin (`../vendor/hyperframes/`) and holds what explainer-agent adds
to it. `src/extensions.ts` lays it over the plugin — on `npm run setup`, after `npm run skills:update` downloads a new
release, and before every job — so Claude loads the additions as ordinary `hyperframes:*` skills:

- a file is copied to the same path in the plugin (a new skill, rules, blueprints, a frame preset);
- `<name>.append.md` is appended to `<name>.md` between `<!-- explainer-agent extension: … -->` markers, once
  (re-applying replaces the block, so edits here propagate).

Edit the files here, never their copies in `vendor/hyperframes` (a skills update replaces those).

What is here now: the **vox-collage** style

| path | what |
|---|---|
| `skills/vox-collage/` | the skill (`SKILL.md`, `references/storyboard-guide.md`) and the collage kit (`assets/`: `collage.js` + textures), staged into a job's project at `assets/collage/` |
| `skills/hyperframes-animation/rules/collage-*.md` | motion rules; `rules-index.append.md` lists them |
| `skills/hyperframes-animation/blueprints/collage-*.md` | shot blueprints; `blueprints-index.append.md` lists them |
| `skills/hyperframes-creative/frame-presets/vox-collage/` | the frame preset + caption skin |
| `skills/hyperframes-creative/references/visual-styles.append.md` | the style's entry in the visual style library |
