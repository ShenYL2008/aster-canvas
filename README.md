# Aster Canvas

**Studio 02 · A canvas-first creative editor for Mac browsers.**

Aster combines a quiet drawing workspace, layered image editing and an extensible AI workflow. This release runs as a desktop web app using native JavaScript modules and Canvas 2D. It needs no build step, runtime npm packages or API key. It is not yet packaged as a native `.app` or DMG.

## Quick start

Requires Python 3. From the project directory:

```sh
python3 serve.py
```

Open **http://127.0.0.1:5173** in a modern desktop browser. Keep the terminal open; press Ctrl+C to stop the server. On macOS, `Start.command` also starts the server; then open the URL manually.

If the port is occupied:

```sh
python3 serve.py --port 5174
```

Do not open `index.html` directly: JavaScript modules need an HTTP origin. Use a browser with support for Canvas 2D filters. Runtime assets are local, with no CDN dependencies. Save any work before refreshing to load an update.

## What's new in Studio 02

- A floating tool dock, softer panel surfaces, consistent line icons and a quieter canvas surround.
- Focus mode hides the inspector to give the canvas more space. Press **F** or use the header button to toggle it.
- Ten layer blending options: Normal, Multiply, Screen, Overlay, Soft Light, Darken, Lighten, Difference, Color and Luminosity.
- Non-destructive exposure, temperature, input levels, gamma, three-point RGB tone curves and sharpening.
- A layer luminance histogram, curve preview, three editable starting looks, and a hold-to-compare control.
- Layer duplication and explicit raster transforms: scaling, rotation, translation and horizontal/vertical flipping.
- An eyedropper that samples the composited canvas and returns to the brush.

The interface remains in Chinese; this README and the manual test checklist are in English.

## Drawing and navigation

The initial project contains a procedural botanical illustration and an empty drawing layer. Draw immediately on the empty layer, or select the illustration to edit its appearance.

| Action                | Control                            |
| --------------------- | ---------------------------------- |
| Brush / eraser        | B / E                              |
| Rectangular selection | M                                  |
| Pan tool              | H                                  |
| Temporary pan         | Hold Space and drag                |
| Eyedropper            | I, then click the canvas           |
| Zoom                  | Mouse wheel or the bottom controls |
| Fit canvas            | Bottom Fit button                  |
| Focus mode            | F                                  |
| Undo / redo           | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z      |
| Save project          | Cmd/Ctrl+S                         |
| Clear selection       | Escape                             |

The brush supports color, size, opacity and basic pen pressure through Pointer Events. Selection constrains painting and erasing. The eyedropper samples the visible composite, including adjustments, but does not sample fully transparent pixels.

## Layers and image processing

### Layer workflow

Create, rename, duplicate, reorder, hide and delete layers in the Layers panel. The final layer cannot be deleted. Import local images as independent layers, centered and fitted to the canvas without enlarging smaller images. Reorder with the up/down controls, select a blending mode and adjust opacity.

### Non-destructive adjustments

Select an image layer before opening Adjustments: the initially selected drawing layer is empty. The panel identifies the active layer, and changes apply to that layer only.

- **Light & Color:** exposure (±2 EV), brightness, contrast, temperature, saturation and hue.
- **Levels:** input black point, input white point and midtone gamma. Interactive controls prevent crossing the black and white points.
- **Tone Curve:** three editable RGB output anchors at input values 64, 128 and 192, with fixed endpoints at 0 and 255. The preview shows the piecewise-linear curve. This is a compact master curve, not a freeform or per-channel curve editor.
- **Detail:** a simple four-neighbor sharpening filter and Canvas blur.

Processing order is levels/gamma → exposure → master curve → temperature → sharpening → Canvas brightness/contrast/saturation/hue/blur → document-space mask → opacity and blending. The original pixel buffer is retained. Reset restores all adjustments to their defaults.

The histogram shows the adjusted, masked active layer at full opacity in isolation; it is not the histogram of the full composite. The compare button temporarily bypasses only the active layer's adjustments while preserving masks, opacity and blending. Release it to return to the edited result. Soft, Film and Monochrome looks replace the current adjustment values with editable presets; they can be undone.

### Transforms

Expand the Transform section under Layers. Enter scale, rotation and X/Y offsets, then apply. Flips use dedicated buttons. Transformations are centered on the document canvas, not on detected subject bounds.

Transforms **resample pixels**. A layer mask is baked before transforming, and an AI layer becomes a regular pixel layer so its generation metadata cannot misleadingly refer to its old geometry. Adjustments and blend settings remain editable. Undo restores the original pixels, mask and AI metadata. Pixels moved outside the canvas are clipped; save a copy or duplicate the layer before a long sequence of transformations.

### Selections and masks

Drag a rectangle with the selection tool. Convert it to a layer mask to hide content outside the rectangle without discarding the source pixels. Clear the mask to restore the full layer. The current selection is temporary UI state; a saved layer mask is part of the document.

## AI layers

The default provider is a **local procedural demo**, not a semantic image model. Prompt text and seed determine the botanical variation, while strength controls its density. It does not guarantee seamless tiling or intelligently continue the source image at the edges.

Three complete layer workflows are available:

1. **Pattern:** generate a new full-canvas layer.
2. **Replace:** create a selection, then generate a new layer that covers only that region.
3. **Expand:** add 128 pixels on all four sides; existing pixels and masks are translated without resampling, and a new layer fills only the outer border.

AI layers store prompt, seed, strength, mode and region metadata. Selecting an AI layer loads its settings. Change the parameters and use Regenerate to replace its generated pixels. Previous versions remain available through undo. Put hand-painted additions on a separate layer: regeneration replaces the AI layer's pixels.

Document editing is temporarily locked during generation. HTTP requests time out after 90 seconds. Provider failures leave the document unchanged and display an error in the status bar.

## Save, open and export

- **Save project:** downloads a `.aster` JSON document containing layer PNGs, adjustment values, blend modes, masks and AI metadata.
- **Open project:** restores the editable document. Studio 01 files load with defaults for the new adjustments and Normal blending.
- **Export PNG:** downloads the visible composite at document resolution, including adjustments, masks, blending and transparency. Editor UI and selection borders are excluded.

Projects contain the current document, not the session undo stack. Opening a project starts a new history. There is no autosave: save before closing or refreshing. History retains up to 30 document states. Zoom, pan, temporary selections and panel visibility are not part of document history.

## Architecture

```text
index.html               Workspace and inspector structure
src/style.css            Canvas-first studio layout and responsive styling
src/app.js               Pointer input, UI state, history commits and file/AI orchestration
src/engine.js            Layer composition, masks, history, serialization and geometry
src/adjustments.js       Pixel adjustments, tone LUT, caching and histogram
src/providers.js         DemoProvider and HttpProvider
src/types.d.ts           Shared document, layer and provider contracts
serve.py                 Local-only static server
Start.command            macOS server launcher
tests/engine.test.mjs    Raster engine regression tests
tests/MANUAL.md          Browser acceptance checklist
```

Each layer owns a Canvas pixel buffer. Unchanged buffers are shared by history states; pixel edits use copy-on-write. Adjustment parameters, masks, blend modes and AI metadata are copied separately. New image operations must not mutate historical pixel buffers.

Custom pixel adjustments use a cached derived canvas keyed by source canvas identity and adjustment values. Painting invalidates the modified buffer's cache. Derived images can be discarded without losing source pixels or document state. Canvas-native filters and blending are applied during composition.

For a future native shell, load the same static frontend and place native file dialogs and persistence behind an adapter. An iPad frontend can reuse the engine/provider contracts, but needs dedicated gesture handling, palm rejection, layout work and device testing. This release does not claim full Apple Pencil or production iPad support.

## Connecting OpenAI or another image provider

Use your own **server-side proxy**. Keep model credentials in server environment variables, not in browser code or project files. The demo makes no network requests. When a custom provider is selected, clicking Generate sends the prompt, current composite and selection to the configured URL.

Expand the provider section in the AI panel, enter an endpoint such as `http://localhost:8787/generate`, and select it. The browser sends a JSON POST:

```json
{
  "mode": "replace",
  "prompt": "Replace the selected flowers with coral peonies",
  "seed": 42,
  "strength": 0.75,
  "width": 1000,
  "height": 800,
  "selection": { "x": 100, "y": 120, "w": 300, "h": 240 },
  "source": "data:image/png;base64,..."
}
```

Return HTTP 200 with:

```json
{ "image": "data:image/png;base64,..." }
```

The returned image must be **exactly** the requested width and height. The client rejects incorrect dimensions. Cross-origin proxies must handle OPTIONS and allow the editor's actual origin, POST and the Content-Type header. The default origin is `http://127.0.0.1:5173`.

For OpenAI, a proxy can map pattern requests to image generation and replacement/expansion requests to image editing. Image edits accept source images and masks. Check the selected model's supported inputs, dimensions and parameters in the [official OpenAI image generation documentation](https://developers.openai.com/api/docs/guides/image-generation).

Adapter responsibilities:

- **Pattern:** return a complete canvas. Convert a model's supported output size to the requested document size on the server.
- **Replace:** construct the model-specific mask from `selection`, edit the source and return a full canvas. The client keeps only the selected rectangle in a new overlay layer.
- **Expand:** the first request's `source` is the smaller original canvas; requested dimensions include the new border. Center it within the expanded canvas. Expansion requests also carry `inner: {x, y, w, h}`, the rectangle that must be preserved. For regeneration, the source is already at the expanded size; use `inner` instead of adding another border.
- **Seed and strength:** these are Aster document parameters. They are not guaranteed to exist in every model API. Map, ignore or explicitly reject unsupported parameters; do not promise deterministic results from all providers.
- **Errors:** return a non-2xx response on failure. Add authentication, rate limiting, size checks and suitable timeout handling to production proxies. Do not leak credentials in errors.

The alternative integration point is `ImageProvider.generate(request, {signal})`, defined in `src/types.d.ts`. It can wrap a different remote model or local inference service. No live model API calls have been tested for this release.

## Publish with GitHub Pages

This is a static app: **no build command, application server or API key is needed** for the editor and local AI demo.

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select **main** and **/(root)**, then click **Save**.
4. Wait for the Pages deployment to finish. GitHub will display the live URL on that screen. For this repository, the expected address is `https://shenyl2008.github.io/aster-canvas/`.
5. Future pushes to `main` publish updates automatically. Save any open artwork before refreshing the live editor.

The committed `.nojekyll` file tells Pages to serve the static files directly. The frontend uses relative asset paths, so it works under the repository subpath. You do not run `serve.py` on GitHub Pages.

GitHub Pages hosts the editor, not an AI backend. The demo works immediately. For real AI generation, host the model proxy separately over **HTTPS**, keep API keys in its server environment, and allow `https://shenyl2008.github.io` in its CORS policy. The localhost endpoint shown in the development example is not a production backend. Users' images stay in their browser unless they explicitly generate through a configured remote provider.

See the [official GitHub Pages publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). Pages is available for public repositories on GitHub Free; private-repository availability depends on the account plan.

## Tests and verification

The app itself does not require Node. Optional engine tests require Node and the development dependency:

```sh
npm install
npm test
```

**19 engine tests pass**, using `@napi-rs/canvas` as a real raster backend. Coverage includes layer composition, visibility, opacity, blend modes, non-destructive masks and adjustments, LUT mapping, sharpening, cache invalidation, histogram transparency, duplication, transforms, history, project roundtrips, deterministic demo output, PNG encoding, expansion and region isolation.

JavaScript syntax and HTML control references are also checked. These are code-level and raster-engine checks, **not browser end-to-end tests**. Browser access was previously denied, so pointer interactions, visual layout, fullscreen behavior and download dialogs remain unverified. Use `tests/MANUAL.md` for the acceptance checklist.

## Current limits

- Desktop web app only; no native application bundle, PSD support, text/vector layers or color-managed workflow.
- One round brush; no textured brush engine, stroke stabilization, lasso, mask feathering or freehand masks.
- Basic RGB master curve; no arbitrary control points, per-channel curves, smart objects or dedicated adjustment layers.
- Explicit raster transforms; no interactive transform handles, perspective warp or live transform preview.
- Fixed 1000 × 800 initial canvas; expansion adds 128 pixels per side. No custom new-document dimensions UI.
- Up to 40 layers, 30 history states and 4096 × 4096 pixels. Large documents can still consume substantial memory, and CPU filters are intended for modest workloads.
- No multi-touch pinch/rotation, automatic recovery or validated mobile workflow yet.
