import A1Raw from '../glyphs/A1.svg?raw'
import Aa1Raw from '../glyphs/Aa1.svg?raw'
import D36Raw from '../glyphs/D36.svg?raw'
import F35Raw from '../glyphs/F35.svg?raw'
import G17Raw from '../glyphs/G17.svg?raw'
import M17Raw from '../glyphs/M17.svg?raw'
import N35Raw from '../glyphs/N35.svg?raw'
import O1Raw from '../glyphs/O1.svg?raw'
import R4Raw from '../glyphs/R4.svg?raw'
import S29Raw from '../glyphs/S29.svg?raw'
import X1Raw from '../glyphs/X1.svg?raw'
import Z2Raw from '../glyphs/Z2.svg?raw'
import { type GlyphDefinition, sanitizeSvgAsset } from '../lib/svg'

const librarySeed = [
  {
    code: 'A1',
    label: 'A1',
    description: 'Seated man',
    tags: ['man', 'seated', 'human', 'person'],
    rawSvg: A1Raw,
  },
  {
    code: 'D36',
    label: 'D36',
    description: 'Arm',
    tags: ['arm', 'hand', 'limb'],
    rawSvg: D36Raw,
  },
  {
    code: 'G17',
    label: 'G17',
    description: 'Owl',
    tags: ['owl', 'bird', 'm'],
    rawSvg: G17Raw,
  },
  {
    code: 'M17',
    label: 'M17',
    description: 'Reed leaf',
    tags: ['reed', 'leaf', 'i'],
    rawSvg: M17Raw,
  },
  {
    code: 'N35',
    label: 'N35',
    description: 'Water ripple',
    tags: ['water', 'ripple', 'n'],
    rawSvg: N35Raw,
  },
  {
    code: 'O1',
    label: 'O1',
    description: 'House plan',
    tags: ['house', 'plan', 'building', 'pr'],
    rawSvg: O1Raw,
  },
  {
    code: 'R4',
    label: 'R4',
    description: 'Bread loaf on mat',
    tags: ['offering', 'mat', 'bread'],
    rawSvg: R4Raw,
  },
  {
    code: 'F35',
    label: 'F35',
    description: 'Heart and windpipe',
    tags: ['heart', 'windpipe', 'nfr'],
    rawSvg: F35Raw,
  },
  {
    code: 'X1',
    label: 'X1',
    description: 'Bread loaf',
    tags: ['bread', 'loaf', 't'],
    rawSvg: X1Raw,
  },
  {
    code: 'Z2',
    label: 'Z2',
    description: 'Two strokes',
    tags: ['strokes', 'plural', '2'],
    rawSvg: Z2Raw,
  },
  {
    code: 'Aa1',
    label: 'Aa1',
    description: 'Placenta',
    tags: ['placenta', 'aa', 'ritual'],
    rawSvg: Aa1Raw,
  },
  {
    code: 'S29',
    label: 'S29',
    description: 'Folded cloth',
    tags: ['cloth', 's', 'folded'],
    rawSvg: S29Raw,
  },
] as const

export const GLYPH_LIBRARY: GlyphDefinition[] = librarySeed.map((glyph) => ({
  code: glyph.code,
  label: glyph.label,
  description: glyph.description,
  tags: [...glyph.tags],
  source: 'library',
  asset: sanitizeSvgAsset(glyph.rawSvg),
}))

export const GLYPH_LIBRARY_MAP = new Map(
  GLYPH_LIBRARY.map((glyph) => [glyph.code.toUpperCase(), glyph]),
)
