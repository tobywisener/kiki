export type PronunciationPart = { start: number; end: number; text: string }

export function thaiWords(text: string) {
  return Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(text), part => ({
    start: part.index, end: part.index + part.segment.length, text: part.segment,
  }))
}

export function validatePronunciationParts(value: unknown, thai: string): PronunciationPart[] {
  if (!Array.isArray(value) || !value.length) return []
  const boundaries = new Set([thai.length, ...Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(thai), part => part.index)])
  let end = 0
  for (const part of value) {
    if (!part || !Number.isSafeInteger(part.start) || !Number.isSafeInteger(part.end) || part.start !== end || part.end <= part.start
      || !boundaries.has(part.end) || typeof part.text !== 'string' || !part.text.length || part.text.length > 5000) return []
    end = part.end
  }
  return end === thai.length ? value : []
}

export function pronunciationSpace(previous: string | undefined, current: string) {
  return previous && /[\p{L}\p{N}]$/u.test(previous) && /^[\p{L}\p{N}]/u.test(current) ? ' ' : ''
}

export function pronunciationText(parts: PronunciationPart[]) {
  return parts.map((part, index) => pronunciationSpace(parts[index - 1]?.text, part.text) + part.text).join('')
}

export async function romanizeThaiWords(thai: string, headers: Record<string, string>): Promise<PronunciationPart[]> {
  const parts = thaiWords(thai)
  const words = parts.filter(part => /\p{Script=Thai}/u.test(part.text))
  if (!words.length || words.some(part => part.text.length > 1000)) return []
  const batches: PronunciationPart[][] = []
  for (const word of words) {
    const last = batches.at(-1)
    if (!last || last.length === 10 || last.reduce((size, part) => size + part.text.length, 0) + word.text.length > 5000) batches.push([word])
    else last.push(word)
  }
  const signal = AbortSignal.timeout(5_000)
  try {
    // Bound concurrency and total wait so pronunciation never holds up chat indefinitely.
    let next = 0
    const results = await Promise.allSettled(Array.from({ length: Math.min(3, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++]
        const response = await fetch('https://api.cognitive.microsofttranslator.com/transliterate?api-version=3.0&language=th&fromScript=Thai&toScript=Latn', {
          method: 'POST', headers, body: JSON.stringify(batch.map(part => ({ Text: part.text }))), signal,
        })
        if (!response.ok) throw new Error('Pronunciation unavailable')
        const result = await response.json()
        if (!Array.isArray(result) || result.length !== batch.length) throw new Error('Invalid pronunciation')
        for (let index = 0; index < batch.length; index++) {
          const reading = result[index]
          if (reading?.script !== 'Latn' || typeof reading.text !== 'string' || !reading.text.trim() || reading.text.length > 5000) throw new Error('Invalid pronunciation')
          batch[index].text = reading.text.trim()
        }
      }
    }))
    return results.every(result => result.status === 'fulfilled') ? validatePronunciationParts(parts, thai) : []
  } catch { return [] }
}
