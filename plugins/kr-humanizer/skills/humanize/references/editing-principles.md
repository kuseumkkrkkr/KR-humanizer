# Editing principles

Use these modes as editorial goals, not as copied product behavior.

- `weak` (약함): change only tone and sentence endings. Preserve sentence count, order, paragraph structure, facts, grammar, and even detected typos for the separate diagnosis step.
- `medium` (중간): add graph-based logic review and remove only formulaic AI phrasing, re-explanation, repetition, and over-explanation. Do not independently correct grammar.
- `strict` (엄격): add NIKL-grounded spelling and spacing plus detailed reasoning about particles, endings, subject-predicate agreement, modifier scope, references, and ambiguity.

## Product research translated into KR-humanizer

- QuillBot separates low-change fluency from formal, simple, shorten, and custom modes. KR-humanizer adopts only the low-risk idea of goal-specific modes.
  Source: https://help.quillbot.com/hc/en-us/articles/35854318883351-What-are-modes-in-the-QuillBot-Paraphraser-and-how-do-I-use-them
- Grammarly offers sentence-level tone suggestions to make writing sound more personable, positive, and confident. KR-humanizer uses this only as a prompt-level reader-reception check and never as a personality judgment.
  Source: https://support.grammarly.com/hc/en-us/articles/10674801783309-How-do-Grammarly-s-tone-suggestions-work
- Wordtune exposes formal/casual and shorten/expand controls. KR-humanizer adopts formality and safe shortening, but excludes expansion because it can invent unsupported details.
  Source: https://www.wordtune.com/rewrite
- LanguageTool separates standard checking from a stricter Picky Mode for formal contexts. KR-humanizer's `strict` mode similarly broadens review while keeping suggestions subject to explicit acceptance.
  Source: https://languagetool.org/insights/post/picky-mode/

Never claim feature parity with these products. Do not copy their prompts, proprietary rules, wording, or user interface.
