export function resizeMessageInput(input: HTMLTextAreaElement) {
  input.style.height = 'auto'
  // Empty drafts stay one row, even if the browser measures a wrapped placeholder.
  if (input.value) input.style.height = `${Math.min(input.scrollHeight, 140)}px`
}
