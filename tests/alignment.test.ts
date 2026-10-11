import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAzureAlignment, validateAlignment, alignedSegments } from '../supabase/functions/_shared/alignment.ts'

test('Azure inclusive offsets become slice ranges for English and Thai', () => {
  const source = 'Have you eaten yet?'
  const target = 'กินข้าวหรือยัง?'
  const links = parseAzureAlignment('9:13-0:6 15:17-7:12', source, target)
  assert.deepEqual(links, [{ source: [9, 14], target: [0, 7] }, { source: [15, 18], target: [7, 13] }])
  assert.equal(source.slice(...links[0].source), 'eaten')
  assert.equal(target.slice(...links[0].target), 'กินข้าว')
  const reverse = parseAzureAlignment('0:6-9:13 7:12-15:17', target, source)
  assert.deepEqual(reverse[0], { source: links[0].target, target: links[0].source })
})

test('highlights preserve reordered, one-to-many, and many-to-one phrase links', () => {
  const links = parseAzureAlignment('0:2-2:6 4:6-0:1', 'red car', 'รถสีแดง')
  const many = parseAzureAlignment('0:3-0:2 5:9-0:2', 'have eaten', 'กิน')
  assert.equal(links[0].target[0] > links[1].target[0], true)
  const targetParts = alignedSegments('กิน', many, 'target')
  assert.deepEqual(targetParts[0].links, [0, 1])
  const sourceParts = alignedSegments('have eaten', many, 'source')
  assert.deepEqual(sourceParts.find(part => part.text === 'have')?.links, [0])
  const oneToMany = parseAzureAlignment('0:3-0:2 0:3-3:5', 'miss', 'คิดถึง')
  assert.deepEqual(alignedSegments('miss', oneToMany, 'source')[0].links, [0, 1])
})

test('missing, malformed, reversed, unsafe, or out-of-bounds spans are ignored', () => {
  for (const value of [undefined, null, '', {}, 'junk', '0:99-0:1', '2:1-0:1', '-1:2-0:1', '0:1-0:99999999999999999999']) {
    assert.deepEqual(parseAzureAlignment(value, 'Hello', 'สวัสดี'), [])
  }
  assert.deepEqual(validateAlignment([{ source: [0, 1.5], target: [0, 1] }], 'Hi', 'hi'), [])
  assert.equal(parseAzureAlignment('0:4-0:5 0:4-0:5 junk', 'Hello', 'สวัสดี').length, 1)
})

test('Thai combining marks are never split by alignment boundaries', () => {
  assert.deepEqual(parseAzureAlignment('0:0-0:0', 'a', 'กิ'), [])
  assert.deepEqual(parseAzureAlignment('0:0-0:1', 'a', 'กิ'), [{ source: [0, 1], target: [0, 2] }])
})

test('emoji and newlines remain intact; unverified offsets after non-BMP text do not produce false links', () => {
  const source = 'Hi 🤍\nthere'
  const target = 'ดี 🤍\nนะ'
  const links = parseAzureAlignment('0:1-0:1 6:10-6:7', source, target)
  assert.equal(links.length, 1)
  for (const [side, value] of [['source', source], ['target', target]] as const) {
    assert.equal(alignedSegments(value, links, side).map(part => part.text).join(''), value)
  }
})

test('segments preserve exact text, punctuation, and unaligned gaps', () => {
  const source = 'Have you eaten yet?'
  const target = 'กินข้าวหรือยัง?'
  const links = parseAzureAlignment('9:13-0:6 15:17-7:12', source, target)
  const parts = alignedSegments(source, links, 'source')
  assert.equal(parts.map(part => part.text).join(''), source)
  assert.deepEqual(parts[0], { start: 0, text: 'Have you ', links: [] })
  assert.deepEqual(parts[1], { start: 9, text: 'eaten', links: [0] })
  assert.deepEqual(parts.at(-1), { start: 18, text: '?', links: [] })
})
