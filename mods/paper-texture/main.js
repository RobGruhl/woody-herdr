// The paper texture picker beside the tab bar: a button naming the paper
// behind the panes, and a dropdown of the textures paper-sync offers
// (shared("paper.textures")). The choice is kept in shared("paper.texture"),
// which paper-sync watches; it holds for light and dark, and survives restarts.
// Key commands: "paper-texture.next" and "paper-texture.prev" step through,
// "paper-texture.open" opens the dropdown.
// With { "ink": true } in its props (the paper-desk layout) the button is
// handwritten on a strip of masking tape and the dropdown is a sheet of paper:
// the textures typed in ink, the chosen one ticked.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, shared, setShared, openOverlay, closeOverlay, props, nextCommand, settings } from "herdr";

const CHOICE = "paper.texture";
const LIST = "paper.textures";
const ICONS = "mods/paper-texture";
const MENU_WIDTH = 250;
const ROW = 31;
const HAND = "Caveat Brush"; // mods/paper-pane/fonts

const textures = () => shared(LIST) ?? [];
const current = () => textures().find((x) => x.id === shared(CHOICE)) ?? textures()[0];

export default class PaperTexture extends View {
  init(p, cx) {
    // The dropdown is this mod opened as a popup: it has an overlay id.
    if (props()?.overlay ?? p?.overlay) {
      this.handle = cx.focus_handle();
      this.handle.focus();
      return;
    }
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "next") this.step(1);
        if (command === "prev") this.step(-1);
        if (command === "open") this.openMenu();
        cx.notify();
      }
    });
  }

  render() {
    return props()?.overlay ? this.menu() : this.button();
  }

  step(by) {
    const list = textures();
    if (!list.length) return;
    const i = Math.max(0, list.findIndex((x) => x.id === current()?.id));
    setShared(CHOICE, list[(i + by + list.length) % list.length].id);
  }

  // Under the button, right edges aligned; at the pointer until the button has been pressed once.
  openMenu() {
    const b = this.bounds;
    openOverlay({
      mod: "paper-texture", kind: "popup", width: MENU_WIDTH, height: 46 + Math.max(1, textures().length) * ROW,
      props: { ink: Boolean(props()?.ink), painted: Boolean(props()?.painted) },
      ...(b ? { at: { x: Math.max(8, b.x + b.width - MENU_WIDTH), y: b.y + b.height + 6 } } : {}),
    });
  }

  button() {
    const t = theme();
    const now = current();
    if (props()?.ink) {
      return h_flex().size_full().items_center().justify_end().pr(2).bg(t.chrome).border_b(1).border_color(t.border)
        .child(h_flex().id("paper-texture").flex_none().items_center().h(22).opacity(0.88).hover((s) => s.opacity(1))
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            if (e.bounds) this.bounds = e.bounds;
            this.openMenu();
          })
          // The tape's torn ends and colour are paper-pane's.
          .child(image("mods/paper-pane/tape-left.png").w(9).h(22).flex_none())
          .child(h_flex().h(22).px(3).gap(5).items_center().bg("#e6d6a2").font_family(HAND).text_size(16).text_color("#46352a")
            .child(svg("mods/paper-pane/ink/layers.svg").size(14).flex_none())
            .child(div().child(now?.short ?? "Paper"))
            .child(svg("mods/paper-pane/ink/chevron-down.svg").size(11).flex_none()))
          .child(image("mods/paper-pane/tape-right.png").w(9).h(22).flex_none()));
    }
    return h_flex().size_full().items_center().justify_end().pr(2).bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("paper-texture").h(26).px(8).gap(6).flex_none().items_center().rounded(6)
        .text_size(12.8).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          if (e.bounds) this.bounds = e.bounds;
          this.openMenu();
        })
        // { "painted": true } (the paper-grain layout): the brush-painted icons on Herdr's button.
        .child(svg(props()?.painted ? "mods/paper-pane/ink/layers.svg" : `${ICONS}/layers.svg`).size(14))
        .child(div().child(now?.short ?? "Paper"))
        .child(svg(props()?.painted ? "mods/paper-pane/ink/chevron-down.svg" : `${ICONS}/chevron-down.svg`).size(props()?.painted ? 11 : 12)));
  }

  menu() {
    const t = theme();
    const list = textures();
    const chosen = current()?.id;
    const pick = (id) => { setShared(CHOICE, id); closeOverlay(props().overlay); };
    // On the desk: a sheet of paper, ink and pencil in the terminal's own colours.
    const inked = Boolean(props()?.ink);
    const ink = t.terminal_foreground ?? t.foreground;
    const c = inked
      ? { sheet: t.background, text: ink, dim: ink + "99", hover: ink + "16", tick: settings().dark ? t.done : t.ansi12 }
      : { sheet: t.popover, text: t.foreground, dim: t.dim, hover: t.selected, tick: t.accent };
    return v_flex().id("paper-texture-menu").size_full().bg(c.sheet).p(5).text_size(12.8)
      .when(Boolean(this.handle), (el) => el.track_focus(this.handle))
      .on_key_down((e) => {
        const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
        if (list[n]) pick(list[n].id);
      })
      .child(inked
        ? div().px(9).pt(3).pb(3).font_family(HAND).text_size(16).text_color(c.dim).child("Paper behind the panes")
        : div().px(9).pt(6).pb(6).text_size(11).text_color(c.dim).child("Paper behind the panes"))
      .when(list.length === 0, (el) => el.child(div().px(9).py(6).text_color(c.dim).child("paper-sync isn't running")))
      .children(list.map((x, i) =>
        h_flex().id(`texture-${x.id}`).h(ROW).px(9).gap(10).rounded(7).items_center().flex_none()
          .text_color(c.text).hover((s) => s.bg(c.hover))
          .on_click(() => pick(x.id))
          .child(div().w(14).flex_none().when(x.id === chosen, (el) => el.child(svg(inked || props()?.painted ? "mods/paper-agents/ink-tick.svg" : `${ICONS}/check.svg`).size(14).text_color(c.tick))))
          .child(div().flex_1().truncate().child(x.name))
          .child(div().text_size(11).text_color(c.dim).child(i < 9 ? String(i + 1) : ""))));
  }
}
