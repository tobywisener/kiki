import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageNotification } from '../supabase/functions/_shared/notifications.ts'

test('notifications show the sender and a compact preview in the recipient language', () => {
  assert.deepEqual(messageNotification(' Toby ', { id: 'one', original: 'Hello there! 💛', source_language: 'en', translation: '  สวัสดี\n\tนะ! 💛  ', translation_status: 'ready' }, 'th'), {
    title: 'Toby', body: 'สวัสดี นะ! 💛', tag: 'kiki-one',
  })
  assert.equal(messageNotification('คุณ', { id: 'two', original: 'คิดถึงนะ', source_language: 'th', translation: 'Miss you', translation_status: 'ready' }, 'en').body, 'Miss you')
  assert.equal(messageNotification('Person', { id: 'same', original: 'Hello\nthere!', source_language: 'en', translation: 'สวัสดี', translation_status: 'ready' }, 'en').body, 'Hello there!')
})

test('image notifications identify photos and include captions without exposing image URLs', () => {
  const photo = { id: 'photo', original: '', source_language: 'en', image_url: 'https://i.ibb.co/abc/photo.jpg' }
  assert.equal(messageNotification('Person', photo, 'en').body, '📷 Photo')
  assert.equal(messageNotification('Person', photo, 'th').body, '📷 รูปภาพ')
  assert.equal(messageNotification('Person', { ...photo, original: 'Our dinner 🍜' }, 'en').body, '📷 Our dinner 🍜')
  assert.equal(messageNotification('Person', { ...photo, original: 'Our dinner 🍜', translation: 'อาหารเย็นของเรา 🍜', translation_status: 'ready' }, 'th').body, '📷 อาหารเย็นของเรา 🍜')
  assert.equal(messageNotification('Person', { ...photo, original: 'Our dinner 🍜', translation_status: 'failed' }, 'th').body, '📷 รูปภาพ')
  assert.equal(messageNotification('Person', { ...photo, original: '  \n ' }, 'th').body, '📷 รูปภาพ')
})

test('long previews fit the push payload without splitting emoji or Thai combining characters', () => {
  for (const ending of ['👩🏽‍💻', 'กิ้', '🇹🇭']) {
    const body = messageNotification('Person', { id: 'long', original: 'ข้อความเดิม', source_language: 'th', translation: 'a'.repeat(157) + ending + 'some more text', translation_status: 'ready' }, 'en').body
    assert.equal(body, 'a'.repeat(157) + '…')
    assert.ok(body.length <= 160)
  }
  const body = messageNotification('Person', { id: 'marks', original: 'ก' + '้'.repeat(1800), source_language: 'th' }, 'th').body
  assert.ok(body.length <= 160)
  assert.equal(messageNotification('Person', { id: 'exact', original: 'a'.repeat(160), source_language: 'en' }, 'en').body, 'a'.repeat(160))
})

test('notifications retain a useful fallback if a name or preview is missing', () => {
  assert.equal(messageNotification(undefined, { id: 'empty', original: '', source_language: 'en' }, 'en').title, 'Kiki')
  for (const status of ['pending', 'processing', 'failed', 'ready']) {
    const unavailable = { id: 'empty', original: 'Wrong language', source_language: 'en', translation: status === 'ready' ? '  \n ' : 'Stale translation', translation_status: status }
    assert.equal(messageNotification('Person', unavailable, 'th').body, 'ส่งข้อความถึงคุณ')
    assert.equal(messageNotification(' ', { ...unavailable, source_language: 'th' }, 'en').body, 'Sent you a message.')
  }
})
