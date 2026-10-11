import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeMessages, canRetryTranslation, toApplicationServerKey, receiptStatus, canMarkRead } from '../src/messages.ts'
import type { Message } from '../src/messages.ts'

const message: Message = {
  id: 'a', sender_id: 'one', original: 'Hello 🤍\nสวัสดี', source_language: 'en',
  translation: null, translation_status: 'pending', translation_attempted_at: null,
  created_at: '2026-10-09T10:00:00Z',
}

test('merges snapshots and realtime updates without duplicates, in chronological order', () => {
  const translated: Message = { ...message, translation: 'สวัสดี', translation_status: 'ready' }
  const later: Message = { ...message, id: 'b', created_at: '2026-10-09T10:01:00Z' }
  const merged = mergeMessages([later, message], [translated, later])
  assert.deepEqual(merged.map(item => item.id), ['a', 'b'])
  assert.equal(merged[0].translation, 'สวัสดี')
  assert.equal(merged[0].original, 'Hello 🤍\nสวัสดี')
})

test('delayed send errors and stale fetches cannot replace confirmed messages', () => {
  const ready: Message = { ...message, translation: 'สวัสดี', translation_status: 'ready' }
  assert.deepEqual(mergeMessages([ready], [{ ...message, local_status: 'failed' }, message]), [ready])
  assert.equal(mergeMessages([{ ...message, local_status: 'sending' }], [message])[0].local_status, undefined)
})

test('retry is available after a minute, including abandoned processing leases', () => {
  const now = Date.parse(message.created_at) + 61_000
  assert.equal(canRetryTranslation(message, now), true)
  assert.equal(canRetryTranslation(message, now - 2000), false)
  assert.equal(canRetryTranslation({ ...message, local_status: 'failed' }, now), false)
  assert.equal(canRetryTranslation({ ...message, translation_status: 'ready' }, now), false)
  assert.equal(canRetryTranslation({ ...message, translation_attempts: 5 }, now), false)
  assert.equal(canRetryTranslation({ ...message, translation_status: 'processing' }, now), true)
})

test('decodes the URL-safe VAPID key into the bytes required by PushManager', () => {
  const bytes = Uint8Array.from([4, 251, 255, 0, 6])
  const key = Buffer.from(bytes).toString('base64url')
  assert.deepEqual(toApplicationServerKey(key), bytes)
})

test('receipts advance without stale translation or history responses erasing them', () => {
  const delivered = { ...message, delivered_at: message.created_at }
  const read = { ...delivered, read_at: message.created_at }
  assert.equal(receiptStatus(message), 'sent')
  assert.equal(receiptStatus(delivered), 'delivered')
  assert.equal(receiptStatus(read), 'read')
  assert.equal(receiptStatus({ ...message, local_status: 'sending' }), 'sending')
  assert.equal(receiptStatus({ ...message, local_status: 'failed' }), 'failed')
  assert.equal(receiptStatus(mergeMessages([read], [message])[0]), 'read')
  const translated = { ...message, translation: 'สวัสดี', translation_status: 'ready' as const }
  const merged = mergeMessages([translated], [read])[0]
  assert.equal(merged.translation, 'สวัสดี')
  assert.equal(receiptStatus(merged), 'read')
})

test('read receipts require an on-screen message in a visible, focused chat', () => {
  assert.equal(canMarkRead(true, true, true), true)
  assert.equal(canMarkRead(false, true, true), false)
  assert.equal(canMarkRead(true, false, true), false)
  assert.equal(canMarkRead(true, true, false), false)
})
