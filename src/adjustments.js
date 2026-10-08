// CPU image adjustments. Pixel buffers are copied: source layers remain untouched.
export const toneDefaults = () => ({
  exposure: 0,
  temperature: 0,
  black: 0,
  white: 255,
  gamma: 100,
  curveShadows: 64,
  curveMid: 128,
  curveHighlights: 192,
  sharpen: 0,
});
export const blendModes = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
  "darken",
  "lighten",
  "difference",
  "color",
  "luminosity",
];
const cache = new WeakMap();
export function invalidatePixels(canvas) {
  cache.delete(canvas);
}
const clamp = (n) => Math.max(0, Math.min(255, n));
export function toneLUT(filters) {
  const f = { ...toneDefaults(), ...filters };
  const points = [
    [0, 0],
    [64, f.curveShadows],
    [128, f.curveMid],
    [192, f.curveHighlights],
    [255, 255],
  ];
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const normalized = Math.max(
      0,
      Math.min(1, (i - f.black) / Math.max(1, f.white - f.black)),
    );
    const value = clamp(
      255 * normalized ** (100 / f.gamma) * 2 ** (f.exposure / 100),
    );
    const segment = Math.min(3, Math.floor(value / 64));
    const [x0, y0] = points[segment],
      [x1, y1] = points[segment + 1];
    lut[i] = y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
  }
  return lut;
}
export function adjustedPixels(source, filters) {
  const f = { ...toneDefaults(), ...filters };
  const keys = Object.keys(toneDefaults());
  if (keys.every((key) => f[key] === toneDefaults()[key])) return source;
  const key = keys.map((k) => f[k]).join("/");
  const previous = cache.get(source);
  if (previous?.key === key) return previous.canvas;
  const result = document.createElement("canvas");
  result.width = source.width;
  result.height = source.height;
  const context = result.getContext("2d");
  const data = source
    .getContext("2d")
    .getImageData(0, 0, source.width, source.height);
  const px = data.data,
    lut = toneLUT(f),
    warmth = f.temperature * 0.32;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = clamp(lut[px[i]] + warmth);
    px[i + 1] = clamp(lut[px[i + 1]] + warmth * 0.1);
    px[i + 2] = clamp(lut[px[i + 2]] - warmth);
  }
  if (f.sharpen > 0) {
    const original = new Uint8ClampedArray(px),
      w = source.width,
      h = source.height,
      amount = f.sharpen / 100;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (!original[i + 3]) continue;
        for (let c = 0; c < 3; c++) {
          const neighbors = [i - 4, i + 4, i - w * 4, i + w * 4];
          // Transparent neighbors borrow the center color to avoid dark edge halos.
          const mean =
            neighbors.reduce(
              (sum, n) =>
                sum + (original[n + 3] ? original[n + c] : original[i + c]),
              0,
            ) / 4;
          px[i + c] = clamp(
            original[i + c] + (original[i + c] - mean) * amount * 4,
          );
        }
      }
  }
  context.putImageData(data, 0, 0);
  cache.set(source, { key, canvas: result });
  return result;
}
export function histogram(source) {
  const bins = new Uint32Array(256);
  const data = source
    .getContext("2d")
    .getImageData(0, 0, source.width, source.height).data;
  for (let i = 0; i < data.length; i += 4)
    if (data[i + 3])
      bins[
        Math.round(
          0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2],
        )
      ]++;
  return bins;
}
