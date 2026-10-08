# Browser acceptance checklist

Browser access was previously denied. These checks are pending; engine tests do not replace visual and interaction testing.

## Workspace

- [ ] Save any existing work, reload, and confirm the Studio 02 layout appears with no console errors.
- [ ] Floating tool dock and inspector remain accessible at 1440×900, 1024×768 and 760×600.
- [ ] Focus mode hides the inspector, fits the canvas and restores it with F or the header button.
- [ ] Zoom anchors to the pointer; Space-drag and the Pan tool work; Fit restores framing.
- [ ] Brush, eraser, opacity, size and undo/redo work for both clicks and continuous strokes.
- [ ] Eyedropper samples the composited color, ignores transparent pixels and returns to Brush.

## Layer editing

- [ ] Add, rename, reorder, hide, delete and duplicate layers; deleting the last layer is prevented.
- [ ] Painting on a duplicate does not affect the source layer.
- [ ] Import a PNG/JPEG and verify centering, sizing and transparency.
- [ ] Change blend modes and opacity on overlapping layers; export matches the visible composite.
- [ ] Apply scale/rotation/translation and both flips; undo restores the original pixels and metadata.
- [ ] Transforming a masked AI layer preserves its visible masked shape, then becomes a pixel layer.

## Adjustments

- [ ] Select a non-empty image layer; the Adjustments panel identifies it correctly.
- [ ] Exposure, temperature, brightness, contrast, saturation and hue update the layer.
- [ ] Levels black/white sliders cannot cross; gamma affects midtones.
- [ ] All three curve controls update the curve preview and the image.
- [ ] Sharpen and blur work; Reset restores original adjustments.
- [ ] Histogram updates after edits and layer switches, without stale data after painting.
- [ ] Hold Compare with mouse or keyboard; release or blur restores edited output.
- [ ] Presets apply, remain editable and can be undone.

## Selection, AI and files

- [ ] Rectangular selection limits brush/eraser; clearing it restores full-canvas editing.
- [ ] Convert selection to mask, clear the mask and verify original pixels return.
- [ ] Generate a Demo AI layer; same parameters reproduce its image and different seeds change it.
- [ ] Replacement requires a selection and affects only that rectangle on a new layer.
- [ ] Expansion adds 128px on each edge and translates existing layers/masks/AI regions.
- [ ] Undo/redo expansion restores dimensions. Repeated expansion keeps metadata aligned.
- [ ] Save/open an .aster document containing new adjustments and blends; verify exact restoration.
- [ ] Open a Studio 01 project and confirm sensible defaults for new fields.
- [ ] Export PNG, open the downloaded image and verify dimensions/transparency with no UI borders.
- [ ] Verify fullscreen entry/exit and browser download behavior.
- [ ] An unreachable or invalid provider leaves the document intact and unlocks editing after failure.
