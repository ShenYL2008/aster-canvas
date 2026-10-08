import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(
  process.env.CANVAS_MODULE || "@napi-rs/canvas",
);
globalThis.document = { createElement: () => createCanvas(1, 1) };
globalThis.Image = Image;
const {
  surface,
  layer,
  composite,
  copyPixels,
  History,
  serialize,
  deserialize,
} = await import("../src/engine.js");
const { DemoProvider, HttpProvider } = await import("../src/providers.js");
const pixel = (c, x = 4, y = 4) =>
  Array.from(c.getContext("2d").getImageData(x, y, 1, 1).data);
const paint = (l, color) => {
  const g = l.pixels.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, l.pixels.width, l.pixels.height);
};
const fixture = () => {
  const l = layer(16, 16, "Base");
  paint(l, "red");
  return { width: 16, height: 16, layers: [l], active: l.id };
};
test("layer ordering, visibility and opacity affect composition", () => {
  const d = fixture(),
    top = layer(16, 16, "Top");
  paint(top, "blue");
  d.layers.push(top);
  assert.deepEqual(pixel(composite(d)), [0, 0, 255, 255]);
  top.visible = false;
  assert.deepEqual(pixel(composite(d)), [255, 0, 0, 255]);
  top.visible = true;
  top.opacity = 0.5;
  const px = pixel(composite(d));
  assert.ok(px[0] > 120 && px[2] > 120);
  d.layers.reverse();
  assert.deepEqual(pixel(composite(d)), [255, 0, 0, 255]);
});
test("mask is non-destructive and preserves pixels outside selection", () => {
  const d = fixture();
  d.layers[0].mask = { x: 0, y: 0, w: 8, h: 8 };
  assert.equal(pixel(composite(d), 12, 12)[3], 0);
  assert.equal(pixel(d.layers[0].pixels, 12, 12)[3], 255);
  d.layers[0].mask = null;
  assert.equal(pixel(composite(d), 12, 12)[3], 255);
});
test("brightness adjustment does not bake into original pixels", () => {
  const d = fixture();
  d.layers[0].filters.brightness = 0;
  assert.deepEqual(pixel(composite(d)), [0, 0, 0, 255]);
  assert.deepEqual(pixel(d.layers[0].pixels), [255, 0, 0, 255]);
});
test("undo/redo preserves pixels, mask and AI parameters", () => {
  let d = fixture();
  d.layers[0].ai = { prompt: "one", seed: 3, strength: 0.5 };
  const h = new History(d);
  d.layers[0].pixels = copyPixels(d.layers[0].pixels);
  paint(d.layers[0], "blue");
  d.layers[0].mask = { x: 0, y: 0, w: 8, h: 8 };
  d.layers[0].ai.prompt = "two";
  h.push(d);
  d = h.move(-1);
  assert.equal(d.layers[0].ai.prompt, "one");
  assert.equal(d.layers[0].mask, null);
  assert.deepEqual(pixel(composite(d)), [255, 0, 0, 255]);
  d = h.move(1);
  assert.equal(d.layers[0].ai.prompt, "two");
  assert.deepEqual(pixel(composite(d)), [0, 0, 255, 255]);
});
test("editing after undo drops redo branch and caps history", () => {
  const d = fixture(),
    h = new History(d);
  h.push(d);
  h.push(d);
  h.move(-1);
  h.push(d);
  assert.equal(h.items.length, 3);
  for (let i = 0; i < 40; i++) h.push(d);
  assert.equal(h.items.length, 30);
  assert.equal(h.index, 29);
});
test("project roundtrip preserves dimensions and editable metadata", async () => {
  const d = fixture();
  d.layers[0].ai = {
    mode: "replace",
    prompt: "garden",
    seed: 42,
    strength: 0.8,
    selection: { x: 0, y: 0, w: 8, h: 8 },
  };
  d.layers[0].filters.hue = 25;
  const loaded = await deserialize(await serialize(d));
  assert.equal(loaded.width, 16);
  assert.deepEqual(loaded.layers[0].ai, d.layers[0].ai);
  assert.equal(loaded.layers[0].filters.hue, 25);
  assert.deepEqual(pixel(loaded.layers[0].pixels), [255, 0, 0, 255]);
});
test("project rejects impossible dimensions", async () => {
  await assert.rejects(() =>
    deserialize('{"version":1,"width":99999,"height":16,"layers":[]}'),
  );
});
test("demo repeats with same seed and changes with seed or prompt", async () => {
  const p = new DemoProvider(),
    r = {
      width: 120,
      height: 100,
      mode: "pattern",
      prompt: "garden",
      seed: 42,
      strength: 0.75,
    };
  const a = (await p.generate(r)).toDataURL(),
    b = (await p.generate(r)).toDataURL(),
    c = (await p.generate({ ...r, seed: 43 })).toDataURL(),
    d = (await p.generate({ ...r, prompt: "ocean" })).toDataURL();
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});
test("PNG export has valid signature and expected dimensions", () => {
  const c = composite(fixture()),
    b = Buffer.from(c.toDataURL().split(",")[1], "base64");
  assert.equal(b.subarray(1, 4).toString(), "PNG");
  assert.equal(b.readUInt32BE(16), 16);
  assert.equal(b.readUInt32BE(20), 16);
});
test("HTTP provider validates transport protocol", () => {
  assert.throws(() => new HttpProvider("file:///tmp/x"));
  assert.equal(
    new HttpProvider("http://localhost:8787/generate").name,
    "自定义模型代理",
  );
});
test("expansion preserves original pixels, coordinates and undo state", async () => {
  const { expandDocument } = await import("../src/engine.js");
  const d = fixture();
  d.layers[0].mask = { x: 0, y: 0, w: 8, h: 8 };
  d.layers[0].ai = { mode: "replace", selection: { x: 1, y: 2, w: 3, h: 4 } };
  const h = new History(d),
    expanded = expandDocument(d, 8);
  h.push(expanded);
  assert.equal(expanded.width, 32);
  assert.deepEqual(pixel(expanded.layers[0].pixels, 12, 12), [255, 0, 0, 255]);
  assert.equal(pixel(expanded.layers[0].pixels, 2, 2)[3], 0);
  assert.equal(expanded.layers[0].mask.x, 8);
  assert.equal(expanded.layers[0].ai.selection.x, 9);
  assert.equal(d.layers[0].ai.selection.x, 1);
  assert.equal(h.move(-1).width, 16);
});
test("replacement region and outpaint border preserve untouched content", async () => {
  const { regionPixels } = await import("../src/engine.js");
  const d = fixture(),
    rect = { x: 4, y: 4, w: 8, h: 8 };
  const crop = regionPixels(d.layers[0].pixels, rect),
    border = regionPixels(d.layers[0].pixels, rect, true);
  assert.equal(pixel(crop, 1, 1)[3], 0);
  assert.equal(pixel(crop, 5, 5)[3], 255);
  assert.equal(pixel(border, 1, 1)[3], 255);
  assert.equal(pixel(border, 5, 5)[3], 0);
});

test("multiply and screen blend modes composite correctly", () => {
  const d = fixture(),
    top = layer(16, 16, "Blend");
  paint(top, "blue");
  d.layers.push(top);
  top.blend = "multiply";
  assert.deepEqual(pixel(composite(d)), [0, 0, 0, 255]);
  top.blend = "screen";
  assert.deepEqual(pixel(composite(d)), [255, 0, 255, 255]);
});
test("tone curves and levels have predictable mapping", async () => {
  const { toneLUT } = await import("../src/adjustments.js");
  const identity = toneLUT({});
  for (let i = 0; i < 256; i++) assert.ok(Math.abs(identity[i] - i) < 0.0001);
  const levels = toneLUT({ black: 50, white: 200 });
  assert.equal(levels[50], 0);
  assert.equal(levels[200], 255);
  const curve = toneLUT({ curveMid: 180 });
  assert.equal(curve[128], 180);
  const bright = toneLUT({ exposure: 100 });
  assert.equal(bright[64], 128);
  const gamma = toneLUT({ gamma: 200 });
  assert.ok(gamma[64] > 120);
});
test("temperature, sharpening and caching preserve source and alpha", async () => {
  const { adjustedPixels, invalidatePixels } = await import(
    "../src/adjustments.js"
  );
  const d = fixture(),
    p = d.layers[0].pixels;
  paint(d.layers[0], "#808080");
  const warm = adjustedPixels(p, { temperature: 50 });
  const c = pixel(warm);
  assert.ok(c[0] > c[2]);
  assert.equal(c[3], 255);
  assert.deepEqual(pixel(p), [128, 128, 128, 255]);
  assert.equal(adjustedPixels(p, { temperature: 50 }), warm);
  paint(d.layers[0], "#202020");
  invalidatePixels(p);
  assert.notEqual(adjustedPixels(p, { temperature: 50 }), warm);
  const g = p.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(4, 4, 1, 1);
  invalidatePixels(p);
  const sharp = adjustedPixels(p, { sharpen: 50 });
  assert.ok(pixel(sharp)[0] > pixel(p)[0]);
  assert.equal(pixel(sharp)[3], 255);
});
test("histogram ignores fully transparent pixels", async () => {
  const { histogram } = await import("../src/adjustments.js");
  const c = surface(3, 1),
    g = c.getContext("2d");
  g.fillStyle = "white";
  g.fillRect(0, 0, 1, 1);
  g.fillStyle = "black";
  g.fillRect(1, 0, 1, 1);
  const bins = histogram(c);
  assert.equal(bins[255], 1);
  assert.equal(bins[0], 1);
  assert.equal(
    bins.reduce((a, b) => a + b),
    2,
  );
});
test("duplicate has independent metadata and copy-on-write pixels", async () => {
  const { duplicateLayer } = await import("../src/engine.js");
  const d = fixture(),
    a = d.layers[0];
  a.ai = { prompt: "one", selection: { x: 1, y: 1, w: 2, h: 2 } };
  const b = duplicateLayer(a);
  assert.notEqual(a.id, b.id);
  b.filters.gamma = 150;
  b.ai.prompt = "two";
  b.pixels = copyPixels(b.pixels);
  paint(b, "blue");
  assert.equal(a.filters.gamma, 100);
  assert.equal(a.ai.prompt, "one");
  assert.deepEqual(pixel(a.pixels), [255, 0, 0, 255]);
});
test("transform bakes mask, moves pixels and can be undone", async () => {
  const { transformLayer } = await import("../src/engine.js");
  let d = fixture();
  d.layers[0].mask = { x: 0, y: 0, w: 8, h: 16 };
  d.layers[0].ai = { prompt: "original" };
  const h = new History(d),
    flipped = transformLayer(d.layers[0], { flipX: true });
  assert.equal(pixel(flipped.pixels, 4, 4)[3], 0);
  assert.equal(pixel(flipped.pixels, 12, 4)[3], 255);
  assert.equal(flipped.mask, null);
  assert.equal(flipped.ai, null);
  d.layers = [flipped];
  h.push(d);
  d = h.move(-1);
  assert.equal(d.layers[0].mask.w, 8);
  assert.equal(d.layers[0].ai.prompt, "original");
  const translated = transformLayer(d.layers[0], { x: 4 });
  assert.equal(pixel(translated.pixels, 1, 1)[3], 0);
  assert.equal(pixel(translated.pixels, 6, 1)[3], 255);
  assert.throws(() => transformLayer(d.layers[0], { scale: 0 }));
});
test("new adjustments and blend settings survive save/open and undo", async () => {
  let d = fixture();
  const h = new History(d);
  d.layers[0].blend = "soft-light";
  d.layers[0].filters.curveMid = 160;
  d.layers[0].filters.black = 15;
  h.push(d);
  const loaded = await deserialize(await serialize(d));
  assert.equal(loaded.layers[0].blend, "soft-light");
  assert.equal(loaded.layers[0].filters.curveMid, 160);
  assert.equal(loaded.layers[0].filters.black, 15);
  d = h.move(-1);
  assert.equal(d.layers[0].blend, "source-over");
  assert.equal(d.layers[0].filters.curveMid, 128);
});
