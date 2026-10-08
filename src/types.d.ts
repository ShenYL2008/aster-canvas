/** Shared contracts for a future React, native shell or iPad front end. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface GenerationRequest {
  mode: "pattern" | "replace" | "expand";
  prompt: string;
  seed: number;
  strength: number;
  width: number;
  height: number;
  selection: Rect | null;
  source: string; // composited PNG data URL, before expansion
  inner?: Rect;
}
export interface ImageProvider {
  name: string;
  generate(
    request: GenerationRequest,
    options?: { signal?: AbortSignal },
  ): Promise<HTMLCanvasElement>;
}
export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  exposure: number; // hundredths of a stop
  temperature: number;
  black: number;
  white: number;
  gamma: number; // 100 = 1.0
  curveShadows: number;
  curveMid: number;
  curveHighlights: number;
  sharpen: number;
}
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend:
    | "source-over"
    | "multiply"
    | "screen"
    | "overlay"
    | "soft-light"
    | "darken"
    | "lighten"
    | "difference"
    | "color"
    | "luminosity";
  pixels: HTMLCanvasElement;
  filters: Adjustments;
  mask: Rect | null;
  ai: Omit<GenerationRequest, "source"> | null;
}
export interface CanvasDocument {
  width: number;
  height: number;
  active: string;
  layers: Layer[];
}
