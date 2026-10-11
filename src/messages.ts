export type Language = 'en' | 'th'
export type Member = { id: string; name: string; language: Language }
export type Message = {
  id: string
  sender_id: string
  original: string
  source_language: Language
  translation: string | null
  thai_romanization?: string | null
  thai_pronunciation_parts?: PronunciationPart[]
  alignment?: AlignmentLink[]
  translation_status: 'pending' | 'processing' | 'ready' | 'failed'
  translation_attempted_at: string | null
  translation_attempts?: number
  created_at: string
  delivered_at?: string | null
  read_at?: string | null
  local_status?: 'sending' | 'failed'
}

export function mergeMessages(current: Message[], updates: Message[]): Message[] {
  const byId = new Map(current.map(message => [message.id, message]))
  for (const message of updates) {
    const previous = byId.get(message.id)
    // A delayed request must not overwrite a realtime confirmation or completed translation.
    if (previous && !previous.local_status && message.local_status) continue
    const next = previous?.translation_status === 'ready' && message.translation_status !== 'ready' ? previous : message
    // Receipts only advance, even when an older translation or history response arrives later.
    byId.set(message.id, {
      ...next,
      ...(previous?.delivered_at || message.delivered_at ? { delivered_at: previous?.delivered_at || message.delivered_at } : {}),
      ...(previous?.read_at || message.read_at ? { read_at: previous?.read_at || message.read_at } : {}),
    })
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
}

export function receiptStatus(message: Message) {
  if (message.local_status) return message.local_status
  return message.read_at ? 'read' : message.delivered_at ? 'delivered' : 'sent'
}

export function canMarkRead(visible: boolean, focused: boolean, intersecting: boolean) {
  return visible && focused && intersecting
}

export function canRetryTranslation(message: Message, now = Date.now()) {
  if (message.local_status || message.translation_status === 'ready' || (message.translation_attempts || 0) >= 5) return false
  const lastAttempt = Date.parse(message.translation_attempted_at || message.created_at)
  return now - lastAttempt >= 60_000
}

export function toApplicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}
import type { AlignmentLink } from '../supabase/functions/_shared/alignment.ts'
import type { PronunciationPart } from '../supabase/functions/_shared/pronunciation.ts'
