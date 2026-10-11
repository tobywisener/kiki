import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pronunciationText, romanizeThaiWords, thaiWords, validatePronunciationParts } from '../supabase/functions/_shared/pronunciation.ts'

test('Thai word positions preserve repeated words, combining marks, punctuation and emoji', () => {
  const thai = 'กินข้าว กินข้าว? 🤍'
  const parts = thaiWords(thai)
  assert.equal(parts.map(part => thai.slice(part.start, part.end)).join(''), thai)
  assert.deepEqual(validatePronunciationParts(parts, thai), parts)
  assert.equal(parts.filter(part => part.text === 'กิน').length, 2)
})

test('untrusted pronunciation parts must cover the exact Thai text without gaps or broken characters', () => {
  const thai = 'ข้าว🤍'
  for (const parts of [undefined, [], [{ start: 0, end: 1, text: 'khao' }], [{ start: 0, end: 3, text: 'khao' }],
    [{ start: 1, end: thai.length, text: 'khao' }], [{ start: 0, end: thai.length, text: '' }],
    [{ start: 0, end: thai.length, text: 123 }]]) assert.deepEqual(validatePronunciationParts(parts, thai), [])
})

test('pronunciation adds readable word spaces while keeping existing whitespace and punctuation', () => {
  const texts = ['Kin', 'khao', ' ', 'rue', 'yang', '?', ' 🤍']
  assert.equal(pronunciationText(texts.map((text, index) => ({ start: index, end: index + 1, text }))), 'Kin khao rue yang? 🤍')
})

test('word pronunciation batches stay within Azure limits and save exact source positions', async () => {
  const originalFetch = globalThis.fetch
  const thai = 'กินข้าว'.repeat(13) + '? 🤍'
  let requests = 0
  globalThis.fetch = async (_input, init) => {
    requests++
    const words = JSON.parse(String(init?.body)) as { Text: string }[]
    assert.ok(words.length <= 10)
    assert.ok(words.every(word => word.Text.length <= 1000))
    assert.ok(words.reduce((length, word) => length + word.Text.length, 0) <= 5000)
    return Response.json(words.map(word => ({ text: word.Text === 'กิน' ? 'Kin' : 'khao', script: 'Latn' })))
  }
  try {
    const parts = await romanizeThaiWords(thai, {})
    assert.ok(requests > 1)
    assert.equal(parts.map(part => thai.slice(part.start, part.end)).join(''), thai)
    assert.ok(parts.some(part => part.text === 'Kin' && thai.slice(part.start, part.end) === 'กิน'))
    assert.ok(pronunciationText(parts).endsWith('? 🤍'))
  } finally { globalThis.fetch = originalFetch }
})

test('partial or malformed provider results cannot produce guessed pronunciation highlights', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const result of [[], [{ text: 'Kin', script: 'Thai' }], [{ text: 42, script: 'Latn' }]]) {
      globalThis.fetch = async () => Response.json(result)
      assert.deepEqual(await romanizeThaiWords('กินข้าว', {}), [])
    }
    globalThis.fetch = async () => { throw new Error('Unavailable') }
    assert.deepEqual(await romanizeThaiWords('กิน', {}), [])
  } finally { globalThis.fetch = originalFetch }
})
