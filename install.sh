#!/usr/bin/env bash
#
# install.sh — add the woody-herdr look to the Herdr desktop app.
#
# Copies the paper-grain layout, its eight mods, three themes and the
# background images into Herdr's home (~/.config/herdr-app, or
# $HERDR_APP_HOME), installs the Claude launcher into ~/.local/bin, then
# switches the window to the layout. The Claude Code parchment theme goes
# into ~/.claude/themes (or $CLAUDE_CONFIG_DIR/themes). It never overwrites: if anything it
# would write already exists, it stops before copying and lists what's there.
# settings.json is yours, so the keys to add are printed, not written.

set -euo pipefail

src="$(cd "$(dirname "$0")" && pwd)"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
bin="$HOME/.local/bin"
claude_themes="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/themes"

if [ ! -d "$home" ]; then
  echo "No Herdr home at $home. Open the Herdr app once, then run this again." >&2
  exit 1
fi

# The herdr-app command: Homebrew's link, the app's own ~/.local/bin link, or the app itself.
app=$(command -v herdr-app || true)
if [ -z "$app" ]; then
  for a in /Applications/Herdr.app "$HOME/Applications/Herdr.app"; do
    if [ -x "$a/Contents/MacOS/Herdr" ]; then app="$a/Contents/MacOS/Herdr"; break; fi
  done
fi
if [ -z "$app" ]; then
  echo "Can't find the Herdr app. Install it (brew install --cask herdr-app), open it once, then run this again." >&2
  exit 1
fi

mods=(paper-sync paper-texture appearance-toggle clawdr-chrome paper-agents paper-pane paper-files paper-changes)
targets=(layouts/paper-grain.json layouts/paper-grain.png
         themes/walnut-parchment.json themes/gruvbox-light.json themes/gruvbox-light-steel.json)
for mod in "${mods[@]}"; do targets+=("mods/$mod"); done
for f in "$src"/backgrounds/*; do targets+=("backgrounds/$(basename "$f")"); done

taken=()
for t in "${targets[@]}"; do [ -e "$home/$t" ] && taken+=("$home/$t"); done
[ -e "$bin/claude-herdr-app" ] && taken+=("$bin/claude-herdr-app")
[ -e "$claude_themes/parchment.json" ] && taken+=("$claude_themes/parchment.json")
if [ ${#taken[@]} -gt 0 ]; then
  echo "Stopped: these already exist, and install.sh never overwrites."
  printf '  %s\n' "${taken[@]}"
  echo "Rename or remove them (or merge by hand), then run it again."
  exit 1
fi

# Images and themes first, so nothing that names them loads before they exist.
mkdir -p "$home/backgrounds" "$home/themes" "$home/layouts" "$home/mods"
cp "$src"/backgrounds/* "$home/backgrounds/"
cp "$src"/themes/*.json "$home/themes/"

# Each mod's mod.json goes in before its code: Herdr docks a new mod folder
# that has no mod.json into the window as a panel the moment it sees it.
for mod in "${mods[@]}"; do
  mkdir -p "$home/mods/$mod"
  cp "$src/mods/$mod/mod.json" "$home/mods/$mod/"
  cp "$src/mods/$mod/"* "$home/mods/$mod/"
done

# The layout last, once everything it uses is in place.
cp "$src/layouts/paper-grain.png" "$home/layouts/"
cp "$src/layouts/paper-grain.json" "$home/layouts/"

mkdir -p "$bin"
install -m 755 "$src/bin/claude-herdr-app" "$bin/claude-herdr-app"
mkdir -p "$claude_themes"
cp "$src/claude/themes/parchment.json" "$claude_themes/"

if [ -e "$home/programs.json" ]; then
  programs="programs.json exists, so it was left alone. To start Claude Code with the launcher from
Herdr's + menu, add this inside its \"programs\":
    \"claude\": { \"run\": [\"claude-herdr-app\"] }"
else
  cp "$src/programs.json" "$home/programs.json"
  programs="programs.json added: Herdr's + menu now starts Claude Code with claude-herdr-app."
fi

for mod in "${mods[@]}"; do
  "$app" check "$home/mods/$mod" >/dev/null || echo "herdr-app check failed for $mod; see: herdr-app check $home/mods/$mod" >&2
done
"$app" do layout.switch '{"name":"paper-grain"}' >/dev/null 2>&1 \
  || echo "Couldn't switch layouts (is Herdr open?). In Herdr: ctrl-shift-l until you reach paper-grain."

notes=""
# Herdr's + menu runs claude-herdr-app through your login shell, so ~/.local/bin has to be on its PATH.
shell="${SHELL:-/bin/zsh}"
if ! "$shell" -lic 'command -v claude-herdr-app' </dev/null >/dev/null 2>&1; then
  notes+="
$bin isn't on your login shell's PATH, so Herdr's + menu can't find claude-herdr-app.
Add this line to ~/.zprofile (zsh, the macOS default), then quit and reopen Herdr:
  export PATH=\"\$HOME/.local/bin:\$PATH\"
"
fi
if ! "$shell" -lic 'command -v claude' </dev/null >/dev/null 2>&1; then
  notes+="
Claude Code isn't installed, so the + menu's Claude won't start. Install it with
  brew install --cask claude-code
then run claude once in a terminal to sign in.
"
fi

cat <<EOF

Installed into $home.
$programs
$notes
Now add these to $home/settings.json (keep your other keys):

  "font": "Berkeley Mono Dotted",
  "ui_font": "Berkeley Mono Dotted",
  "minimum_contrast": 1.0

minimum_contrast is Herdr's default; keep it at 1.0, the value the look was
made with (above it, Herdr swaps low-contrast text colours for near-black or
near-white). Berkeley Mono is a paid font; without it, use any monospace you
have, or leave font and ui_font out.

Light/dark: the sun/moon button at the right end of the tab bar (right-click
to follow macOS). Restart Claude Code sessions after switching so they pick up
matching colours. Paper texture: the dropdown just left of the sun/moon
button. ctrl-shift-l switches back to your previous layout.
EOF
