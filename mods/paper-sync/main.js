// Keeps a paper layout's backgrounds on the images for the current
// look: behind the panes, the paper for the chosen texture and the appearance
// (light or dark), and behind the frame the image for the light theme in use
// (those themes' chrome is see-through so it shows). The textures are listed
// for the paper-texture dropdown in shared("paper.textures"), and the choice
// comes back in shared("paper.texture"). It sits in the layout as a floating
// block that draws nothing, and rewrites the layout file when the look changes:
// paper-grain's, or the one named in its props ({ "layout": "paper-desk" }).
import { View, div } from "gpui-kit";
import { settings, appHome, readTextFile, writeTextFile, shared, setShared, props } from "herdr";

// ids are saved in shared.json: keep them when renaming. Each look is an image
// path or a plain "#rrggbb" (the colours the papers are rendered on, rather
// than the theme's background, which is walnut in some versions of the theme).
const TEXTURES = [
  { id: "shader", name: "Shader paper", short: "Shader",
    light: "backgrounds/paper-light-f4e8d8.png", dark: "backgrounds/paper-dark.png" },
  { id: "parchment-fibre", name: "Parchment, fibre", short: "Fibre",
    light: "backgrounds/paper-light-gen-v1.png", dark: "backgrounds/paper-dark-gen-v1.png" },
  { id: "parchment-mottled", name: "Parchment, mottled", short: "Mottled",
    light: "backgrounds/paper-light-gen-v2.png", dark: "backgrounds/paper-dark-gen-v2.png" },
  { id: "parchment-fine", name: "Parchment, fine", short: "Fine",
    light: "backgrounds/paper-light-gen-v3.png", dark: "backgrounds/paper-dark-gen-v3.png" },
  { id: "plain", name: "Plain, no texture", short: "Plain", light: "#f4e8d8", dark: "#17191d" },
];
const MENU = TEXTURES.map(({ id, name, short }) => ({ id, name, short }));
const FRAMES = {
  "gruvbox-light": { image: "backgrounds/wood-light.png", fit: "cover" },
  "gruvbox-light-steel": { image: "backgrounds/steel-light.png", fit: "cover" },
  "walnut-parchment": { image: "backgrounds/walnut.png", fit: "cover" },
};

function lookNow() {
  const s = settings();
  const texture = TEXTURES.find((x) => x.id === shared("paper.texture")) ?? TEXTURES[0];
  const paper = s.dark ? texture.dark : texture.light;
  const pane = paper.startsWith("#") ? paper : { image: paper, fit: "cover" };
  if (s.dark) return { root: "canvas", pane };
  return { root: FRAMES[s.theme] ?? "canvas", pane };
}

export default class PaperSync extends View {
  init() {
    if (JSON.stringify(shared("paper.textures")) !== JSON.stringify(MENU)) setShared("paper.textures", MENU);
  }

  render(cx) {
    const want = JSON.stringify(lookNow());
    if (want !== this.want) {
      this.want = want;
      cx.spawn(async () => this.apply());
    }
    return div();
  }

  async apply() {
    const path = `${appHome()}/layouts/${props()?.layout ?? "paper-grain"}.json`;
    // A write is refused if the file changed since it was read; read again.
    for (let attempt = 0; attempt < 3; attempt++) {
      const text = await readTextFile(path);
      if (text === null) return;
      const layout = JSON.parse(text);
      const pane = findNode(layout, "main")?.content?.pane;
      if (!pane) return;
      const look = JSON.parse(this.want);
      if (same(layout.background, look.root) && same(pane.background, look.pane)) return;
      layout.background = look.root;
      pane.background = look.pane;
      try {
        await writeTextFile(path, JSON.stringify(layout, null, 2), text);
        return;
      } catch (err) {
        console.log(`paper-sync: retrying after ${err}`);
      }
    }
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}
