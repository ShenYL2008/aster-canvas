import {
  surface,
  layer,
  defaults,
  composite,
  copyPixels,
  History,
  loadImage,
  serialize,
  deserialize,
  expandDocument,
  regionPixels,
  transformLayer,
  duplicateLayer,
} from "./engine.js";
import { invalidatePixels, histogram } from "./adjustments.js";
import { DemoProvider, HttpProvider } from "./providers.js";
const $ = (id) => document.getElementById(id),
  canvas = $("canvas"),
  workspace = $("workspace");
let doc = { width: 1000, height: 800, layers: [], active: null },
  history,
  tool = "brush",
  selection = null,
  scale = 0.7,
  pan = { x: 0, y: 0 },
  gesture = null,
  space = false,
  busy = false,
  provider = new DemoProvider(),
  dirty = false,
  comparing = false;
const initial = await provider.generate({
  width: 1000,
  height: 800,
  seed: 42,
  prompt: "月光下的植物，柔和的珊瑚色与青绿色",
  strength: 0.75,
});
const art = layer(1000, 800, "Moonlit garden", initial);
art.ai = {
  mode: "pattern",
  prompt: $("prompt").value,
  seed: 42,
  strength: 0.75,
  width: 1000,
  height: 800,
  selection: null,
};
doc.layers = [art, layer(1000, 800, "自由绘画")];
doc.active = doc.layers.at(-1).id;
history = new History(doc);
const active = () => doc.layers.find((l) => l.id === doc.active);
function status(s) {
  $("status").textContent = s;
}
function commit(message) {
  history.push(doc);
  dirty = true;
  render();
  status(message || "已更新 · 可撤销");
}
function updateView() {
  const vp = $("viewport");
  vp.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
  vp.style.width = doc.width + "px";
  vp.style.height = doc.height + "px";
  $("zoomlabel").textContent = Math.round(scale * 100) + "%";
  drawSelection();
}
function fit() {
  const left = workspace.clientWidth < 400 ? 65 : 95,
    top = document.body.classList.contains("studiofocus") ? 30 : 110,
    w = workspace.clientWidth - left - 28,
    h = workspace.clientHeight - top - 65;
  scale = Math.max(0.05, Math.min(w / doc.width, h / doc.height, 1));
  pan = {
    x: left + (w - doc.width * scale) / 2,
    y: top + (h - doc.height * scale) / 2,
  };
  updateView();
}
function zoom(
  factor,
  x = workspace.clientWidth / 2,
  y = workspace.clientHeight / 2,
) {
  const old = scale;
  scale = Math.max(0.1, Math.min(5, scale * factor));
  pan = {
    x: x - ((x - pan.x) * scale) / old,
    y: y - ((y - pan.y) * scale) / old,
  };
  updateView();
}
function drawSelection() {
  const s = $("selection");
  s.style.display = selection ? "block" : "none";
  if (selection)
    Object.assign(s.style, {
      left: selection.x + "px",
      top: selection.y + "px",
      width: selection.w + "px",
      height: selection.h + "px",
    });
}
function render() {
  paintCanvas();
  updateInspector();
  $("dimensions").textContent = `${doc.width} × ${doc.height} px · RGB`;
  renderLayers();
  const a = active();
  $("layername").value = a.name;
  $("adjusttarget").textContent = "当前图层 · " + a.name;
  $("blend").value = a.blend || "source-over";
  $("opacity").value = a.opacity * 100;
  $("opacityvalue").value = Math.round(a.opacity * 100) + "%";
  for (const key of Object.keys(defaults())) {
    $(key).value = a.filters[key];
    $(key + "value").value = formatAdjustment(key, a.filters[key]);
  }
  $("undo").disabled = history.index === 0 || busy;
  $("redo").disabled = history.index === history.items.length - 1 || busy;
  $("delete").disabled = doc.layers.length === 1;
  $("regenerate").disabled = !a.ai || busy;
  $("generate").disabled = busy;
  $("historylabel").textContent =
    `历史 ${history.index + 1} / ${history.items.length}`;
  updateView();
}
function renderLayers() {
  const list = $("layerlist");
  list.replaceChildren();
  for (const l of [...doc.layers].reverse()) {
    const row = document.createElement("div");
    row.className = "layer" + (l.id === doc.active ? " selected" : "");
    row.dataset.id = l.id;
    row.tabIndex = 0;
    const thumb = document.createElement("img"),
      t = surface(70, 56);
    t.getContext("2d").drawImage(l.pixels, 0, 0, 70, 56);
    thumb.src = t.toDataURL();
    thumb.alt = "";
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = l.name;
    const sub = document.createElement("small");
    sub.textContent =
      (l.ai ? "✧ AI LAYER" : "PIXEL LAYER") + (l.mask ? " · MASK" : "");
    meta.append(name, sub);
    const eye = document.createElement("button");
    eye.textContent = l.visible ? "◉" : "○";
    eye.title = l.visible ? "隐藏图层" : "显示图层";
    eye.onclick = (e) => {
      e.stopPropagation();
      if (busy) return;
      l.visible = !l.visible;
      commit();
    };
    row.append(thumb, meta, eye);
    const choose = () => {
      if (busy) return;
      doc.active = l.id;
      render();
      if (l.ai) {
        $("prompt").value = l.ai.prompt;
        $("seed").value = l.ai.seed;
        $("strength").value = l.ai.strength * 100;
        $("strengthvalue").value = Math.round(l.ai.strength * 100) + "%";
        $("mode").value = l.ai.mode;
      }
    };
    row.onclick = choose;
    row.onkeydown = (e) => {
      if (e.key === "Enter") choose();
    };
    list.append(row);
  }
}
function change(fn, msg) {
  if (busy) return status("生成中，请稍候");
  fn();
  commit(msg);
}
function setTool(t) {
  tool = t;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
  canvas.style.cursor = t === "pan" ? "grab" : "crosshair";
  $("toolhint").textContent = {
    brush: "画笔 · 拖动绘制 / 空格平移",
    eraser: "橡皮 · 擦除当前图层",
    select: "选区 · 拖动建立矩形",
    pan: "移动 · 拖动平移画布",
    picker: "吸管 · 点击画布采样合成颜色",
  }[t];
}
function point(e) {
  const r = workspace.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - pan.x) / scale,
    y: (e.clientY - r.top - pan.y) / scale,
  };
}
const bounded = (p) => ({
  x: Math.max(0, Math.min(doc.width, p.x)),
  y: Math.max(0, Math.min(doc.height, p.y)),
});
function stroke(p, pressure) {
  const a = active(),
    g = a.pixels.getContext("2d"),
    width =
      Number($("size").value) *
      (pressure > 0 && gesture.pen ? Math.max(0.15, pressure) : 1);
  g.save();
  if (selection) {
    g.beginPath();
    g.rect(selection.x, selection.y, selection.w, selection.h);
    g.clip();
  }
  g.globalCompositeOperation =
    tool === "eraser" ? "destination-out" : "source-over";
  g.globalAlpha = Number($("brushopacity").value) / 100;
  g.fillStyle = g.strokeStyle = $("color").value;
  g.lineWidth = width;
  g.lineCap = g.lineJoin = "round";
  g.beginPath();
  if (gesture.last) {
    g.moveTo(gesture.last.x, gesture.last.y);
    g.lineTo(p.x, p.y);
    g.stroke();
  } else {
    g.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  gesture.last = p;
  invalidatePixels(a.pixels);
  paintCanvas();
}
workspace.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".bottom") || busy || gesture || e.button > 1) return;
  const p = point(e);
  if (space || tool === "pan" || e.button === 1) {
    gesture = { kind: "pan", x: e.clientX, y: e.clientY, pan: { ...pan } };
  } else {
    if (
      e.target !== canvas ||
      p.x < 0 ||
      p.y < 0 ||
      p.x > doc.width ||
      p.y > doc.height
    )
      return;
    if (tool === "picker") {
      const rgba = canvas
        .getContext("2d")
        .getImageData(
          Math.min(doc.width - 1, Math.floor(p.x)),
          Math.min(doc.height - 1, Math.floor(p.y)),
          1,
          1,
        ).data;
      if (!rgba[3]) return status("该像素透明，无法采样");
      $("color").value =
        "#" +
        Array.from(rgba)
          .slice(0, 3)
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      setTool("brush");
      status("颜色已采样");
      return;
    }
    if (tool === "select") {
      gesture = { kind: "select", start: bounded(p) };
      selection = null;
      drawSelection();
    } else {
      if (!active().visible) return status("请先显示当前图层");
      active().pixels = copyPixels(active().pixels);
      gesture = { kind: "stroke", last: null, pen: e.pointerType === "pen" };
      stroke(p, e.pressure);
    }
  }
  workspace.setPointerCapture(e.pointerId);
  e.preventDefault();
});
workspace.addEventListener("pointermove", (e) => {
  if (!gesture) return;
  if (gesture.kind === "pan") {
    pan = {
      x: gesture.pan.x + e.clientX - gesture.x,
      y: gesture.pan.y + e.clientY - gesture.y,
    };
    updateView();
  } else if (gesture.kind === "select") {
    const p = bounded(point(e)),
      s = gesture.start;
    selection = {
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    };
    drawSelection();
  } else stroke(point(e), e.pressure);
});
function endGesture() {
  if (!gesture) return;
  const kind = gesture.kind;
  gesture = null;
  if (kind === "stroke") commit("笔画已保存");
  if (kind === "select") {
    if (selection && (selection.w < 2 || selection.h < 2)) selection = null;
    drawSelection();
    status(selection ? "选区已建立 · 可绘画、蒙版或 AI 替换" : "选区已取消");
  }
}
workspace.addEventListener("pointerup", endGesture);
workspace.addEventListener("pointercancel", endGesture);
workspace.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = workspace.getBoundingClientRect();
    zoom(Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
$("fit").onclick = fit;
$("zoomin").onclick = () => zoom(1.2);
$("zoomout").onclick = () => zoom(1 / 1.2);
window.addEventListener("resize", fit);
document
  .querySelectorAll("[data-tool]")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("active", x === b));
      document
        .querySelectorAll(".panel")
        .forEach((x) => x.classList.toggle("hidden", x.id !== b.dataset.tab));
      updateInspector();
    }),
);
function undo(n) {
  if (busy) return;
  endGesture();
  doc = history.move(n);
  selection = null;
  dirty = true;
  render();
  status(n < 0 ? "已撤销" : "已重做");
}
$("undo").onclick = () => undo(-1);
$("redo").onclick = () => undo(1);
window.addEventListener("keydown", (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.code === "Space") {
    space = true;
    e.preventDefault();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo(e.shiftKey ? 1 : -1);
  } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    $("save").click();
  } else if (e.key === "Escape") {
    selection = null;
    drawSelection();
  } else if (!e.metaKey && !e.ctrlKey && e.key === "f") $("focus").click();
  else if (!e.metaKey && !e.ctrlKey && { b: 1, e: 1, m: 1, h: 1, i: 1 }[e.key])
    setTool(
      { b: "brush", e: "eraser", m: "select", h: "pan", i: "picker" }[e.key],
    );
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") space = false;
});
window.addEventListener("blur", () => {
  space = false;
  endGesture();
});
$("add").onclick = () =>
  change(() => {
    if (doc.layers.length >= 40) {
      status("MVP 最多支持 40 个图层");
      return;
    }
    const l = layer(doc.width, doc.height, "图层 " + (doc.layers.length + 1));
    doc.layers.push(l);
    doc.active = l.id;
  });
$("delete").onclick = () =>
  change(() => {
    if (doc.layers.length <= 1) return;
    doc.layers = doc.layers.filter((l) => l.id !== doc.active);
    doc.active = doc.layers.at(-1).id;
  });
for (const [id, delta] of [
  ["up", 1],
  ["down", -1],
])
  $(id).onclick = () =>
    change(() => {
      const i = doc.layers.findIndex((l) => l.id === doc.active),
        j = i + delta;
      if (j < 0 || j >= doc.layers.length) return;
      [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]];
    });
$("layername").onchange = () =>
  change(() => (active().name = $("layername").value.trim() || "未命名图层"));
$("opacity").oninput = () => {
  if (busy) return;
  active().opacity = Number($("opacity").value) / 100;
  $("opacityvalue").value = $("opacity").value + "%";
  paintCanvas();
};
$("opacity").onchange = () => {
  if (!busy) commit();
};
$("mask").onclick = () => {
  if (!selection) return status("请先用选区工具圈出区域");
  change(() => (active().mask = { ...selection }), "已创建非破坏性矩形蒙版");
};
$("clearmask").onclick = () => change(() => (active().mask = null));
$("deselect").onclick = () => {
  if (busy) return;
  selection = null;
  drawSelection();
};
const groups = [
  [
    "光线与颜色",
    "LIGHT & COLOR",
    [
      ["exposure", "曝光", -200, 200],
      ["brightness", "亮度", 0, 200],
      ["contrast", "对比度", 0, 200],
      ["temperature", "色温", -100, 100],
      ["saturation", "饱和度", 0, 200],
      ["hue", "色相", -180, 180],
    ],
  ],
  [
    "色阶",
    "LEVELS",
    [
      ["black", "输入黑场", 0, 254],
      ["white", "输入白场", 1, 255],
      ["gamma", "中间调 Gamma", 10, 300],
    ],
  ],
  [
    "曲线",
    "TONE CURVE",
    [
      ["curveShadows", "暗部输出", 0, 255],
      ["curveMid", "中间调输出", 0, 255],
      ["curveHighlights", "高光输出", 0, 255],
    ],
  ],
  [
    "细节",
    "DETAIL",
    [
      ["sharpen", "锐化", 0, 100],
      ["blur", "高斯模糊", 0, 30],
    ],
  ],
];
for (const [name, subtitle, specs] of groups) {
  const section = document.createElement("details");
  section.className = "inspector-group";
  section.open = subtitle === "LIGHT & COLOR";
  const summary = document.createElement("summary");
  summary.textContent = name;
  const caption = document.createElement("span");
  caption.textContent = subtitle;
  summary.append(caption);
  section.append(summary);
  if (subtitle === "TONE CURVE") {
    const curve = document.createElement("canvas");
    curve.id = "curvepreview";
    curve.width = 256;
    curve.height = 128;
    curve.className = "curve-preview";
    curve.setAttribute("aria-label", "三点 RGB 主曲线");
    section.append(curve);
  }
  for (const [key, labelText, min, max] of specs) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const out = document.createElement("output");
    out.id = key + "value";
    const input = document.createElement("input");
    input.type = "range";
    input.id = key;
    input.min = min;
    input.max = max;
    input.oninput = () => {
      if (busy) return;
      let value = Number(input.value);
      if (key === "black") value = Math.min(value, active().filters.white - 1);
      if (key === "white") value = Math.max(value, active().filters.black + 1);
      input.value = value;
      active().filters[key] = value;
      out.value = formatAdjustment(key, value);
      paintCanvas();
      updateInspector();
    };
    input.onchange = () => {
      if (!busy) commit();
    };
    label.append(out, input);
    section.append(label);
  }
  $("filters").append(section);
}
$("resetfilters").onclick = () => change(() => (active().filters = defaults()));
for (const [id, suffix] of [
  ["size", " px"],
  ["brushopacity", "%"],
  ["strength", "%"],
])
  $(id).oninput = () => ($(id + "value").value = $(id).value + suffix);
for (const color of [
  "#f3b9a0",
  "#e5d6b9",
  "#9ebf9d",
  "#56817c",
  "#233b38",
  "#ffffff",
]) {
  const b = document.createElement("button");
  b.style.background = color;
  b.title = color;
  b.onclick = () => ($("color").value = color);
  $("swatches").append(b);
}
function download(blob, name) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () =>
  composite(doc).toBlob((b) => {
    download(b, "aster-canvas.png");
    status("PNG 已导出 · 包含可见图层与调整");
  });
$("save").onclick = async () => {
  if (busy) return;
  download(
    new Blob([await serialize(doc)], { type: "application/json" }),
    "Untitled.aster",
  );
  dirty = false;
  status("项目已保存 · 包含图层、蒙版和 AI 参数");
};
$("import").onclick = () => $("imagefile").click();
$("open").onclick = () => {
  if (!busy) $("projectfile").click();
};
$("imagefile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (busy) throw Error("请等待 AI 生成完成");
    if (doc.layers.length >= 40) throw Error("已达到 40 图层上限");
    if (f.size > 30 * 1024 * 1024) throw Error("图片请小于 30MB");
    const url = URL.createObjectURL(f);
    let img;
    try {
      img = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const c = surface(doc.width, doc.height),
      g = c.getContext("2d"),
      s = Math.min(doc.width / img.width, doc.height / img.height, 1);
    g.drawImage(
      img,
      (doc.width - img.width * s) / 2,
      (doc.height - img.height * s) / 2,
      img.width * s,
      img.height * s,
    );
    const l = layer(doc.width, doc.height, f.name, c);
    doc.layers.push(l);
    doc.active = l.id;
    commit("图片已导入为独立图层");
  } catch (err) {
    status(err.message);
  }
  e.target.value = "";
};
$("projectfile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 100 * 1024 * 1024) throw Error("项目请小于 100MB");
    const loaded = await deserialize(await f.text());
    doc = loaded;
    history = new History(doc);
    selection = null;
    dirty = false;
    render();
    fit();
    status("项目已打开");
  } catch (err) {
    status(err.message);
  }
  e.target.value = "";
};
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    status("当前窗口不支持全屏，请使用浏览器全屏");
  }
};
$("randomseed").onclick = () =>
  ($("seed").value = Math.floor(Math.random() * 2147483647));
$("connect").onclick = () => {
  try {
    provider = new HttpProvider($("endpoint").value);
    $("providerlabel").textContent = provider.name;
    status("已连接接口配置 · 生成时会发送画布和选区");
  } catch (e) {
    status(e.message);
  }
};
$("demo").onclick = () => {
  provider = new DemoProvider();
  $("providerlabel").textContent = provider.name;
};
async function generate(regen = false) {
  if (busy) return;
  const target = active(),
    old = regen ? target.ai : null;
  if (regen && !old) return;
  const mode = old?.mode || $("mode").value;
  if (mode === "replace" && !old && !selection)
    return status("局部替换需要先建立矩形选区");
  if (!regen && doc.layers.length >= 40) return status("已达到 40 图层上限");
  const padding = mode === "expand" && !regen ? 128 : 0,
    w = doc.width + padding * 2,
    h = doc.height + padding * 2;
  if (w > 4096 || h > 4096) return status("画布上限为 4096 × 4096");
  const req = {
    mode,
    prompt: $("prompt").value.trim(),
    seed: Number($("seed").value) >>> 0,
    strength: Number($("strength").value) / 100,
    width: w,
    height: h,
    selection: old?.selection
      ? { ...old.selection }
      : selection
        ? { ...selection }
        : null,
    source: composite(doc).toDataURL(),
  };
  if (mode === "expand")
    req.inner = old?.inner
      ? { ...old.inner }
      : { x: padding, y: padding, w: w - padding * 2, h: h - padding * 2 };
  if (!req.prompt) return status("请先填写灵感描述");
  busy = true;
  render();
  document
    .querySelectorAll(
      "aside input,aside select,aside textarea,#import,#open,#save",
    )
    .forEach((x) => (x.disabled = true));
  status("正在生成…");
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 90000);
  try {
    await new Promise((r) => setTimeout(r, 80));
    const generated = await provider.generate(req, {
      signal: controller.signal,
    });
    let pixels = generated;
    if (mode === "replace") pixels = regionPixels(generated, req.selection);
    if (padding) {
      doc = expandDocument(doc, padding);
      selection = null;
    }
    if (mode === "expand") {
      const inner = old?.inner || {
        x: padding,
        y: padding,
        w: w - padding * 2,
        h: h - padding * 2,
      };
      pixels = regionPixels(pixels, inner, true);
      req.inner = inner;
    }
    const { source, ...metadata } = req;
    if (regen) {
      target.pixels = pixels;
      target.ai = metadata;
    } else {
      const l = layer(
        w,
        h,
        mode === "expand"
          ? "✧ 扩展画布"
          : mode === "replace"
            ? "✧ 局部创作"
            : "✧ " + req.prompt.slice(0, 18),
        pixels,
      );
      l.ai = metadata;
      if (mode === "expand") doc.layers.unshift(l);
      else doc.layers.push(l);
      doc.active = l.id;
    }
    history.push(doc);
    dirty = true;
    status("AI 图层已生成 · 参数可编辑并重新生成");
    if (padding) fit();
  } catch (e) {
    status(e.name === "AbortError" ? "生成超时，请重试" : e.message);
  } finally {
    clearTimeout(timeout);
    busy = false;
    document
      .querySelectorAll(
        "aside input,aside select,aside textarea,#import,#open,#save",
      )
      .forEach((x) => (x.disabled = false));
    render();
  }
}
$("generate").onclick = () => generate();
$("regenerate").onclick = () => generate(true);
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
render();
fit();
setTool("brush");

function formatAdjustment(key, value) {
  if (key === "exposure")
    return (value >= 0 ? "+" : "") + (value / 100).toFixed(2) + " EV";
  if (key === "gamma") return (value / 100).toFixed(2);
  if (key === "temperature") return (value > 0 ? "+" : "") + value;
  if (
    ["black", "white", "curveShadows", "curveMid", "curveHighlights"].includes(
      key,
    )
  )
    return String(value);
  return value + (key === "hue" ? "°" : key === "blur" ? " px" : "%");
}
function paintCanvas() {
  const visibleDoc = comparing
    ? {
        ...doc,
        layers: doc.layers.map((l) =>
          l.id === doc.active ? { ...l, filters: defaults() } : l,
        ),
      }
    : doc;
  composite(visibleDoc, canvas);
}
function updateInspector() {
  if ($("adjust").classList.contains("hidden")) return;
  const a = active(),
    isolated = composite({
      ...doc,
      layers: [{ ...a, visible: true, opacity: 1, blend: "source-over" }],
    });
  const bins = histogram(isolated),
    h = $("histogram"),
    g = h.getContext("2d"),
    max = Math.max(1, ...bins);
  g.clearRect(0, 0, h.width, h.height);
  g.fillStyle = "#a8c4a8";
  for (let x = 0; x < 256; x++)
    g.fillRect(
      x,
      64 - 60 * Math.sqrt(bins[x] / max),
      1,
      60 * Math.sqrt(bins[x] / max),
    );
  const c = $("curvepreview"),
    ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#ffffff10";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 128);
    ctx.moveTo(0, i * 32);
    ctx.lineTo(256, i * 32);
    ctx.stroke();
  }
  ctx.strokeStyle = "#c5ddc0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  const pts = [
    [64, a.filters.curveShadows],
    [128, a.filters.curveMid],
    [192, a.filters.curveHighlights],
    [255, 255],
  ];
  for (const [x, y] of pts) ctx.lineTo(x, 128 - y / 2);
  ctx.stroke();
  ctx.fillStyle = "#dcebd8";
  for (const [x, y] of pts.slice(0, 3)) {
    ctx.beginPath();
    ctx.arc(x, 128 - y / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
$("blend").onchange = () => change(() => (active().blend = $("blend").value));
$("duplicate").onclick = () => {
  if (busy) return;
  if (doc.layers.length >= 40) return status("已达到 40 图层上限");
  change(() => {
    const l = duplicateLayer(active()),
      index = doc.layers.findIndex((x) => x.id === doc.active);
    doc.layers.splice(index + 1, 0, l);
    doc.active = l.id;
  }, "图层已复制");
};
function applyTransform(options) {
  if (busy) return;
  try {
    change(() => {
      const index = doc.layers.findIndex((l) => l.id === doc.active);
      doc.layers[index] = transformLayer(active(), options);
    }, "已应用变换 · 可撤销恢复");
  } catch (e) {
    status(e.message);
  }
}
$("applytransform").onclick = () => {
  const values = [
    $("transformx"),
    $("transformy"),
    $("transformscale"),
    $("transformrotation"),
  ];
  if (values.some((i) => i.value === "" || !i.checkValidity()))
    return status("请输入有效的变换数值");
  applyTransform({
    x: Number(values[0].value),
    y: Number(values[1].value),
    scale: Number(values[2].value) / 100,
    rotation: Number(values[3].value),
  });
};
$("flipx").onclick = () => applyTransform({ flipX: true });
$("flipy").onclick = () => applyTransform({ flipY: true });
$("focus").onclick = () => {
  const focused = document.body.classList.toggle("studiofocus");
  $("focus").setAttribute("aria-pressed", String(focused));
  $("focus").textContent = focused ? "显示面板" : "专注模式";
  fit();
};
const looks = {
  soft: {
    contrast: 90,
    saturation: 88,
    curveShadows: 76,
    curveHighlights: 186,
  },
  film: {
    temperature: 18,
    saturation: 85,
    curveShadows: 76,
    curveMid: 126,
    curveHighlights: 200,
  },
  mono: {
    saturation: 0,
    contrast: 114,
    curveShadows: 56,
    curveHighlights: 205,
  },
};
document
  .querySelectorAll("[data-look]")
  .forEach(
    (b) =>
      (b.onclick = () =>
        change(
          () =>
            (active().filters = { ...defaults(), ...looks[b.dataset.look] }),
          "风格已应用 · 可继续精调",
        )),
  );
function stopCompare() {
  if (!comparing) return;
  comparing = false;
  $("compare").classList.remove("active");
  paintCanvas();
}
$("compare").onpointerdown = (e) => {
  if (busy) return;
  comparing = true;
  e.currentTarget.setPointerCapture(e.pointerId);
  $("compare").classList.add("active");
  paintCanvas();
};
$("compare").onpointerup = stopCompare;
$("compare").onpointercancel = stopCompare;
$("compare").onlostpointercapture = stopCompare;
$("compare").onkeydown = (e) => {
  if ([" ", "Enter"].includes(e.key)) {
    e.preventDefault();
    comparing = true;
    $("compare").classList.add("active");
    paintCanvas();
  }
};
$("compare").onkeyup = stopCompare;
$("compare").onblur = stopCompare;
window.addEventListener("blur", stopCompare);
