#!/bin/sh
#
# send-to-other.sh <this home> <terminal> <its tab>
#
# Moves a terminal from this Herdr window to the other one (herdr-app-2, the
# second window for a second monitor), without ending it. The pane header's
# monitor button runs this.
#
# Both windows show the same spaces and tabs, so "the other window" means the
# tab that window is showing: the terminal lands there, to the right of its
# focused pane. If the other window is showing this terminal's own tab, the
# terminal gets a new tab instead, named after the other window ("Clawdr 2",
# or "Clawdr 1" when sent from the second window), and that window shows it.
#
# Herdr has no command that moves a pane to another tab. terminal.park takes
# the pane away and leaves the terminal running; terminal.keep, sent to the
# other window, gives it a pane where that window is looking.
#
# The checks run first and report on stderr with a nonzero exit. The move
# itself runs in the background, because parking the pane ends the header
# that started this script.

set -u

this="${1:?this home}"
terminal="${2:?terminal}"
tab="${3:?tab}"

case "$this" in
  *-2) other="${this%-2}"; other_name="Clawdr 1" ;;
  *)   other="$this-2"; other_name="Clawdr 2" ;;
esac

PATH="$PATH:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin"
app() { home="$1"; shift; HERDR_APP_HOME="$home" herdr-app "$@"; }

if [ ! -d "$other" ]; then
  echo "There is no second window yet: run herdr-app-2" >&2
  exit 2
fi
if ! status="$(app "$other" status 2>/dev/null)"; then
  echo "The other window isn't open: run herdr-app-2" >&2
  exit 2
fi
other_tab="$(printf '%s\n' "$status" | sed -n 's/^ *"tab": "\(.*\)",*$/\1/p' | head -1)"

place=right
if [ "$other_tab" = "$tab" ] || [ -z "$other_tab" ]; then
  # Alone in a tab both windows show: it is already on the other screen.
  if [ "$(app "$this" ls | awk -v tab="$tab" '
        /"id": "tb/ { here = index($0, "\"" tab "\"") > 0 }
        here && /"terminal": "/ { n++ }
        END { print n + 0 }')" -le 1 ]; then
    echo "The other window is already showing this terminal" >&2
    exit 3
  fi
  place=tab
fi

shown() { app "$1" ls 2>/dev/null | grep -q "\"terminal\": \"$terminal\""; }
# Wait (up to $2 quarter seconds) until window $1 lists the terminal ($3 = yes) or doesn't (no).
settle() {
  i=0
  while [ "$i" -lt "$2" ]; do
    if shown "$1"; then [ "$3" = yes ] && return 0; else [ "$3" = no ] && return 0; fi
    sleep 0.25
    i=$((i + 1))
  done
  return 1
}

(
  app "$this" do terminal.park --terminal "$terminal" || exit 1
  # Parking is acknowledged before it happens, and each window learns of it
  # separately. A keep sent before both have is lost: the terminal is left
  # running with no pane. So wait for both, keep, and check that it took.
  settle "$this" 40 no
  settle "$other" 40 no
  sleep 0.5
  try=0
  while [ "$try" -lt 3 ]; do
    kept="$(app "$other" do terminal.keep --terminal "$terminal" --place "$place")"
    if settle "$other" 12 yes && settle "$this" 12 yes; then
      new_tab="$(printf '%s\n' "$kept" | sed -n 's/^ *"tab": "\(.*\)",*$/\1/p' | head -1)"
      [ "$place" = tab ] && [ -n "$new_tab" ] && app "$other" do tab.rename --id "$new_tab" --name "$other_name"
      exit 0
    fi
    try=$((try + 1))
  done
  # Never leave it without a pane: put it back in this window.
  app "$this" do terminal.keep --terminal "$terminal" --place tab
) </dev/null >/dev/null 2>&1 &

exit 0
