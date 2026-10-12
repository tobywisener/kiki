export const imageMaxBytes = 10 * 1024 * 1024
export const imageAccept = 'image/jpeg,image/png,image/webp,image/gif'

export function imageMime(bytes: Uint8Array): string | null {
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value)
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png'
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return 'image/gif'
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  return null
}

export function isMessageImageUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048
    && /^https:\/\/i\.ibb\.co\/[A-Za-z0-9/_-]+\.(?:jpe?g|png|webp|gif)$/.test(value)
}

export async function readImage(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > imageMaxBytes) { await reader.cancel(); throw new RangeError('Image is too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}
