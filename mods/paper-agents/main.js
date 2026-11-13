// Agents by how long since you last looked at them, by priority, or grouped by space; in
// priority, parents take their most urgent sub-agent's place and a viewed done
// agent stays in Done until left.
//
// With { "cards": true } in its props (the paper-desk layout) each agent and terminal
// is a paper card on the frame: typed in ink, a strip of coloured ink down its edge for
// its space, how long in pencil, and the status as an ink mark: a ring that turns and
// darkens the longer the agent works, a tick when it's done, a NEEDS YOU rubber stamp.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, settings } from "herdr";

// The cards' type: headings in a printer's small caps, notes in a pencil hand.
// Both fonts are in mods/paper-pane/fonts.
const PRINT = "IM FELL English SC";
const HAND = "Caveat Brush";
// One ink per space, for the strip down a card's edge.
const INKS = ["#a8432c", "#2f5f76", "#6f7b35", "#b0832d", "#7a4460", "#3d7567", "#8b5a3a", "#4f5c8c"];
const inkOf = (id) => INKS[[...String(id ?? "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % INKS.length];
// How dark a working agent's ring is: thin ink at first, full after a quarter of an hour.
// Brush-painted icons for the cards (mods/paper-pane/ink), in place of Herdr's line icons.
const INK = "mods/paper-pane/ink";
const INK_SORT = { viewed: `${INK}/eye.svg`, priority: `${INK}/clock.svg`, grouped: `${INK}/layers.svg` };
const soak = (ms) => Math.round(255 * Math.min(1, 0.42 + 0.58 * (ms / 900000))).toString(16).padStart(2, "0");

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

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "viewed", label: "Least recently viewed", icon: "mods/paper-agents/eye.svg" },
  { id: "priority", label: "Priority", icon: "mods/workspace-chrome/clock.svg" },
  { id: "grouped", label: "Grouped by space", icon: "mods/workspace-chrome/layers.svg" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    // When you last looked at each agent (ms), kept across restarts.
    this.viewed = JSON.parse(localStorage.getItem("viewed") ?? "{}");
    // The agent you were on, so one you quit Herdr on counts as left at the next start.
    this.looking = localStorage.getItem("looking");
    this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Stamps an agent when you leave it for another, not when you arrive: the one
  // you're on keeps its place and drops to the end once you move off. Focus on
  // something that isn't an agent (a mod pane) doesn't count as leaving. A
  // sub-agent on show counts for the agent above it.
  look(list, all, now) {
    const listed = new Set(list.map((a) => a.address));
    let cur = list.find((a) => a.focused)?.address ?? focused()?.agent ?? null;
    for (let hops = 0; cur && !listed.has(cur) && hops < 16; hops++) cur = all.find((k) => k.address === cur)?.parent ?? null;
    if (!cur || !listed.has(cur) || cur === this.looking) return;
    if (this.looking) this.viewed[this.looking] = now;
    this.looking = cur;
    for (const [k, at] of Object.entries(this.viewed)) if (!listed.has(k) && now - at > 30 * 86400000) delete this.viewed[k];
    localStorage.setItem("viewed", JSON.stringify(this.viewed));
    localStorage.setItem("looking", cur);
  }

  seen(a) {
    return this.viewed[a.address] ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(props()?.cards ? INK_SORT[s.id] : s.icon).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg(props()?.cards ? "mods/paper-agents/ink-tick.svg" : "mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.peek(k.address))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // The cards' colours: paper, ink and pencil from the terminal's own theme.
  desk(t) {
    const ink = t.terminal_foreground ?? t.foreground;
    return { paper: t.background, ink, pencil: ink + "99", faint: ink + "16", dark: settings().dark };
  }

  // A status in ink. On a card (`d`) it's the ink of the card; off one, on the frame, the theme's colours.
  mark(t, a, compact, d) {
    const dark = d ? d.dark : true;
    if (a.status === "working") {
      const color = d ? d.ink + soak(Date.now() - this.since(a)) : t.working;
      return svg("mods/paper-agents/ink-ring.svg").size(16).flex_none().text_color(color).spin(1600);
    }
    if (a.status === "blocked" && (compact || !d)) return div().w(14).flex_none().text_center().font_family(HAND).text_size(21).line_height(18).text_color(d && !d.dark ? "#b3261a" : t.blocked).child("!");
    if (a.status === "blocked") return image(`mods/paper-agents/stamp-${dark ? "dark" : "light"}.png`).w(72).h(30).mr(-5).flex_none();
    if (a.status === "done") return svg("mods/paper-agents/ink-tick.svg").size(16).flex_none().text_color(d && !d.dark ? t.ansi12 : t.done);
    return svg("mods/paper-agents/ink-idle.svg").size(11).mx(2).flex_none().text_color(d ? d.pencil : t.idle ?? t.dim);
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false, d = null) {
    if (props()?.cards) return this.mark(t, a, compact, d);
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  // A list's heading: on the desk, printed small caps.
  heading(t, text) {
    if (props()?.cards) return div().font_family(PRINT).text_size(14).text_color(t.muted).child(text);
    return div().text_size(11.5).font_medium().text_color(t.dim).child(text);
  }

  // A paper card lying on the frame, a strip of its space's ink down the left edge.
  // The one you're on is lit; the others sit a little in shadow until hovered.
  card(d, id, on, space) {
    return h_flex()
      .id(id)
      .relative()
      .pl(13)
      .pr(8)
      .h(50)
      .mb(5)
      .flex_none()
      .rounded(2)
      .overflow_hidden()
      .items_center()
      .gap(9)
      .border_1()
      .border_color(d.ink + "30")
      .bg(on ? d.paper : d.paper + "c8")
      .when(on, (el) => el.shadow_md())
      .hover((el) => el.bg(on ? d.paper : d.paper + "e6"))
      .child(div().absolute().left(0).top(0).bottom(0).w(4).bg(inkOf(space)));
  }

  // Spaces with no agent in them: a shell you opened with the +, until Claude (or
  // another agent) starts in it and reports a status, which moves it to Agents.
  terminalsSection(t, collapsed, list, leads) {
    const agentSpaces = new Set(list.map((a) => a.space));
    const here = focused()?.space;
    const shells = spaces()
      .filter((s) => !agentSpaces.has(s.id))
      .map((s) => ({ s, lead: leads.get((s.tabs.find((tb) => tb.active) ?? s.tabs[0])?.id) }))
      .filter((x) => x.lead);
    const rows = shells.map(({ s, lead }, i) => {
      const pic = icon(lead.program, 16, t.foreground) ?? svg("mods/workspace-chrome/terminal.svg").size(16).flex_none().text_color(t.muted);
      const on = s.id === here;
      if (collapsed) {
        return h_flex()
          .id(`tm-${s.id}`)
          .h(26)
          .flex_none()
          .items_center()
          .justify_center()
          .when(on, (el) => el.bg(t.selected))
          .hover((el) => el.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: lead.pane }))
          .child(pic);
      }
      const d = props()?.cards ? this.desk(t) : null;
      const close = div()
        .id(`tm-close-${s.id}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(d ? d.pencil : t.dim)
        .cursor_pointer()
        .hover((el) => el.bg(d ? d.faint : t.hover).text_color(d ? d.ink : t.foreground))
        .tooltip("Close space")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("space.close", { id: s.id });
          this.hoveredShell = null;
          cx.notify();
        })
        .child(svg(d ? `${INK}/x.svg` : "mods/workspace-chrome/x.svg").size(d ? 11 : 13));
      return (d ? this.card(d, `tm-${s.id}`, on, s.id) : h_flex()
        .id(`tm-${s.id}`)
        .px(8)
        .h(46)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(on, (el) => el.bg(t.selected))
        .hover((el) => el.bg(t.hover)))
        .cursor_pointer()
        .on_hover((over, cx) => {
          if (over) this.hoveredShell = s.id;
          else if (this.hoveredShell === s.id) this.hoveredShell = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: lead.pane }))
        .child(d ? icon(lead.program, 16, d.ink) ?? svg(`${INK}/terminal.svg`).size(16).flex_none().text_color(d.pencil) : pic)
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().truncate().text_color(d ? d.ink : t.foreground).child(s.name || "Terminal"))
          .child(div().truncate().text_size(12).text_color(d ? d.pencil : t.dim).child(lead.program?.name ?? "Terminal")))
        .when(Boolean(s.machine), (el) => el.child(div().text_size(10).text_color(d ? d.pencil : t.dim).child(s.machine)))
        .when(this.hoveredShell === s.id, (el) => el.child(close));
    });
    if (collapsed) return rows.length ? v_flex().flex_none().children(rows) : null;
    return v_flex()
      .flex_none()
      .child(
        h_flex()
          .px(16)
          .h(41)
          .pt(14)
          .pb(5)
          .flex_none()
          .items_center()
          .justify_between()
          .child(this.heading(t, "Terminals"))
          .child(
            // A new space with a plain terminal, like Herdr's "New space".
            div()
              .id("tm-new")
              .size(22)
              .mr(-4)
              .flex()
              .items_center()
              .justify_center()
              .rounded(6)
              .text_color(t.dim)
              .hover((el) => el.bg(t.hover).text_color(t.foreground))
              .on_click(() => run("space.new"))
              .tooltip("New terminal")
              .child(svg(props()?.cards ? `${INK}/plus.svg` : "mods/workspace-chrome/plus.svg").size(props()?.cards ? 13 : 14)),
          ),
      )
      .when(rows.length > 0, (el) => el.child(v_flex().px(8).pb(4).children(rows)));
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.look(list, all, now);
    this.hold(list);
    const byPriority = sort.id === "priority";
    const byViewed = sort.id === "viewed";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    // Longest unseen first, whatever its state. The one you're on holds its place
    // and drops to the end when you leave it, so agent.next goes round them all.
    // Never-seen ones lead, oldest first.
    if (byViewed) list = [...list].sort((x, y) => this.seen(x) - this.seen(y) || x.seq - y.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(d ? d.pencil : open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(d ? d.faint : t.hover).text_color(d ? d.ink : t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`${d ? INK : "mods/workspace-chrome"}/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabLabels = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, title(tab, leads.get(tab.id))]));
    const labels = new Map(list.map(a => [a.address, tabLabels.get(a.tab) ?? (a.title || a.program?.name || "")]));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const d = props()?.cards ? this.desk(t) : null;
    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, d && !collapsed ? d.ink : t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const when = byViewed ? (a.focused ? 0 : this.seen(a)) : this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(d ? d.pencil : t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(d ? d.faint : t.hover).text_color(d ? d.ink : t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(d ? `${INK}/pin.svg` : `mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || byViewed || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      const fg = d ? d.ink : t.foreground;
      const dim = d ? d.pencil : t.dim;
      return (d ? this.card(d, `ag-${a.address}`, a.focused, a.space).h(full ? 50 : 34) : h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(full ? 46 : 30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover)))
        .cursor_pointer()
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        // Without a space header above, two lines: the space (repo), then what the
        // agent is doing (a named tab or its own title, e.g. Claude Code's /rename).
        .child(full
          ? v_flex().flex_1().min_w(0).gap(1)
            .child(div().truncate().text_color(idle ? (d ? d.ink + "c0" : t.muted) : fg).child(name))
            .child(div().truncate().text_size(12).text_color(dim).child(more ?? a.program?.name ?? ""))
          : h_flex().flex_1().min_w(0).gap(5).items_center()
            .child(div().min_w(0).max_w(200).truncate().text_color(idle ? (d ? d.ink + "c0" : t.muted) : fg).child(name)))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(dim).child(machine)))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address, el => el.child(pin))
        // On a card the time is a pencil note, and a stamp leaves no room for one.
        .when(this.hovered !== a.address && Boolean(when) && !(d && a.status === "blocked" && !(byPriority && !isPinned)), el => el.child(d
          ? div().flex_none().font_family(HAND).text_size(15).text_color(dim).child(duration(now - when))
          : div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(this.status(t, a, byPriority && !isPinned, d));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      if (byViewed) {
        if (groups.at(-1)?.id === "recent") groups.at(-1).members.push(a);
        else groups.push({ id: "recent", label: "Least recently viewed", status: null, members: [a] });
        continue;
      }
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).when(Boolean(d), (el) => el.font_family(PRINT).text_size(12.5)).child(g.label))
        .when(byPriority || byViewed || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg(`${d ? INK : "mods/workspace-chrome"}/chevron-right.svg`).size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    const shellSection = this.terminalsSection(t, collapsed, list, leads);
    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(Boolean(shellSection), (el) => el.child(shellSection))
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(this.heading(t, "Agents"))
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "paper-agents", kind: "popup", width: 200, height: 172, props: { sortMenu: true, cards: Boolean(props()?.cards) } }))
                .tooltip(`Sort agents: ${sort.label}`)
                .child(svg(props()?.cards ? INK_SORT[sort.id] : sort.icon).size(14)),
            ),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
