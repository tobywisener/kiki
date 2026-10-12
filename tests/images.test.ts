import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageMaxBytes, imageMime, isMessageImageUrl, readImage } from '../supabase/functions/_shared/images.ts'
import { validateSelectedImage } from '../src/images.ts'

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

test('image uploads inspect file signatures and reject empty, oversized, or unsupported files', async () => {
  assert.equal(await validateSelectedImage(new Blob([png], { type: 'application/octet-stream' })), 'image/png')
  assert.equal(imageMime(Uint8Array.from([0xff, 0xd8, 0xff])), 'image/jpeg')
  assert.equal(imageMime(new TextEncoder().encode('GIF89a')), 'image/gif')
  assert.equal(imageMime(new TextEncoder().encode('RIFFxxxxWEBP')), 'image/webp')
  assert.equal(imageMime(new TextEncoder().encode('<svg/>')), null)
  await assert.rejects(validateSelectedImage(new Blob()), RangeError)
  await assert.rejects(validateSelectedImage(new Blob([new Uint8Array(imageMaxBytes + 1)])), RangeError)
  await assert.rejects(validateSelectedImage(new Blob(['not an image'], { type: 'image/png' })), TypeError)
})

test('message images accept only HTTPS imgbb image links, never executable or arbitrary URLs', () => {
  assert.equal(isMessageImageUrl('https://i.ibb.co/abc/kiki-test.png'), true)
  for (const url of ['http://i.ibb.co/abc/photo.jpg', 'https://i.ibb.co.attacker.test/abc/photo.jpg', 'javascript:alert(1)',
    'https://attacker.test/photo.png', 'https://i.ibb.co/abc/photo.svg', 'https://i.ibb.co/abc/photo.png?track=1',
    'https://user@i.ibb.co/abc/photo.jpg', '', null, 'https://i.ibb.co/' + 'x'.repeat(2048) + '.jpg']) {
    assert.equal(isMessageImageUrl(url), false)
  }
})

test('upload reader caps streamed bytes even when Content-Length is absent or dishonest', async () => {
  const request = (body: ReadableStream<Uint8Array>) => new Request('https://local.test', { method: 'POST', body, duplex: 'half', headers: { 'Content-Length': '0' } } as RequestInit)
  assert.deepEqual(await readImage(request(new ReadableStream({ start(controller) { controller.enqueue(png); controller.close() } }))), png)
  let cancelled = false
  await assert.rejects(readImage(request(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(imageMaxBytes + 1)) }, cancel() { cancelled = true },
  }))), RangeError)
  assert.equal(cancelled, true)
})
