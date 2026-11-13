// A sun/moon button beside the tab bar that flips settings.json's appearance
// between light and dark: the sun while dark (click for light), the moon while
// light. Right-click hands appearance back to the system. Key commands:
// "appearance-toggle.toggle" flips, "appearance-toggle.system" follows the system.
// With { "ink": true } in its props (the paper-desk layout) the sun or moon is
// brushed in ink on a strip of masking tape.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, settings, appHome, readTextFile, writeTextFile, nextCommand, props } from "herdr";

const ICONS = "mods/appearance-toggle";

export default class AppearanceToggle extends View {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "toggle") this.flip(cx);
        if (command === "system") this.followSystem(cx);
      }
    });
  }

  render(cx) {
    const t = theme();
    const dark = Boolean(settings().dark);
    const stop = (_e, cx) => cx.stop_propagation();
    if (props()?.ink) {
      return h_flex().size_full().items_center().justify_center().bg(t.chrome).border_b(1).border_color(t.border)
        .child(h_flex().id("appearance-toggle").flex_none().items_center().h(22).opacity(0.88).hover((s) => s.opacity(1))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => this.flip(cx))
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.followSystem(cx); })
          // The tape's torn ends and colour are paper-pane's.
          .child(image("mods/paper-pane/tape-left.png").w(9).h(22).flex_none())
          .child(h_flex().h(22).px(1).items_center().bg("#e6d6a2").text_color("#46352a")
            .child(svg(`${ICONS}/ink-${dark ? "sun" : "moon"}.svg`).size(16)))
          .child(image("mods/paper-pane/tape-right.png").w(9).h(22).flex_none()));
    }
    return h_flex().size_full().items_center().justify_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(div().id("appearance-toggle").size(26).flex_none().flex().items_center().justify_center().rounded(6)
        .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => this.flip(cx))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.followSystem(cx); })
        .child(svg(`${ICONS}/${dark ? "sun" : "moon"}.svg`).size(15)));
  }

  flip(cx) {
    const dark = Boolean(settings().dark);
    this.change((p) => { p.appearance = dark ? "light" : "dark"; }, cx);
  }

  followSystem(cx) {
    this.change((p) => { delete p.appearance; }, cx);
  }

  // Read, change, write back only if nobody changed the file meanwhile (as Settings does).
  change(edit, cx) {
    cx.spawn(async () => {
      const file = `${appHome()}/settings.json`;
      for (let attempt = 0; attempt < 3; attempt++) {
        const raw = await readTextFile(file);
        const next = raw ? JSON.parse(raw) : {};
        edit(next);
        try {
          await writeTextFile(file, JSON.stringify(next, null, 2) + "\n", raw);
          return;
        } catch {}
      }
    });
  }
}
