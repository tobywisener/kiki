import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageNotification } from '../supabase/functions/_shared/notifications.ts'

test('notifications show the sender and original message with a compact multiline preview', () => {
  assert.deepEqual(messageNotification(' Toby ', { id: 'one', original: '  Hello\n\tthere! 💛  ' }, 'th'), {
    title: 'Toby', body: 'Hello there! 💛', tag: 'kiki-one',
  })
  assert.equal(messageNotification('คุณ', { id: 'two', original: 'คิดถึงนะ' }, 'en').body, 'คิดถึงนะ')
})

test('image notifications identify photos and include captions without exposing image URLs', () => {
  const photo = { id: 'photo', original: '', image_url: 'https://i.ibb.co/abc/photo.jpg' }
  assert.equal(messageNotification('Person', photo, 'en').body, '📷 Photo')
  assert.equal(messageNotification('Person', photo, 'th').body, '📷 รูปภาพ')
  assert.equal(messageNotification('Person', { ...photo, original: 'Our dinner 🍜' }, 'en').body, '📷 Our dinner 🍜')
  assert.equal(messageNotification('Person', { ...photo, original: '  \n ' }, 'th').body, '📷 รูปภาพ')
})

test('long previews fit the push payload without splitting emoji or Thai combining characters', () => {
  for (const ending of ['👩🏽‍💻', 'กิ้', '🇹🇭']) {
    const body = messageNotification('Person', { id: 'long', original: 'a'.repeat(157) + ending + 'some more text' }, 'en').body
    assert.equal(body, 'a'.repeat(157) + '…')
    assert.ok(body.length <= 160)
  }
  const body = messageNotification('Person', { id: 'marks', original: 'ก' + '้'.repeat(1800) }, 'en').body
  assert.ok(body.length <= 160)
  assert.equal(messageNotification('Person', { id: 'exact', original: 'a'.repeat(160) }, 'en').body, 'a'.repeat(160))
})

test('notifications retain a useful fallback if a name or preview is missing', () => {
  assert.equal(messageNotification(undefined, { id: 'empty', original: '' }, 'en').title, 'Kiki')
  assert.equal(messageNotification(' ', { id: 'empty', original: '' }, 'en').body, 'Sent you a message.')
  assert.equal(messageNotification('Person', { id: 'empty', original: '' }, 'th').body, 'ส่งข้อความถึงคุณ')
})
