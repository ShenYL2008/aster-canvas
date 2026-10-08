import { surface, loadImage } from "./engine.js";
/** Provider contract: generate({mode,prompt,seed,strength,width,height,selection,source}, {signal}) -> Canvas.
 * source: full composited PNG data URL. selection: document-space rect or null.
 * A proxy returns {image: 'data:image/png;base64,...'} of exactly width × height.
 * Keep API secrets in your server, never in this browser bundle.
 */
export class DemoProvider {
  name = "本地 Demo · 无需 API key";
  async generate(req, { signal } = {}) {
    if (signal?.aborted) throw Error("已取消");
    const c = surface(req.width, req.height),
      g = c.getContext("2d");
    let seed = req.seed >>> 0;
    for (const ch of req.prompt)
      seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const hue = 145 + random() * 40,
      bg = g.createLinearGradient(0, 0, c.width, c.height);
    bg.addColorStop(0, `hsl(${hue},28%,17%)`);
    bg.addColorStop(1, `hsl(${hue + 15},24%,8%)`);
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#e4c7a1";
    g.beginPath();
    g.arc(
      c.width * 0.7,
      c.height * 0.25,
      Math.min(c.width, c.height) * 0.13,
      0,
      Math.PI * 2,
    );
    g.fill();
    const count = 14 + Math.floor(req.strength * 25);
    for (let i = 0; i < count; i++) {
      let x = random() * c.width,
        y = c.height * (0.7 + random() * 0.5),
        h = c.height * (0.2 + random() * 0.55),
        lean = (random() - 0.5) * c.width * 0.4;
      g.strokeStyle = `hsla(${hue - 15 + random() * 40},22%,${36 + random() * 25}%,.7)`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + lean * 0.4, y - h * 0.5, x + lean, y - h);
      g.stroke();
      for (let j = 1; j <= 6; j++) {
        const t = j / 7,
          px = x + lean * t,
          py = y - h * t;
        for (const side of [-1, 1]) {
          g.save();
          g.translate(px, py);
          g.rotate(side * 0.65 + (lean / h) * 0.3);
          g.fillStyle =
            random() > 0.65
              ? `hsla(${15 + random() * 25},45%,${55 + random() * 20}%,.85)`
              : `hsla(${hue},${18 + random() * 20}%,${25 + random() * 32}%,.85)`;
          g.beginPath();
          g.ellipse(
            side * 12,
            -14,
            9 + random() * 12,
            24 + random() * 20,
            side * 0.5,
            0,
            Math.PI * 2,
          );
          g.fill();
          g.restore();
        }
      }
    }
    for (let i = 0; i < 1700; i++) {
      g.fillStyle = random() > 0.5 ? "#ffffff09" : "#0000000b";
      g.fillRect(random() * c.width, random() * c.height, 1.5, 1.5);
    }
    return c;
  }
}
export class HttpProvider {
  constructor(endpoint) {
    const u = new URL(endpoint);
    if (!["http:", "https:"].includes(u.protocol))
      throw Error("代理地址必须是 HTTP(S)");
    this.endpoint = u.href;
    this.name = "自定义模型代理";
  }
  async generate(req, { signal } = {}) {
    const r = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!r.ok) throw Error(`模型代理错误 ${r.status}`);
    const data = await r.json();
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(data.image))
      throw Error("代理必须返回 base64 图像");
    const img = await loadImage(data.image);
    if (img.width !== req.width || img.height !== req.height)
      throw Error("模型输出尺寸与请求不一致");
    const c = surface(req.width, req.height);
    c.getContext("2d").drawImage(img, 0, 0);
    return c;
  }
}
