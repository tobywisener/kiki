import { adminClient, corsHeaders, getMember, json } from '../_shared/http.ts'
import { imageMime, isMessageImageUrl, readImage } from '../_shared/images.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    if (!await getMember(req, adminClient())) return json({ error: 'Unauthorized' }, 401)
    const key = Deno.env.get('IMGBB_API_KEY')
    if (!key) return json({ error: 'Image uploads are not configured', code: 'not_configured' }, 503)
    let bytes
    try { bytes = await readImage(req) }
    catch (error) { return json({ error: 'Image is too large or unreadable', code: 'invalid_image' }, error instanceof RangeError ? 413 : 400) }
    const mime = imageMime(bytes)
    if (!mime || req.headers.get('Content-Type')?.split(';')[0] !== mime) {
      return json({ error: 'Choose a JPEG, PNG, WebP or GIF image', code: 'invalid_image' }, 415)
    }
    const form = new FormData()
    form.append('key', key)
    form.append('image', new Blob([bytes], { type: mime }), `kiki-${crypto.randomUUID()}.${mime === 'image/jpeg' ? 'jpg' : mime.slice(6)}`)
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST', body: form, signal: AbortSignal.any([req.signal, AbortSignal.timeout(30_000)]),
    })
    if (!response.ok) throw new Error('Image provider failed')
    const result = await response.json()
    if (!isMessageImageUrl(result?.data?.url)) throw new Error('Invalid image URL')
    return json({ image_url: result.data.url })
  } catch { return json({ error: 'Could not upload the image. Please try again.' }, 502) }
})
