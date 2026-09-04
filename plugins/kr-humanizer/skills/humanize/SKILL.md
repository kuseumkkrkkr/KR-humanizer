---
name: humanize-korean-writing
description: Review or rewrite Korean prose while preserving meaning, showing paragraph and typo diagnosis first, then presenting sentence-level changes for explicit user acceptance. Use for Korean polishing, proofreading, naturalization, readability, or AI-draft editing.
---

# Korean writing review

Preserve the writer's facts, numbers, proper nouns, stance, and intended audience. Do not claim to defeat AI detectors or hide authorship.

## Workflow

1. Save the supplied text or writing brief to a temporary UTF-8 file only when a file is needed for the CLI.
2. When the user starts from a writing prompt rather than a draft, ask whether to use Plan mode. If accepted, run `npx --yes github:kuseumkkrkkr/KR-humanizer plan <brief> --explanation balanced --out <graph.json>`, present the nodes before prose, and let the user edit, reorder, exclude, or delete nodes. Then run `draft <brief> --graph <graph.json>`. Never restore an excluded node in the draft.
3. Run `npx --yes github:kuseumkkrkkr/KR-humanizer analyze <file>` and report paragraph, typo, spacing, long-sentence, and invisible-character findings before rewriting. Use its paragraph flow as an editable graph when no Plan graph exists.
4. Search the bundled Obsidian knowledge vault with `npx --yes github:kuseumkkrkkr/KR-humanizer knowledge <file> --mode <mode> --honorific <0-100>`. Inspect every returned card's title, source section, URL, `matchedTerms`, `appliesWhen`, and `boundary`. An exact matched term raises retrieval rank but never proves a correction by itself. Treat National Institute of Korean Language norm cards as authority and community Skill cards only as workflow observations. Apply a card only when its condition is actually present in the text and its boundary does not exclude the passage.
   - The rewrite command performs this approved-card lookup automatically. Do not fetch the web on every rewrite.
   - When the user asks to refresh official sources, use the companion `nikl-reference-agent` skill. Raw snapshots never become prompt sources without card review.
5. Ask the user to choose a tone only when their request does not imply one. Otherwise infer the least-transformative suitable tone. Treat `--honorific 0-100` as listener-directed speech level: 0 is 해체, 25 해라체, 50 preserves the source, 75 is 해요체, and 100 하십시오체. Use `--explanation minimal|balanced|maximal` for explanation depth: minimal keeps only the core and required evidence, balanced adds one necessary connection, and maximal fully explains only supplied context. No level permits invented facts or repetition.
6. For a visual review, run `npx --yes github:kuseumkkrkkr/KR-humanizer gui`. Tell the user it opens a localhost interface.
   - If the user wants next-sentence assistance and Codex EXEC is available, enable `Tab 문장 자동완성` in the GUI. It waits for a pause at the end of the draft, uses only the fixed `gpt-5.3-codex-spark` model, shows one sentence before insertion, accepts with Tab or the Apply button, and dismisses with Escape. Never imply that this mode works through Claude Code or a separate API.
7. For a CLI proposal, run `npx --yes github:kuseumkkrkkr/KR-humanizer rewrite <file> --engine codex --mode balanced --honorific 50 --explanation balanced --out <proposal.json>` in Codex, or use `--engine claude` in Claude Code. Add `--graph <graph.json>` when the user has reviewed a graph. The rewrite command searches the vault and injects only the top matching guidance into the prompt. Use `--vault <folder>` for a user-maintained Obsidian vault. Choose `fluent` for minimal correction, `strict` for broader consistency review, or `concise` for meaning-preserving shortening. Read [editing principles](references/editing-principles.md) when choosing or explaining a mode.
8. Present changes without overwriting the source. Default to the Git-like unified Diff, with split view optional. Mark `order` changes clearly and apply only the sentence IDs the user accepts. Label attached knowledge card IDs as retrieved prompt candidates, not proof that the model applied them to a specific change.
9. Use `sanitize` only after showing the detected code points. Explain that these are verifiable text-control characters, not proof of an AI watermark.

## Synthetic CV

When the user asks to compare plain AI drafts with KR-humanizer output, run `npx --yes github:kuseumkkrkkr/KR-humanizer cv --samples 3 --folds 3`. Keep each original/rewrite pair in one fold, present deterministic style metrics separately from blinded model judgment, and state that synthetic CV is not evidence of human preference or detector evasion.

## Boundaries

- Do not add facts or smooth over uncertainty.
- Do not treat style heuristics as definitive grammar errors.
- Do not send text to a separate model API. The CLI adapter may invoke the user's authenticated Codex or Claude Code process.
- Next-sentence autocomplete is Codex EXEC-only and its model is fixed in code. Do not offer a model override or silently accept a suggestion.
- Do not copy entire source documents into the vault. Store a short paraphrased rule, application boundary, source section, and URL. Do not present community Skill observations as Korean-language norms.
- mem0 is optional and must be a self-hosted localhost instance configured with local providers. The default memory store is local JSON.
