export function messageNotification(senderName: string | undefined, message: { id: string; original: string; image_url?: string | null }, language: string) {
  const text = message.original.replace(/\s+/gu, ' ').trim()
  let body = message.image_url ? `📷 ${text || (language === 'th' ? 'รูปภาพ' : 'Photo')}`
    : text || (language === 'th' ? 'ส่งข้อความถึงคุณ' : 'Sent you a message.')
  if (body.length > 160) {
    let preview = ''
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(body)) {
      if (preview.length + segment.length > 159) break
      preview += segment
    }
    body = preview.trimEnd() + '…'
  }
  return { title: senderName?.trim() || 'Kiki', body, tag: `kiki-${message.id}` }
}
