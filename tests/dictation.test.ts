import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendDictation } from '../src/dictation.ts'

test('dictated text appends to the latest draft without dropping text over the send limit', () => {
  assert.equal(appendDictation('', 'สวัสดี'), 'สวัสดี')
  assert.equal(appendDictation('Hello!\n', 'How are you?'), 'Hello! How are you?')
  assert.equal(appendDictation('x'.repeat(2000), 'Keep this too'), `${'x'.repeat(2000)} Keep this too`)
})
