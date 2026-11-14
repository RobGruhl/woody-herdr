// Herdr's tab bar for the paper-desk layout, in paper and ink: each tab is a slip of
// paper typed in ink, with the status as an ink mark (a turning ring, a tick, a red !),
// and the +, Files and Changes buttons are handwritten on strips of masking tape.
// Everything else (drag to reorder, double-click to rename, the panel remembered per
// space) is Herdr's.
//
// With { "plain": true } in its props (the paper-grain layout) the tabs and buttons
// are drawn as Herdr's, keeping the ink marks (in the theme's colours) and the
// brush-painted icons.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings, props } from "herdr";

const HAND = "Caveat Brush"; // mods/paper-pane/fonts
const TAPE = "#e6d6a2"; // the colour of the torn ends, mods/paper-pane/tape-*.png
const TAPE_INK = "#46352a";
const INK = "mods/paper-pane/ink"; // brush-painted icons

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const dark = settings().dark;
    const plain = Boolean(props()?.plain);
    const paper = t.background, ink = t.terminal_foreground ?? t.foreground, pencil = ink + "99";
    // A strip of masking tape with torn ends; one in use is stuck down flat, the others are a little faded.
    const tape = (id, on) => (...inside) => h_flex().id(id).flex_none().items_center().h(22).mx(2)
      .opacity(on ? 1 : 0.88).hover(s => s.opacity(1)).on_mouse_down("left", stop)
      .child(image("mods/paper-pane/tape-left.png").w(9).h(22).flex_none())
      .child(h_flex().h(22).px(3).gap(5).items_center().bg(TAPE).font_family(HAND).text_size(16).text_color(TAPE_INK).children(inside))
      .child(image("mods/paper-pane/tape-right.png").w(9).h(22).flex_none());
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(plain ? 29 : 28).px(10).gap(7).rounded(plain ? 7 : 2).items_center().flex_none().text_size(12.8)
        // A rename or status mark on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .when(plain, el => el.border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
          .hover(s => s.bg(t.hover)))
        .when(!plain, el => el.border(1).border_color(ink + "30").bg(c.active ? paper : paper + "c8").text_color(c.active ? ink : ink + "c0")
          .when(c.active, el => el.shadow_md())
          .hover(s => s.bg(c.active ? paper : paper + "e6")))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(plain ? t.muted : pencil) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/paper-agents/ink-ring.svg").size(14).flex_none().text_color(plain ? t.working : ink).spin(1600)))
        .when(c.status === "blocked", el => el.child(div().flex_none().font_family(HAND).text_size(20).line_height(16).text_color(plain || dark ? t.blocked : "#b3261a").child("!")))
        .when(c.status === "done", el => el.child(svg("mods/paper-agents/ink-tick.svg").size(14).flex_none().text_color(plain || dark ? t.done : t.ansi12)))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(plain ? t.dim : pencil).hover(s => s.text_color(plain ? t.foreground : ink)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg(`${INK}/x.svg`).size(11))));
    };
    const newTab = () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = Boolean(panel && !panel.hidden && body?.active === id);
      const strip = plain
        ? h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
          .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
          .hover(s => s.bg(t.hover)).on_mouse_down("left", stop).child(svg(icon).size(14).flex_none()).child(label)
        : tape(`panel-${id}`, on)(svg(icon).size(14).flex_none(), label);
      return strip
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        });
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(plain ? 3 : 5).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(plain ? 3 : 5).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(plain ? button("tab-new", svg(`${INK}/plus.svg`).size(13), newTab) : tape("tab-new", false)(svg(`${INK}/plus.svg`).size(13).mx(2).flex_none()).on_click(newTab))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", `${INK}/file.svg`)))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", `${INK}/branch.svg`)))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/paper-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/paper-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/paper-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
