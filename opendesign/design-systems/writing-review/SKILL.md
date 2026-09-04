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
- Use sentence case Korean labels and direct status messages.
- Never imply that a rewrite is accepted before the writer selects and applies it.
- Avoid gradients, emoji icons, excessive badges, and additional accent colors.
