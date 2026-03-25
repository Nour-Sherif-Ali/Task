import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from 'react'
import { GLYPH_LIBRARY, GLYPH_LIBRARY_MAP } from './data/glyphLibrary'
import {
  buildClipboardSvg,
  buildLayout,
  EDITOR_GAP,
  EDITOR_QUADRAT,
  EDITOR_ROW_GAP,
  extractInstancesFromExport,
  getGlyphTransform,
  parseSvgFromHtml,
  sanitizeSvgAsset,
  tokenizeSignCodes,
  type CopyPreset,
  type GlyphDefinition,
  type GlyphInstance,
} from './lib/svg'

const COPY_PRESET_LABELS: Record<CopyPreset, string> = {
  small: 'Copy: Small',
  large: 'Copy: Large',
  wysiwyg: 'Copy: WYSIWYG',
}

const COPY_PRESET_QUADRATS: Record<Exclude<CopyPreset, 'wysiwyg'>, number> = {
  small: 92,
  large: 156,
}

function clampScale(value: number) {
  return Math.max(0.45, Math.min(1.85, value))
}

function createInstance(glyph: GlyphDefinition, row: number): GlyphInstance {
  return {
    id: crypto.randomUUID(),
    glyph,
    row,
    rotation: 0,
    flipX: false,
    flipY: false,
    scale: 1,
  }
}

function createInitialInstances() {
  return [
    createInstance(GLYPH_LIBRARY_MAP.get('A1')!, 0),
    createInstance(GLYPH_LIBRARY_MAP.get('D36')!, 0),
    createInstance(GLYPH_LIBRARY_MAP.get('G17')!, 0),
    createInstance(GLYPH_LIBRARY_MAP.get('N35')!, 0),
    createInstance(GLYPH_LIBRARY_MAP.get('M17')!, 1),
    createInstance(GLYPH_LIBRARY_MAP.get('O1')!, 1),
    createInstance(GLYPH_LIBRARY_MAP.get('X1')!, 1),
  ]
}

function App() {
  const [instances, setInstances] = useState<GlyphInstance[]>(createInitialInstances)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [activeRow, setActiveRow] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState(
    'Paste SVG or Gardiner codes, then copy as real inline SVG with HTML and plain-text clipboard payloads.',
  )
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const externalCounterRef = useRef(1)

  const rowOptions = Array.from(
    { length: Math.max(2, Math.max(0, ...instances.map((instance) => instance.row)) + 2) },
    (_, index) => index,
  )

  const filteredGlyphs = GLYPH_LIBRARY.filter((glyph) => {
    if (!deferredSearch) {
      return true
    }

    const haystack = `${glyph.code} ${glyph.description} ${glyph.tags.join(' ')}`.toLowerCase()
    return haystack.includes(deferredSearch)
  })

  const selectedInstances = instances.filter((instance) => selectedIds.includes(instance.id))
  const selectedCount = selectedInstances.length
  const selectedScale = selectedCount
    ? selectedInstances.reduce((total, instance) => total + instance.scale, 0) / selectedCount
    : 1
  const selectedRows = Array.from(new Set(selectedInstances.map((instance) => instance.row))).sort(
    (a, b) => a - b,
  )
  const layout = buildLayout(instances, EDITOR_QUADRAT, EDITOR_GAP, EDITOR_ROW_GAP)

  function selectGlyph(instanceId: string, isToggleSelection: boolean) {
    setSelectedIds((current) => {
      if (!isToggleSelection) {
        return [instanceId]
      }

      return current.includes(instanceId)
        ? current.filter((id) => id !== instanceId)
        : [...current, instanceId]
    })
  }

  function appendInstances(nextInstances: GlyphInstance[]) {
    if (nextInstances.length === 0) {
      return
    }

    setInstances((current) => [...current, ...nextInstances])
    setSelectedIds(nextInstances.map((instance) => instance.id))
  }

  function resolveExternalCode(hint: string) {
    const cleanedHint = hint.replace(/[^a-z0-9_-]/gi, '').toUpperCase()
    if (cleanedHint && !GLYPH_LIBRARY_MAP.has(cleanedHint)) {
      return cleanedHint
    }

    const code = `WEB${externalCounterRef.current}`
    externalCounterRef.current += 1
    return code
  }

  function createExternalGlyph(rawSvg: string, codeHint: string) {
    const code = resolveExternalCode(codeHint)

    return {
      code,
      label: code,
      description: 'Imported inline SVG',
      tags: ['imported', 'svg', 'external'],
      source: 'external' as const,
      asset: sanitizeSvgAsset(rawSvg),
    }
  }

  function insertGlyph(glyph: GlyphDefinition) {
    const instance = createInstance(glyph, activeRow)
    appendInstances([instance])
    setStatus(`Inserted ${glyph.code} on row ${activeRow + 1}.`)
  }

  function updateSelection(transformer: (instance: GlyphInstance) => GlyphInstance) {
    if (selectedCount === 0) {
      setStatus('Select at least one glyph first.')
      return
    }

    setInstances((current) =>
      current.map((instance) =>
        selectedIds.includes(instance.id) ? transformer(instance) : instance,
      ),
    )
  }

  function deleteSelection() {
    if (selectedCount === 0) {
      return
    }

    setInstances((current) => current.filter((instance) => !selectedIds.includes(instance.id)))
    setSelectedIds([])
    setStatus(`Removed ${selectedCount} glyph${selectedCount === 1 ? '' : 's'}.`)
  }

  async function copySelection(preset: CopyPreset) {
    if (selectedCount === 0) {
      setStatus('Select one or more glyphs before copying.')
      return
    }

    const quadrat =
      preset === 'wysiwyg' ? Math.round(EDITOR_QUADRAT * zoom) : COPY_PRESET_QUADRATS[preset]
    const payload = buildClipboardSvg(selectedInstances, quadrat)

    try {
      if (navigator.clipboard && 'write' in navigator.clipboard && 'ClipboardItem' in window) {
        const item = new ClipboardItem({
          'text/html': new Blob([payload.html], { type: 'text/html' }),
          'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
          'image/svg+xml': new Blob([payload.svg], { type: 'image/svg+xml' }),
        })

        await navigator.clipboard.write([item])
      } else {
        await navigator.clipboard.writeText(payload.plain)
      }

      setStatus(
        `${COPY_PRESET_LABELS[preset]} copied ${selectedCount} glyph${selectedCount === 1 ? '' : 's'} as inline SVG.`,
      )
    } catch {
      setStatus('Clipboard write failed. Use a secure browser context and grant clipboard access.')
    }
  }

  async function pasteFromPayload(payload: { html?: string; svg?: string; plain?: string }) {
    const svgElement =
      (payload.html ? parseSvgFromHtml(payload.html) : null) ??
      (payload.svg
        ? (() => {
            const root = new DOMParser().parseFromString(payload.svg, 'image/svg+xml').documentElement
            return root instanceof SVGSVGElement ? root : null
          })()
        : null)

    if (svgElement?.tagName.toLowerCase() === 'svg') {
      const reconstructed = extractInstancesFromExport(svgElement, createExternalGlyph, (code) =>
        GLYPH_LIBRARY_MAP.get(code.toUpperCase()),
      )

      if (reconstructed.length > 0) {
        const rowOffset = activeRow
        appendInstances(
          reconstructed.map((instance) => ({
            ...instance,
            id: crypto.randomUUID(),
            row: instance.row + rowOffset,
          })),
        )
        setStatus(`Pasted ${reconstructed.length} glyphs from SVG clipboard data.`)
        return
      }

      appendInstances([createInstance(createExternalGlyph(svgElement.outerHTML, 'web'), activeRow)])
      setStatus('Imported external inline SVG as a manipulable glyph.')
      return
    }

    const tokens = tokenizeSignCodes(payload.plain ?? '')
    if (tokens.length > 0) {
      const glyphs = tokens
        .map((token) => GLYPH_LIBRARY_MAP.get(token.toUpperCase()))
        .filter((glyph): glyph is GlyphDefinition => Boolean(glyph))

      if (glyphs.length > 0) {
        appendInstances(glyphs.map((glyph) => createInstance(glyph, activeRow)))
        setStatus(`Pasted ${glyphs.length} glyphs from plain-text Gardiner codes.`)
        return
      }
    }

    setStatus('Clipboard did not contain supported SVG or recognized sign codes.')
  }

  async function pasteFromClipboard() {
    try {
      let html = ''
      let svg = ''
      let plain = ''

      if (navigator.clipboard && 'read' in navigator.clipboard) {
        const items = await navigator.clipboard.read()

        for (const item of items) {
          if (!html && item.types.includes('text/html')) {
            html = await (await item.getType('text/html')).text()
          }

          if (!svg && item.types.includes('image/svg+xml')) {
            svg = await (await item.getType('image/svg+xml')).text()
          }

          if (!plain && item.types.includes('text/plain')) {
            plain = await (await item.getType('text/plain')).text()
          }
        }
      }

      if (!plain && navigator.clipboard?.readText) {
        plain = await navigator.clipboard.readText()
      }

      await pasteFromPayload({ html, svg, plain })
    } catch {
      setStatus('Clipboard read failed. Use Ctrl/Cmd+V or grant clipboard read permission.')
    }
  }

  const handleDeleteKey = useEffectEvent(() => {
    deleteSelection()
  })

  const handleWindowPaste = useEffectEvent(async (payload: { html?: string; plain?: string }) => {
    await pasteFromPayload(payload)
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        handleDeleteKey()
      }
    }

    async function handlePaste(event: ClipboardEvent) {
      const html = event.clipboardData?.getData('text/html') ?? ''
      const plain = event.clipboardData?.getData('text/plain') ?? ''

      if (!html && !plain) {
        return
      }

      event.preventDefault()
      await handleWindowPaste({ html, plain })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('paste', handlePaste)
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <h1>JSesh-style SVG clipboard editor</h1>
          <p className="hero-copy">
            Inline SVG composition, per-glyph transforms, real HTML clipboard payloads, and
            clipboard paste that can rebuild both JSesh-style selections and external SVG.
          </p>
        </div>
        <div className="hero-metrics">
          <div>
            <strong>{instances.length}</strong>
            <span>glyphs on canvas</span>
          </div>
          <div>
            <strong>{selectedCount}</strong>
            <span>selected</span>
          </div>
          <div>
            <strong>{layout.rows.length}</strong>
            <span>rows</span>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <div className="panel-header">
            <div>
              <h2>Glyph library</h2>
              <p>Real JSesh SVG assets imported from the upstream sign library.</p>
            </div>
            <span className="pill">{filteredGlyphs.length} signs</span>
          </div>

          <label className="field">
            <span>Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="A1, owl, water, folded cloth"
            />
          </label>

          <label className="field">
            <span>Insert row</span>
            <select
              value={activeRow}
              onChange={(event) => setActiveRow(Number(event.target.value))}
            >
              {rowOptions.map((row) => (
                <option key={row} value={row}>
                  Row {row + 1}
                </option>
              ))}
            </select>
          </label>

          <div className="glyph-grid">
            {filteredGlyphs.map((glyph) => (
              <button
                key={glyph.code}
                type="button"
                className="glyph-card"
                onClick={() => insertGlyph(glyph)}
              >
                <svg viewBox="0 0 100 100" className="glyph-preview" aria-hidden="true">
                  <g
                    transform={getGlyphTransform(
                      {
                        id: glyph.code,
                        glyph,
                        row: 0,
                        rotation: 0,
                        flipX: false,
                        flipY: false,
                        scale: 1,
                      },
                      100,
                    )}
                    dangerouslySetInnerHTML={{ __html: glyph.asset.markup }}
                  />
                </svg>
                <strong>{glyph.code}</strong>
                <span>{glyph.description}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="editor-column">
          <div className="toolbar panel">
            <div className="panel-header">
              <div>
                <h2>Canvas controls</h2>
                <p>All transforms are applied in SVG coordinates, not CSS pixels.</p>
              </div>
              <span className="pill status-pill">{status}</span>
            </div>

            <div className="toolbar-grid">
              <div className="toolbar-group">
                <span>Selection</span>
                <div className="button-row">
                  <button type="button" onClick={() => updateSelection((instance) => ({
                    ...instance,
                    rotation: (((instance.rotation + 90) % 360) || 0) as GlyphInstance['rotation'],
                  }))}>
                    Rotate 90deg
                  </button>
                  <button type="button" onClick={() => updateSelection((instance) => ({
                    ...instance,
                    rotation: (((instance.rotation + 180) % 360) || 0) as GlyphInstance['rotation'],
                  }))}>
                    Rotate 180deg
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelection((instance) => ({ ...instance, flipX: !instance.flipX }))}
                  >
                    Flip H
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelection((instance) => ({ ...instance, flipY: !instance.flipY }))}
                  >
                    Flip V
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSelection((instance) => ({ ...instance, row: Math.max(0, instance.row - 1) }))
                    }
                  >
                    Row -
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelection((instance) => ({ ...instance, row: instance.row + 1 }))}
                  >
                    Row +
                  </button>
                  <button type="button" className="danger" onClick={deleteSelection}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="toolbar-group">
                <span>Scale</span>
                <div className="slider-row">
                  <input
                    type="range"
                    min="0.45"
                    max="1.85"
                    step="0.05"
                    value={selectedScale}
                    onChange={(event) =>
                      updateSelection((instance) => ({
                        ...instance,
                        scale: clampScale(Number(event.target.value)),
                      }))
                    }
                  />
                  <output>{selectedScale.toFixed(2)}x</output>
                </div>
              </div>

              <div className="toolbar-group">
                <span>Clipboard</span>
                <div className="button-row">
                  <button type="button" onClick={() => copySelection('small')}>
                    Copy: Small
                  </button>
                  <button type="button" onClick={() => copySelection('large')}>
                    Copy: Large
                  </button>
                  <button type="button" onClick={() => copySelection('wysiwyg')}>
                    Copy: WYSIWYG
                  </button>
                  <button type="button" onClick={pasteFromClipboard}>
                    Paste clipboard
                  </button>
                </div>
              </div>

              <div className="toolbar-group">
                <span>Zoom</span>
                <div className="slider-row">
                  <input
                    type="range"
                    min="0.5"
                    max="1.8"
                    step="0.05"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                  <output>{Math.round(zoom * 100)}%</output>
                </div>
              </div>
            </div>
          </div>

          <div className="canvas-panel panel">
            <div className="panel-header">
              <div>
                <h2>SVG canvas</h2>
                <p>
                  Shift-click for multi-select. Use Ctrl/Cmd+V to paste inline SVG or plain-text
                  Gardiner codes.
                </p>
              </div>
              <span className="pill">
                {selectedRows.length > 0
                  ? `Rows ${selectedRows.map((row) => row + 1).join(', ')}`
                  : 'No row selected'}
              </span>
            </div>

            <div className="canvas-scroller">
              <svg
                className="editor-stage"
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                style={{
                  width: `${layout.width * zoom}px`,
                  height: `${layout.height * zoom}px`,
                }}
              >
                <rect
                  x="0"
                  y="0"
                  width={layout.width}
                  height={layout.height}
                  rx="24"
                  fill="rgba(255, 250, 238, 0.9)"
                  stroke="rgba(95, 62, 28, 0.14)"
                  onPointerDown={() => setSelectedIds([])}
                />

                {layout.positioned.map(({ instance, x, y }) => {
                  const isSelected = selectedIds.includes(instance.id)

                  return (
                    <g
                      key={instance.id}
                      className="canvas-glyph"
                      transform={`translate(${x} ${y})`}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        selectGlyph(instance.id, event.shiftKey || event.metaKey || event.ctrlKey)
                        setActiveRow(instance.row)
                      }}
                    >
                      <rect
                        x="0"
                        y="0"
                        width={EDITOR_QUADRAT}
                        height={EDITOR_QUADRAT}
                        rx="18"
                        className={isSelected ? 'quadrat quadrat-selected' : 'quadrat'}
                      />
                      <g
                        transform={getGlyphTransform(instance, EDITOR_QUADRAT)}
                        dangerouslySetInnerHTML={{ __html: instance.glyph.asset.markup }}
                      />
                      <text x="12" y={EDITOR_QUADRAT - 12} className="glyph-code">
                        {instance.glyph.code}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
