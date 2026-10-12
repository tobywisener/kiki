import { imageMaxBytes, imageMime } from '../supabase/functions/_shared/images.ts'

export async function validateSelectedImage(file: Blob): Promise<string> {
  if (!file.size || file.size > imageMaxBytes) throw new RangeError('Choose an image under 10 MB')
  const mime = imageMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
  if (!mime) throw new TypeError('Choose a JPEG, PNG, WebP or GIF image')
  return mime
}
