#!/usr/bin/env bash
# Usage: sounds/make-sounds.sh
#
# Synthesises the paper-desk layout's two alert sounds with ffmpeg (brew install ffmpeg):
#
#   desk-bell.mp3    a counter bell, for an agent that needs you: one strike, four
#                    partials of a struck bell, the high ones dying first
#   wood-knock.mp3   two knuckle knocks on wood, for an agent that finished
#
# Herdr plays them when settings.json names them:
#   "sounds": { "enabled": true, "blocked": "sounds/desk-bell.mp3", "done": "sounds/wood-knock.mp3" }
set -euo pipefail
cd "$(dirname "$0")"

bell='(1-exp(-900*t))*(0.50*sin(2*PI*1568*t)*exp(-2.6*t)+0.26*sin(2*PI*4327*t)*exp(-4.5*t)+0.12*sin(2*PI*8467*t)*exp(-8*t)+0.05*sin(2*PI*14002*t)*exp(-14*t))'
ffmpeg -v error -y -f lavfi -i "aevalsrc='${bell}':d=1.8:s=44100" -af "afade=t=out:st=1.5:d=0.3,volume=-9dB" -c:a libmp3lame -q:a 3 desk-bell.mp3

# One knock: the board's low resonances and a short click of noise, gone in a tenth of a second.
knock() { echo "(0.8*sin(2*PI*185*($1))+0.45*sin(2*PI*410*($1))+0.18*sin(2*PI*830*($1))+0.25*(random(0)*2-1)*exp(-260*($1)))*exp(-42*($1))*gte($1,0)"; }
ffmpeg -v error -y -f lavfi -i "aevalsrc='$(knock t)+0.8*$(knock 't-0.17')':d=0.55:s=44100" -af "lowpass=f=2400,volume=-7dB" -c:a libmp3lame -q:a 3 wood-knock.mp3
