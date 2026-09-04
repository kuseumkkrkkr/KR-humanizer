---
name: humanize-korean-writing
description: Review or rewrite Korean prose while preserving meaning, showing paragraph and typo diagnosis first, then presenting sentence-level changes for explicit user acceptance. Use for Korean polishing, proofreading, naturalization, readability, or AI-draft editing.
---

# Korean writing review

Preserve the writer's facts, numbers, proper nouns, stance, and intended audience. Do not claim to defeat AI detectors or hide authorship.

## Workflow

1. Save the supplied text to a temporary UTF-8 file only when a file is needed for the CLI.
2. Run `npx --yes github:kuseumkkrkkr/KR-humanizer analyze <file>` and report paragraph, typo, spacing, long-sentence, and invisible-character findings before rewriting.
3. Ask the user to choose a tone only when their request does not imply one. Otherwise infer the least-transformative suitable tone.
4. For a visual review, run `npx --yes github:kuseumkkrkkr/KR-humanizer gui`. Tell the user it opens a localhost interface.
5. For a CLI proposal, run `npx --yes github:kuseumkkrkkr/KR-humanizer rewrite <file> --engine codex --out <proposal.json>` in Codex, or use `--engine claude` in Claude Code.
6. Present changes without overwriting the source. Let the user filter change types, switch between highlighted and side-by-side comparison, and select individual or currently visible sentences. Mark `order` changes clearly and apply only the sentence IDs the user accepts.
7. Use `sanitize` only after showing the detected code points. Explain that these are verifiable text-control characters, not proof of an AI watermark.

## Synthetic CV

When the user asks to compare plain AI drafts with KR-humanizer output, run `npx --yes github:kuseumkkrkkr/KR-humanizer cv --samples 3 --folds 3`. Keep each original/rewrite pair in one fold, present deterministic style metrics separately from blinded model judgment, and state that synthetic CV is not evidence of human preference or detector evasion.

## Boundaries

- Do not add facts or smooth over uncertainty.
- Do not treat style heuristics as definitive grammar errors.
- Do not send text to a separate model API. The CLI adapter may invoke the user's authenticated Codex or Claude Code process.
- mem0 is optional and must be a self-hosted localhost instance configured with local providers. The default memory store is local JSON.
