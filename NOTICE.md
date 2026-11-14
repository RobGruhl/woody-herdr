# Notice

Nine parts of this repository are modified copies of files from the Herdr desktop app (versions 0.1.9, 0.1.12, 0.1.13 and 0.1.15), which is licensed under the Apache License, Version 2.0. A copy of that licence is in [`LICENSE.herdr`](LICENSE.herdr).

- **`layouts/paper-grain.json`** is a copy of Herdr's `main` layout. Changes: the root theme pair, transparent terminals, a background image and a floating `paper-sync` block; the sidebar header and footer point at `clawdr-chrome`, the tab bar at `paper-tabs` and the status bar at `paper-status`, with props on those and on the `paper-agents`, `paper-pane` and `paper-texture` blocks; the agents list at `paper-agents`, the pane header at `paper-pane` and the Files and Changes panels at `paper-files` and `paper-changes`; the tab bar shares its row with the `paper-texture` and `appearance-toggle` blocks; the pane frames use a paper image as their background and square corners. `RECIPE.md` lists each change.
- **`mods/clawdr-chrome/`** is a copy of Herdr's `workspace-chrome` mod (its code and icons). Changes: the header row shows `clawd-ram-gpt.svg` at 33×18 instead of Herdr's logo, and the name "Clawdr" instead of "Herdr".
- **`mods/paper-agents/`** is a copy of Herdr 0.1.13's `agents` mod. Changes: a "Least recently viewed" sort, the default, which lists agents by when you last left them; two-line rows (space, then title) in the lists without space headers; sort icons given as full paths; a taller sort popup. `RECIPE.md` describes each change.
- **`mods/paper-pane/`** is a copy of Herdr 0.1.12's `pane` mod (its code and icons). Changes: the header is painted in the theme's `surface` instead of `background`, an agent's own terminal title replaces the program's name, and the name may be 360 px wide instead of 260.
- **`mods/paper-files/`** is a copy of Herdr 0.1.13's `files` mod (its code and icons). Changes: the panel is painted in the theme's `chrome` instead of `background`, and markdown files open rendered, with a Source/Preview switch and links that open files in the panel or pages in the browser.
- **`mods/paper-changes/`** is a copy of Herdr 0.1.13's `changes` mod (its code and icon). Change: the panel is painted in the theme's `chrome` instead of `background`.
- **`layouts/paper-desk.json`** is a copy of `layouts/paper-grain.json`, so of Herdr's `main` layout too. Changes: props on the `clawdr-chrome`, `paper-agents`, `paper-pane`, `paper-texture`, `appearance-toggle` and `paper-sync` blocks, a 32 px pane header, wider `texture` and `appearance` blocks, `paper-tabs` for the tab bar, `paper-status` for the status bar and `clawdr-chrome` for the sidebar footer (76 px).
- **`mods/paper-tabs/`** is a copy of Herdr 0.1.15's `tabs` mod (its code and icons). Changes: tabs are drawn as slips of paper with ink status marks, and the +, Files and Changes buttons as handwriting on strips of tape; with `plain` in its props they are drawn as Herdr's, with the ink marks and painted icons.
- **`mods/paper-status/`** is a copy of Herdr 0.1.15's `workspace-status` mod. Changes: its text is set in IM Fell English SC (not with `plain` in its props), and two of its icons are painted ones.

`mods/paper-pane/fonts/CaveatBrush-Regular.ttf` (Caveat Brush, copyright 2015 Google Inc.) and `mods/paper-pane/fonts/IMFeENsc28P.ttf` (IM Fell English SC, copyright 2010 Igino Marini) are unmodified and licensed under the SIL Open Font License 1.1; each font's licence is beside it.

The paper-desk look borrows ideas, not code or art, from three Herdr layouts: ink status marks and a turning ink ring from JZhouSaclay's Ink Study, masking-tape pane headers in a pencil hand and a mark that darkens as an agent works from isaacin42's Darkroom, and a sound of its own from adamentwistle's Departures. The marks, stamp, tape and sounds here are drawn and synthesised by `art/make-desk-art.py` and `sounds/make-sounds.sh`; the stamp's lettering is macOS's DIN Condensed Bold.

The twenty icons in `mods/paper-pane/ink/` were painted by OpenAI's gpt-image-2.6-sunburst as one sheet (`art/ink-icons/ink-icons-sheet.png`) and traced with potrace by `art/make-ink-icons.py`.

`mods/paper-agents/eye.svg` is Lucide's `eye` icon, licensed under the ISC License; a copy of that licence is in [`LICENSE.lucide`](LICENSE.lucide).

`mods/paper-texture/`'s three icons (`layers.svg`, `chevron-down.svg`, `check.svg`) are unmodified copies of icons from Herdr's `workspace-chrome` mod.

`mods/clawdr-chrome/clawd-ram-gpt.svg` is Clawd, the Claude Code icon Herdr ships at `~/.config/herdr-app/icons/claude.svg`, with ram horns. `art/make-clawd-target.py` redraws the icon on its pixel grid. gpt-image-2 added the horns (`art/clawd-ram-gpt.png`), and `art/sample-clawd-grid.py` sampled that picture back onto the grid.

The terminal colours use the Gruvbox palette by Pavel Pertsev, taken from Ghostty's bundled Gruvbox Light theme.
