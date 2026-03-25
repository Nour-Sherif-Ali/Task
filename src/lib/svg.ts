const SVG_NS = 'http://www.w3.org/2000/svg'
const SERIALIZER = new XMLSerializer()

export const EDITOR_QUADRAT = 180
export const EDITOR_GAP = 24
export const EDITOR_ROW_GAP = 34
export const GLYPH_PADDING = 18

export type CopyPreset = 'small' | 'large' | 'wysiwyg'

export interface SvgAsset {
  markup: string
  rawSvg: string
  viewBox: [number, number, number, number]
}

export interface GlyphDefinition {
  code: string
  label: string
  description: string
  tags: string[]
  source: 'library' | 'external'
  asset: SvgAsset
}

export interface GlyphInstance {
  id: string
  glyph: GlyphDefinition
  row: number
  rotation: 0 | 90 | 180 | 270
  flipX: boolean
  flipY: boolean
  scale: number
}

export interface PositionedGlyph {
  instance: GlyphInstance
  x: number
  y: number
  column: number
}

export interface LayoutResult {
  rows: number[]
  width: number
  height: number
  positioned: PositionedGlyph[]
}

function parseDimension(value: string | null): number | null {
  if (!value) {
    return null
  }

  const match = value.match(/-?\d*\.?\d+/)
  if (!match) {
    return null
  }

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function parseViewBox(root: SVGSVGElement): [number, number, number, number] {
  const viewBox = root.getAttribute('viewBox')
  if (viewBox) {
    const numbers = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((value) => Number.isFinite(value))

    if (numbers.length === 4) {
      return [numbers[0], numbers[1], numbers[2], numbers[3]]
    }
  }

  const width = parseDimension(root.getAttribute('width')) ?? 1800
  const height = parseDimension(root.getAttribute('height')) ?? width
  return [0, 0, width, height]
}

export function sanitizeSvgAsset(rawSvg: string): SvgAsset {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawSvg, 'image/svg+xml')
  const root = doc.documentElement

  if (!(root instanceof SVGSVGElement) || root.nodeName.toLowerCase() === 'parsererror') {
    throw new Error('Unable to parse SVG payload.')
  }

  root.querySelectorAll('parsererror, metadata, sodipodi\\:namedview, script').forEach((node) => {
    node.remove()
  })

  if (root.namespaceURI !== SVG_NS) {
    throw new Error('Clipboard payload is not valid SVG.')
  }

  const viewBox = parseViewBox(root)
  const markup = Array.from(root.childNodes)
    .map((node) => SERIALIZER.serializeToString(node))
    .join('')

  return {
    markup,
    rawSvg,
    viewBox,
  }
}

export function tokenizeSignCodes(text: string): string[] {
  return text
    .split(/[\s,;|]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

export function buildLayout(
  instances: GlyphInstance[],
  quadrat = EDITOR_QUADRAT,
  gap = EDITOR_GAP,
  rowGap = EDITOR_ROW_GAP,
): LayoutResult {
  const rows = Array.from(new Set(instances.map((instance) => instance.row))).sort((a, b) => a - b)
  const rowOrder = new Map(rows.map((row, index) => [row, index]))
  const columnCount = new Map<number, number>()

  const positioned = instances.map((instance) => {
    const rowIndex = rowOrder.get(instance.row) ?? 0
    const column = columnCount.get(instance.row) ?? 0
    columnCount.set(instance.row, column + 1)

    return {
      instance,
      column,
      x: column * (quadrat + gap),
      y: rowIndex * (quadrat + rowGap),
    }
  })

  const maxColumns = Math.max(1, ...Array.from(columnCount.values(), (count) => count))

  return {
    rows,
    positioned,
    width: maxColumns * quadrat + Math.max(0, maxColumns - 1) * gap,
    height: rows.length * quadrat + Math.max(0, rows.length - 1) * rowGap,
  }
}

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString()
}

export function getGlyphTransform(instance: GlyphInstance, quadrat = EDITOR_QUADRAT) {
  const [minX, minY, width, height] = instance.glyph.asset.viewBox
  const usable = quadrat - GLYPH_PADDING * 2
  const baseScale = usable / Math.max(width, height)
  const fittedScale = baseScale * instance.scale
  const flipScaleX = instance.flipX ? -fittedScale : fittedScale
  const flipScaleY = instance.flipY ? -fittedScale : fittedScale
  const centerX = minX + width / 2
  const centerY = minY + height / 2

  return [
    `translate(${formatNumber(quadrat / 2)} ${formatNumber(quadrat / 2)})`,
    `rotate(${instance.rotation})`,
    `scale(${formatNumber(flipScaleX)} ${formatNumber(flipScaleY)})`,
    `translate(${formatNumber(-centerX)} ${formatNumber(-centerY)})`,
  ].join(' ')
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function buildGlyphGroupMarkup(
  instance: GlyphInstance,
  x: number,
  y: number,
  quadrat: number,
): string {
  const transform = getGlyphTransform(instance, quadrat)
  const [minX, minY, width, height] = instance.glyph.asset.viewBox

  return [
    `<g data-jsesh-glyph="1" data-code="${escapeAttribute(instance.glyph.code)}" data-label="${escapeAttribute(instance.glyph.label)}" data-source="${instance.glyph.source}" data-row="${instance.row}" data-rotation="${instance.rotation}" data-flip-x="${instance.flipX ? '1' : '0'}" data-flip-y="${instance.flipY ? '1' : '0'}" data-scale="${formatNumber(instance.scale)}" transform="translate(${formatNumber(x)} ${formatNumber(y)})">`,
    `<g data-glyph-asset="1" data-view-box="${formatNumber(minX)} ${formatNumber(minY)} ${formatNumber(width)} ${formatNumber(height)}" transform="${transform}">`,
    instance.glyph.asset.markup,
    '</g>',
    '</g>',
  ].join('')
}

export function buildClipboardSvg(
  instances: GlyphInstance[],
  quadrat: number,
  gap = EDITOR_GAP,
  rowGap = EDITOR_ROW_GAP,
): { html: string; plain: string; svg: string } {
  const normalizedRows = new Map<number, number>()
  let nextRow = 0
  const normalized = instances.map((instance) => {
    if (!normalizedRows.has(instance.row)) {
      normalizedRows.set(instance.row, nextRow)
      nextRow += 1
    }

    return {
      ...instance,
      row: normalizedRows.get(instance.row) ?? 0,
    }
  })

  const layout = buildLayout(normalized, quadrat, gap, rowGap)
  const groups = layout.positioned
    .map(({ instance, x, y }) => buildGlyphGroupMarkup(instance, x, y, quadrat))
    .join('')

  const plainLines = layout.rows.map((row) =>
    normalized
      .filter((instance) => instance.row === row)
      .map((instance) => instance.glyph.code)
      .join(' '),
  )

  const svg = [
    `<svg xmlns="${SVG_NS}" data-jsesh-selection="1" viewBox="0 0 ${formatNumber(layout.width)} ${formatNumber(layout.height)}" width="${formatNumber(layout.width)}" height="${formatNumber(layout.height)}">`,
    groups,
    '</svg>',
  ].join('')

  return {
    svg,
    html: `<div data-jsesh-export="1">${svg}</div>`,
    plain: plainLines.join('\n'),
  }
}

export function parseSvgFromHtml(html: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const svg = doc.querySelector('svg')
  return svg instanceof SVGSVGElement ? svg : null
}

export function extractInstancesFromExport(
  svg: SVGSVGElement,
  createExternalGlyph: (rawSvg: string, codeHint: string) => GlyphDefinition,
  resolveLibraryGlyph: (code: string) => GlyphDefinition | undefined,
): GlyphInstance[] {
  const groups = Array.from(svg.querySelectorAll('g[data-jsesh-glyph="1"]'))
  if (groups.length === 0) {
    return []
  }

  return groups.map((group, index) => {
    const code = group.getAttribute('data-code') ?? `P${index + 1}`
    const source = group.getAttribute('data-source') === 'external' ? 'external' : 'library'
    const rotation = Number(group.getAttribute('data-rotation')) as GlyphInstance['rotation']
    const row = Number(group.getAttribute('data-row') ?? 0)
    const flipX = group.getAttribute('data-flip-x') === '1'
    const flipY = group.getAttribute('data-flip-y') === '1'
    const scale = Number(group.getAttribute('data-scale') ?? 1)
    const assetGroup = group.querySelector('g[data-glyph-asset="1"]')
    const viewBox = assetGroup?.getAttribute('data-view-box') ?? '0 0 1800 1800'

    const glyph =
      (source === 'library' ? resolveLibraryGlyph(code) : undefined) ??
      createExternalGlyph(
        `<svg xmlns="${SVG_NS}" viewBox="${viewBox}">${assetGroup?.innerHTML ?? ''}</svg>`,
        code,
      )

    return {
      id: crypto.randomUUID(),
      glyph,
      row: Number.isFinite(row) ? row : 0,
      rotation: rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0,
      flipX,
      flipY,
      scale: Number.isFinite(scale) ? scale : 1,
    }
  })
}
