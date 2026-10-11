export function appendDictation(draft: string, text: string): string {
  return draft ? `${draft.trimEnd()} ${text}` : text
}
