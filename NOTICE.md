# Notice

Six parts of this repository are modified copies of files from the Herdr desktop app (versions 0.1.9, 0.1.12 and 0.1.13), which is licensed under the Apache License, Version 2.0. A copy of that licence is in [`LICENSE.herdr`](LICENSE.herdr).

- **`layouts/paper-grain.json`** is a copy of Herdr's `main` layout. Changes: the root theme pair, transparent terminals, a background image and a floating `paper-sync` block; the sidebar header points at `clawdr-chrome`, the agents list at `paper-agents`, the pane header at `paper-pane` and the Files and Changes panels at `paper-files` and `paper-changes`; the tab bar shares its row with the `paper-texture` and `appearance-toggle` blocks; the pane frames use a paper image as their background and square corners. `RECIPE.md` lists each change.
- **`mods/clawdr-chrome/`** is a copy of Herdr's `workspace-chrome` mod (its code and icons). Changes: the header row shows `clawd-ram-gpt.svg` at 33×18 instead of Herdr's logo, and the name "Clawdr" instead of "Herdr".
- **`mods/paper-agents/`** is a copy of Herdr 0.1.13's `agents` mod. Changes: a "Least recently viewed" sort, the default, which lists agents by when you last left them; two-line rows (space, then title) in the lists without space headers; sort icons given as full paths; a taller sort popup. `RECIPE.md` describes each change.
- **`mods/paper-pane/`** is a copy of Herdr 0.1.12's `pane` mod (its code and icons). Changes: the header is painted in the theme's `surface` instead of `background`, an agent's own terminal title replaces the program's name, and the name may be 360 px wide instead of 260.
- **`mods/paper-files/`** is a copy of Herdr 0.1.13's `files` mod (its code and icons). Changes: the panel is painted in the theme's `chrome` instead of `background`, and markdown files open rendered, with a Source/Preview switch and links that open files in the panel or pages in the browser.
- **`mods/paper-changes/`** is a copy of Herdr 0.1.13's `changes` mod (its code and icon). Change: the panel is painted in the theme's `chrome` instead of `background`.

`mods/paper-agents/eye.svg` is Lucide's `eye` icon, licensed under the ISC License; a copy of that licence is in [`LICENSE.lucide`](LICENSE.lucide).

`mods/paper-texture/`'s three icons (`layers.svg`, `chevron-down.svg`, `check.svg`) are unmodified copies of icons from Herdr's `workspace-chrome` mod.

`mods/clawdr-chrome/clawd-ram-gpt.svg` is Clawd, the Claude Code icon Herdr ships at `~/.config/herdr-app/icons/claude.svg`, with ram horns. `art/make-clawd-target.py` redraws the icon on its pixel grid. gpt-image-2 added the horns (`art/clawd-ram-gpt.png`), and `art/sample-clawd-grid.py` sampled that picture back onto the grid.

The terminal colours use the Gruvbox palette by Pavel Pertsev, taken from Ghostty's bundled Gruvbox Light theme.
