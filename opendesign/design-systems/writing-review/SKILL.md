---
name: kr-humanizer-writing-review-design
description: Apply the existing KR-humanizer local writing review visual system to product UI changes.
---

# KR-humanizer writing review design

Use the tokens in `tokens/colors_and_type.css`. Preserve the warm paper canvas, white review panels, dark ink text, restrained green actions, and red/green textual diffs.

- Prioritize legible Korean prose and explicit review state over decoration.
- Keep controls at least 44px tall on mobile.
- Present sentence changes as Git-like unified hunks by default: red `-` source, green `+` proposal, with word-level emphasis and an optional split view.
- Keep accept and reject as explicit per-hunk decisions; never infer acceptance from viewing a suggestion.
- Put an editable context graph before the Diff when the writer plans or restructures prose. Each node needs a role, editable label, inclusion state, and simple reorder controls.
- Present explanation depth as a restrained three-option segmented control: 최저, 중간, 최대. Make clear that depth never authorizes invented facts.
- Enable Plan mode only after a writing brief exists; show why it is disabled instead of hiding it.
- Use sentence case Korean labels and direct status messages.
- Never imply that a rewrite is accepted before the writer selects and applies it.
- Avoid gradients, emoji icons, excessive badges, and additional accent colors.
