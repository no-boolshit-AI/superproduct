---
title: Specs
status: template
owner: 
updated: {{date}}
review: quarterly
---
# Specs

Product specs and PRDs for changes to the product itself (the website, the agent finder, the courses' tooling). One
file per feature: `YYYY-MM-DD-<feature>.md`.

For code changes, the dev agent writes its own PRD and plan in its run folder; link them here when they matter beyond
one run (`agents/dev-agent/runs/<project>/<run>/PRD.md`).

```markdown
---
title: <Feature>
status: draft
owner: <name>
updated: YYYY-MM-DD
---
# <Feature>

Problem: <who has it, evidence from development/research.md>
Goal: <outcome and how we'll know (development/metrics.md)>
Non-goals:
Users and jobs: <from strategy/audiences.md>
Requirements: <numbered>
Copy: <follows brand/voice.md and knowledge/glossary.md>
Design: <tokens and patterns from brand/guidelines.md>
Privacy: <does it touch the promises in knowledge/facts.md F11–F15, F21–F24?>
Open questions:
```
