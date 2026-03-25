# JSesh-Style SVG Editor MVP

Frontend-only React + TypeScript MVP for a JSesh-inspired hieroglyph editor with SVG-first rendering, per-glyph transforms, and real SVG clipboard copy/paste.

## What this MVP covers

- Real inline SVG rendering only. No canvas and no raster export path.
- JSesh glyph subset imported from the upstream `jseshGlyphs` SVG library.
- Horizontal quadrat-based composition with multi-row layout.
- Single and multi-selection.
- Per-glyph rotate, flip horizontal, flip vertical, and uniform scale.
- Clipboard copy presets:
  - `Copy: Small`
  - `Copy: Large`
  - `Copy: WYSIWYG`
- Clipboard payloads:
  - `text/html` with inline `<svg>`
  - `image/svg+xml`
  - `text/plain` fallback with Gardiner codes
- Paste behavior:
  - Reconstructs editor glyphs from exported SVG metadata
  - Imports arbitrary inline SVG from the clipboard as an external manipulable glyph
  - Parses plain-text Gardiner codes such as `A1 D36 G17`

## Run

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run lint
npm run build
```

## Architecture

### UI

- `src/App.tsx`
  - editor state
  - glyph insertion
  - selection model
  - transform controls
  - clipboard copy/paste flow
  - SVG canvas rendering

### Glyph data

- `src/data/glyphLibrary.ts`
  - imports a practical JSesh subset as raw SVG files
  - normalizes them into app glyph definitions

### SVG pipeline

- `src/lib/svg.ts`
  - sanitizes raw SVG
  - derives `viewBox` when missing
  - computes fixed-quadrat layout
  - computes SVG transform matrices
  - serializes clipboard SVG payloads
  - reconstructs glyph instances from pasted exported SVG

## SVG Composition Model

Each glyph instance is rendered into a fixed quadrat. The app does not resize glyphs with CSS transforms. Instead it computes a glyph-space transform like:

```text
translate(quadratCenter)
rotate(rotation)
scale(fitScale * flipX, fitScale * flipY)
translate(-glyphViewBoxCenter)
```

This keeps transforms in SVG coordinates and keeps the output sharp at any zoom level.

Layout is intentionally scoped:

- fixed quadrat size
- horizontal flow per row
- row gap + glyph gap
- consistent fitting rule based on the glyph viewBox

## Clipboard Format

### Copy

On copy, the app writes:

- `text/html`: a real inline `<svg>` payload
- `image/svg+xml`: direct SVG payload
- `text/plain`: Gardiner codes grouped by row

The exported SVG embeds metadata per glyph group:

- `data-code`
- `data-row`
- `data-rotation`
- `data-flip-x`
- `data-flip-y`
- `data-scale`
- `data-source`

That allows a later paste to reconstruct editor instances instead of flattening everything into a single static drawing.

### Paste

Paste resolution order:

1. `text/html` inline SVG
2. `image/svg+xml`
3. `text/plain`

If the SVG came from this app, the metadata is used to rebuild glyph instances and transforms.

If the SVG came from somewhere else on the web, the SVG is imported as an external glyph asset and can still be selected, scaled, rotated, and flipped like library glyphs.

If only plain text exists, the app tokenizes sign codes and inserts matching glyphs from the local library subset.

## Tradeoffs

- The library is intentionally a subset for MVP speed. The pipeline is structured so the full JSesh library can be added without changing the editor model.
- External SVG import is practical rather than exhaustive. It preserves inline SVG content, but very complex SVGs with advanced ID-driven defs, scripting, or exotic features are not deeply normalized.
- Layout is fixed-quadrat horizontal composition, not full Manuel de Codage grammar or JSesh-style nested grouping.
- Export reconstruction depends on embedded metadata. That is deliberate: it preserves editor semantics while still producing a valid standalone SVG for Word / Docs paste.

## Browser Notes

- Full clipboard read/write requires a secure browser context (`localhost` or HTTPS) and browser permission.
- Keyboard paste via `Ctrl+V` / `Cmd+V` is also supported.

## JSesh Sources

- Copy/paste behavior reference: https://jseshdoc.qenherkhopeshef.org/en/graphical_exports/copy_paste
- Glyph importing reference: https://jseshdoc.qenherkhopeshef.org/en/extending_sign_list/importingglyphs
- SVG notes: https://jseshdoc.qenherkhopeshef.org/en/extending_sign_list/svg
- Glyph dataset: https://github.com/rosmord/jsesh/tree/master/jseshGlyphs/src/main/resources/jseshGlyphs
