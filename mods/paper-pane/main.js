// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "paper-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.
//
// With { "tape": true } in the header's props (the paper-desk layout) the header is
// drawn on the paper instead: the name handwritten on a strip of masking tape, the
// folder in pencil beside it, and the status as an ink mark (a turning ring, a
// tick, a NEEDS YOU rubber stamp).
// With { "painted": true } instead (the paper-grain layout) the header is drawn as
// Herdr's, with the same ink marks for the status and the brush-painted buttons.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, settings } from "herdr";

const HAND = "Caveat Brush"; // fonts/CaveatBrush-Regular.ttf
const TAPE = "#e6d6a2"; // the torn ends, tape-left.png and tape-right.png, are this colour
const TAPE_INK = "#46352a";

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// An agent's own title (Claude Code's /rename, or its topic), when it says more than
// the program's name: no leading spinner glyph, not a path, not user@host.
function told(p) {
  const live = (p.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (!live || live === p.program?.name || live.toLowerCase() === p.program?.key) return null;
  return /^[~/]|^[A-Za-z]:\\/.test(live) || live.includes("@") ? null : live;
}

// Whether a "#rrggbb" colour is a dark one, to pick the stamp that shows on it.
function darkish(hex) {
  const n = parseInt(String(hex ?? "").slice(1, 7), 16);
  if (Number.isNaN(n)) return false;
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 128;
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/paper-pane/${icon}.svg`).size(icon.startsWith("ink/") ? 13 : 14));
  }

  // On the paper: masking tape, pencil and ink.
  tape(t, p, name) {
    const dark = settings().dark;
    const ink = t.terminal_foreground ?? t.foreground;
    const pencil = ink + "99";
    const st = p.status;
    const pane = p.pane;
    const pic = icon(p.program, 14, TAPE_INK);
    const button = (id, icon, command, args) => this.button({ dim: pencil, hover: ink + "1a", foreground: ink }, id, icon, command, args);
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .pl(8)
      .pr(10)
      .gap(9)
      .items_center()
      .border_b(1)
      .border_color(ink + "24")
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .child(h_flex().flex_none().items_center().h(22)
        .child(image("mods/paper-pane/tape-left.png").w(9).h(22).flex_none())
        .child(h_flex().h(22).pl(3).pr(5).gap(6).items_center().bg(TAPE)
          .when(Boolean(pic), (el) => el.child(pic))
          .child(div().max_w(360).truncate().font_family(HAND).text_size(16).text_color(TAPE_INK).child(name)))
        .child(image("mods/paper-pane/tape-right.png").w(9).h(22).flex_none()))
      .child(div().flex_1().truncate().font_family(HAND).text_size(15).text_color(pencil).child(folder(p.cwd)))
      .when(st === "working", el => el.child(svg("mods/paper-agents/ink-ring.svg").size(15).flex_none().text_color(ink).spin(1600)))
      .when(st === "blocked", el => el.child(image(`mods/paper-agents/stamp-${dark ? "dark" : "light"}.png`).w(67).h(28).flex_none()))
      .when(st === "done", el => el.child(svg("mods/paper-agents/ink-tick.svg").size(16).flex_none().text_color(dark ? t.done : t.ansi12)))
      .when(this.hovered, el => el
        // The brush-painted icons, in ink/.
        .child(button(`ph-r-${pane}`, "ink/split-right", "pane.split", { direction: "right", pane }))
        .child(button(`ph-d-${pane}`, "ink/split-down", "pane.split", { direction: "down", pane }))
        .child(button(`ph-z-${pane}`, p.zoomed ? "ink/unzoom" : "ink/zoom", "pane.zoom", { pane }))
        .child(button(`ph-x-${pane}`, "ink/x", "pane.close", { pane })));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = (p.program?.agent && told(p)) || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    if (props()?.tape) return this.tape(t, p, name);
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    const painted = Boolean(props()?.painted);
    const b = (name) => (painted ? `ink/${name === "close" ? "x" : name}` : name);
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.surface)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(360).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      // Painted: the ink marks, in the theme's colours since the header isn't paper.
      .when(painted && st === "working", el => el.child(svg("mods/paper-agents/ink-ring.svg").size(15).flex_none().text_color(t.working).spin(1600)))
      .when(painted && st === "blocked", el => el.child(image(`mods/paper-agents/stamp-${darkish(t.surface) ? "dark" : "light"}.png`).w(62).h(26).flex_none()))
      .when(painted && st === "done", el => el.child(svg("mods/paper-agents/ink-tick.svg").size(16).flex_none().text_color(t.done)))
      .when(!painted && st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(!painted && st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(!painted && st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, b("split-right"), "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, b("split-down"), "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, b(p.zoomed ? "unzoom" : "zoom"), "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, b("close"), "pane.close", { pane })));
  }
}
