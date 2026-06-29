# Skills Operations

Meelni keeps project-specific skills in one canonical location:

```text
.agents/skills/
```

Agent-specific directories should point at the canonical skills:

```text
.codex/skills/meelni-*  -> ../../.agents/skills/meelni-*
.claude/skills/meelni-* -> ../../.agents/skills/meelni-*
```

Edit `.agents/skills/*` first. Do not hand-edit symlinked copies.

## Current Skills

- `meelni-codebase-architecture`: package migration, module boundaries, adapter shape, and agent-friendly refactors.
- `meelni-livekit-interview-runtime`: LiveKit interview sessions, room metadata, transcripts, turn-taking, runtime config, and agent prompts.
- `meelni-feedback-evaluation`: scoring, rubrics, feedback generation, drills, insights, and evaluation reliability.
- `meelni-question-bank-seo`: explore pages, company pages, structured data, Google Sheets sync, and conversion from content to practice.
- `meelni-product-strategy`: Product Compass, PM-focused product direction, relaunch strategy, pricing, trials, positioning, growth loops, AI/agent learning expansion, and enterprise path. Its stable workflow lives in `SKILL.md`; product truth and lenses live in `references/`.
- `meelni-linear-workstream`: Linear project, slice issue, child issue, progress comment, handoff, and closure workflow for Meelni agent/human work streams.
- `meelni-vertical-slice-playbooks`: feature playbooks for interview/session, feedback/evaluation, billing/trials, question-bank SEO, and agent tooling changes.
- `meelni-engineering-memory`: decisions, architecture docs, contracts, operations docs, product current-state updates, and OpenSpec maintenance.
- `meelni-pr-prep`: pre-PR validation, docs/spec checks, and PR summary preparation.

## Validation

After editing a skill, run:

```bash
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" .agents/skills/<skill-name>
```
