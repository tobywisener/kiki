import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedPushEndpoint, isValidSubscription, isWebhookInsert } from '../supabase/functions/_shared/validation.ts'

test('accepts phone push providers and rejects arbitrary destinations', () => {
  for (const endpoint of ['https://web.push.apple.com/token', 'https://fcm.googleapis.com/fcm/send/token', 'https://updates.push.services.mozilla.com/wpush/v2/token']) {
    assert.equal(isAllowedPushEndpoint(endpoint), true)
  }
  for (const endpoint of ['http://web.push.apple.com/token', 'https://localhost/token', 'https://fcm.googleapis.com.evil.com/fcm/send/token', 'https://fcm.googleapis.com/admin', 'https://user:password@web.push.apple.com/token', 'https://web.push.apple.com:8443/token', 'not a URL', null]) {
    assert.equal(isAllowedPushEndpoint(endpoint), false)
  }
})

test('validates subscription encryption key shape', () => {
  const valid = { endpoint: 'https://web.push.apple.com/token', keys: { p256dh: 'A'.repeat(87), auth: 'a'.repeat(22) } }
  assert.equal(isValidSubscription(valid), true)
  assert.equal(isValidSubscription({ ...valid, keys: { auth: 'a'.repeat(22), p256dh: 'bad' } }), false)
  assert.equal(isValidSubscription({ ...valid, keys: null }), false)
  assert.equal(isValidSubscription(null), false)
})

test('webhooks must identify a messages insert; record text is never trusted', () => {
  const valid = { type: 'INSERT', schema: 'public', table: 'messages', record: { id: '9157f11a-07aa-4ead-94e1-3a00fdb9f711' } }
  assert.equal(isWebhookInsert(valid), true)
  assert.equal(isWebhookInsert({ ...valid, type: 'UPDATE' }), false)
  assert.equal(isWebhookInsert({ ...valid, table: 'members' }), false)
  assert.equal(isWebhookInsert({ ...valid, record: { id: 'not-a-uuid' } }), false)
})
