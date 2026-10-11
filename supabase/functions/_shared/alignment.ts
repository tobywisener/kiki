export type AlignmentLink = { source: [number, number]; target: [number, number] }
export type AlignmentSide = 'source' | 'target'

function boundaries(text: string) {
  if (typeof Intl.Segmenter !== 'function') return new Set<number>()
  return new Set([text.length, ...Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.index)])
}

export function validateAlignment(value: unknown, source: string, target: string): AlignmentLink[] {
  if (!Array.isArray(value)) return []
  const sourceBoundaries = boundaries(source)
  const targetBoundaries = boundaries(target)
  // shortcut: keep links before non-BMP characters until Azure's offset units are verified with a live emoji fixture.
  const prefixEnd = (text: string) => { const index = text.search(/[\u{10000}-\u{10ffff}]/u); return index < 0 ? text.length : index }
  const sourceLimit = prefixEnd(source)
  const targetLimit = prefixEnd(target)
  const validRange = (range: unknown, limit: number, edges: Set<number>): range is [number, number] =>
    Array.isArray(range) && range.length === 2 && range.every(Number.isSafeInteger)
    && range[0] >= 0 && range[0] < range[1] && range[1] <= limit && edges.has(range[0]) && edges.has(range[1])
  const unique = new Map<string, AlignmentLink>()
  for (const link of value) {
    if (!link || !validRange(link.source, sourceLimit, sourceBoundaries) || !validRange(link.target, targetLimit, targetBoundaries)) continue
    unique.set(`${link.source}:${link.target}`, { source: link.source, target: link.target })
  }
  return [...unique.values()]
}

export function parseAzureAlignment(projection: unknown, source: string, target: string): AlignmentLink[] {
  if (typeof projection !== 'string' || !projection.trim()) return []
  const links = projection.trim().split(/\s+/).flatMap(part => {
    const match = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(part)
    if (!match) return []
    const [, start, end, targetStart, targetEnd] = match.map(Number)
    // Azure includes the final character; stored ranges use an exclusive end for String.slice.
    return [{ source: [start, end + 1], target: [targetStart, targetEnd + 1] }]
  })
  return validateAlignment(links, source, target)
}

export function alignedSegments(text: string, links: AlignmentLink[], side: AlignmentSide) {
  const edges = [...new Set([0, text.length, ...links.flatMap(link => link[side])])].sort((a, b) => a - b)
  return edges.slice(0, -1).map((start, index) => {
    const end = edges[index + 1]
    return {
      start, text: text.slice(start, end),
      links: links.flatMap((link, id) => link[side][0] < end && link[side][1] > start ? [id] : []),
    }
  })
}
