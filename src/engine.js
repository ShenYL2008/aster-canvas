import { toneDefaults, adjustedPixels, blendModes } from "./adjustments.js";
export const defaults = () => ({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  ...toneDefaults(),
});
export function surface(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
export function layer(w, h, name = "新建图层", source = null) {
  return {
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 1,
    blend: "source-over",
    filters: defaults(),
    mask: null,
    ai: null,
    pixels: source || surface(w, h),
  };
}
export function copyLayer(l) {
  return {
    ...l,
    filters: { ...l.filters },
    mask: l.mask ? { ...l.mask } : null,
    ai: l.ai ? structuredClone(l.ai) : null,
  };
}
export function cloneDoc(d) {
  return { ...d, layers: d.layers.map(copyLayer) };
}
export function filterCSS(f) {
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) hue-rotate(${f.hue}deg) blur(${f.blur}px)`;
}
export function composite(doc, target = surface(doc.width, doc.height)) {
  if (target.width !== doc.width) target.width = doc.width;
  if (target.height !== doc.height) target.height = doc.height;
  const c = target.getContext("2d");
  c.clearRect(0, 0, target.width, target.height);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    c.save();
    c.globalAlpha = l.opacity;
    c.globalCompositeOperation = l.blend || "source-over";
    c.filter = filterCSS(l.filters);
    if (l.mask) {
      c.beginPath();
      c.rect(l.mask.x, l.mask.y, l.mask.w, l.mask.h);
      c.clip();
    }
    c.drawImage(adjustedPixels(l.pixels, l.filters), 0, 0);
    c.restore();
  }
  return target;
}
export function copyPixels(c) {
  const n = surface(c.width, c.height);
  n.getContext("2d").drawImage(c, 0, 0);
  return n;
}
export class History {
  constructor(doc) {
    this.items = [cloneDoc(doc)];
    this.index = 0;
  }
  push(doc) {
    this.items = this.items.slice(0, this.index + 1);
    this.items.push(cloneDoc(doc));
    if (this.items.length > 30) this.items.shift();
    this.index = this.items.length - 1;
  }
  move(n) {
    this.index = Math.max(0, Math.min(this.items.length - 1, this.index + n));
    return cloneDoc(this.items[this.index]);
  }
}
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("无法读取图像"));
    i.src = url;
  });
}
export async function serialize(doc) {
  return JSON.stringify({
    version: 1,
    width: doc.width,
    height: doc.height,
    active: doc.active,
    layers: doc.layers.map((l) => ({ ...l, pixels: l.pixels.toDataURL() })),
  });
}
export async function deserialize(raw) {
  const d = JSON.parse(raw);
  if (
    d.version !== 1 ||
    !Number.isInteger(d.width) ||
    !Number.isInteger(d.height) ||
    d.width < 1 ||
    d.height < 1 ||
    d.width > 4096 ||
    d.height > 4096 ||
    !Array.isArray(d.layers) ||
    !d.layers.length ||
    d.layers.length > 40
  )
    throw Error("项目格式无效或超出限制");
  const ls = [];
  for (const l of d.layers) {
    if (typeof l.pixels !== "string" || !l.pixels.startsWith("data:image/png;"))
      throw Error("项目图像无效");
    const img = await loadImage(l.pixels);
    const p = surface(d.width, d.height);
    p.getContext("2d").drawImage(img, 0, 0);
    ls.push({
      ...layer(d.width, d.height, String(l.name).slice(0, 80), p),
      id: String(l.id),
      visible: !!l.visible,
      blend: blendModes.includes(l.blend) ? l.blend : "source-over",
      opacity: Math.max(0, Math.min(1, Number(l.opacity) || 0)),
      filters: { ...defaults(), ...l.filters },
      mask: l.mask,
      ai: l.ai,
    });
  }
  return {
    width: d.width,
    height: d.height,
    active: ls.some((l) => l.id === d.active) ? d.active : ls.at(-1).id,
    layers: ls,
  };
}

// Resize without resampling the existing art. Canvas snapshots remain immutable.
export function expandDocument(doc, padding) {
  const width = doc.width + padding * 2,
    height = doc.height + padding * 2;
  const layers = doc.layers.map((old) => {
    const l = copyLayer(old);
    l.pixels = surface(width, height);
    l.pixels.getContext("2d").drawImage(old.pixels, padding, padding);
    if (l.mask) {
      l.mask.x += padding;
      l.mask.y += padding;
    }
    if (l.ai) {
      l.ai.width = width;
      l.ai.height = height;
      for (const key of ["selection", "inner"])
        if (l.ai[key]) {
          l.ai[key].x += padding;
          l.ai[key].y += padding;
        }
    }
    return l;
  });
  return { ...doc, width, height, layers };
}
export function regionPixels(pixels, rect, invert = false) {
  const result = surface(pixels.width, pixels.height),
    g = result.getContext("2d");
  if (invert) {
    g.drawImage(pixels, 0, 0);
    g.clearRect(rect.x, rect.y, rect.w, rect.h);
  } else {
    g.beginPath();
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip();
    g.drawImage(pixels, 0, 0);
  }
  return result;
}

// Explicit raster transform: output is a new canvas; history retains the original.
// A rectangular mask is baked first so rotations do not change its visual shape.
export function transformLayer(source, options = {}) {
  const l = copyLayer(source),
    p = source.mask ? regionPixels(source.pixels, source.mask) : source.pixels;
  const result = surface(p.width, p.height),
    c = result.getContext("2d");
  const {
    x = 0,
    y = 0,
    scale = 1,
    rotation = 0,
    flipX = false,
    flipY = false,
  } = options;
  if (
    ![x, y, scale, rotation].every(Number.isFinite) ||
    scale <= 0 ||
    scale > 4
  )
    throw Error("Invalid transform");
  c.translate(p.width / 2 + x, p.height / 2 + y);
  c.rotate((rotation * Math.PI) / 180);
  c.scale(scale * (flipX ? -1 : 1), scale * (flipY ? -1 : 1));
  c.drawImage(p, -p.width / 2, -p.height / 2);
  l.pixels = result;
  l.mask = null;
  l.ai = null;
  return l;
}
export function duplicateLayer(source) {
  const l = copyLayer(source);
  l.id = crypto.randomUUID();
  l.name = source.name + " copy";
  return l;
}
