import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resizeMessageInput } from '../src/composer.ts'

test('clearing a multiline draft restores one row without measuring the placeholder', () => {
  const input = { value: '', style: { height: '140px' }, get scrollHeight() { throw new Error('Empty placeholder must not be measured') } }
  resizeMessageInput(input as HTMLTextAreaElement)
  assert.equal(input.style.height, 'auto')
})

test('draft resizing can grow, shrink, and cap restored or dictated text without accumulating height', () => {
  let contentHeight = 92
  const input = { value: 'Some text', style: { height: '140px' }, get scrollHeight() {
    assert.equal(this.style.height, 'auto', 'Reset the previous height before measuring')
    return contentHeight
  } }
  resizeMessageInput(input as HTMLTextAreaElement)
  assert.equal(input.style.height, '92px')
  contentHeight = 44
  for (let count = 0; count < 3; count++) resizeMessageInput(input as HTMLTextAreaElement)
  assert.equal(input.style.height, '44px')
  contentHeight = 250
  resizeMessageInput(input as HTMLTextAreaElement)
  assert.equal(input.style.height, '140px')
})
