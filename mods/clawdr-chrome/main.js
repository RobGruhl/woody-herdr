import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export default class WorkspaceChrome extends View {
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    // { "painted": true } (the paper-grain layout): the brush-painted icons, nothing else changed.
    const inked = Boolean(props()?.print || props()?.painted);
    if (props()?.footer && props()?.print) {
      // The paper-desk layout's footer: two slips of paper typed in ink, like its cards and tabs.
      const ink = t.terminal_foreground ?? t.foreground, paper = t.background;
      const slip = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(9).gap(9).items_center().rounded(2)
        .border_1().border_color(ink + "30").bg(paper + "c8").text_color(dim ? ink + "99" : ink)
        .hover(s => s.bg(paper).text_color(ink)).cursor_pointer()
        .on_click(action).child(svg(`mods/paper-pane/ink/${icon}.svg`).size(14).flex_none())
        .when(!collapsed, el => el.child(label));
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(6).pb(8).gap(5).text_size(13)
        .child(slip("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(div().flex_1()).child(div().size(6).rounded_full().bg(t.accent))))
        .child(slip("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    if (props()?.footer) {
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/${inked ? "paper-pane/ink" : "clawdr-chrome"}/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(div().size(6).rounded_full().bg(t.accent))))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("mods/clawdr-chrome/clawd-ram-gpt.svg").w(33).h(18)).child(props()?.print
        // The paper-desk layout's header: the name in printer's small caps (mods/paper-pane/fonts).
        ? div().font_family("IM FELL English SC").text_size(18).text_color(t.foreground).child("Clawdr")
        : div().font_semibold().text_color(t.foreground).child("Clawdr"))))
      .when(!collapsed, el => el.child(this.button("search", svg(inked ? "mods/paper-pane/ink/search.svg" : "mods/clawdr-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg(inked ? "mods/paper-pane/ink/sidebar.svg" : "mods/clawdr-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}
