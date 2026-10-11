import type { Member, Message } from './lib'
import { parseAzureAlignment } from '../supabase/functions/_shared/alignment'
import samplePronunciation from './demo-pronunciation.json'
import { pronunciationText } from '../supabase/functions/_shared/pronunciation'

export const demoMembers: Member[] = [
  { id: 'demo-en', name: 'You', language: 'en' },
  { id: 'demo-th', name: 'Your person', language: 'th' },
]
const time = (hour: number, minute: number) => {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}
const sampleMessages: Message[] = [
  { id: '1', sender_id: 'demo-th', original: 'วันนี้เป็นยังไงบ้าง คิดถึงนะ ☀️', translation: 'How is your day going? I miss you ☀️', source_language: 'th', created_at: time(10, 24), translation_status: 'ready', translation_attempted_at: null },
  { id: '2', sender_id: 'demo-en', original: 'Better now that I’m talking to you 🤍', translation: 'ดีขึ้นแล้ว เพราะได้คุยกับคุณ 🤍', source_language: 'en', created_at: time(10, 25), translation_status: 'ready', translation_attempted_at: null },
  { id: '3', sender_id: 'demo-en', original: 'Have you eaten yet?', translation: 'กินข้าวหรือยัง?', source_language: 'en', created_at: time(10, 25), translation_status: 'ready', translation_attempted_at: null },
  { id: '4', sender_id: 'demo-th', original: 'กินแล้ว! วันนี้กินผัดไทย อร่อยมาก 🍜', translation: 'I have! I had pad thai today. It was so good 🍜', source_language: 'th', created_at: time(10, 27), translation_status: 'ready', translation_attempted_at: null },
  { id: '5', sender_id: 'demo-th', original: 'ถ้าคุณอยู่ที่นี่ จะพาไปกินด้วยกัน', translation: 'If you were here, I’d take you there with me.', source_language: 'th', created_at: time(10, 27), translation_status: 'ready', translation_attempted_at: null },
  { id: '6', sender_id: 'demo-en', original: 'One day soon. Save me a seat? ✨', translation: 'อีกไม่นานนะ เก็บที่นั่งไว้ให้หน่อยได้ไหม? ✨', source_language: 'en', created_at: time(10, 29), translation_status: 'ready', translation_attempted_at: null },
]

// These authored sample links demonstrate the interaction without calling a paid API.
const pairs = [
  [['วันนี้เป็นยังไงบ้าง', 'How is your day going?'], ['คิดถึงนะ', 'I miss you']],
  [['Better now', 'ดีขึ้นแล้ว'], ['talking to you', 'คุยกับคุณ']],
  [['eaten', 'กินข้าว'], ['yet', 'หรือยัง']],
  [['กินแล้ว', 'I have'], ['วันนี้', 'today'], ['ผัดไทย', 'pad thai'], ['อร่อยมาก', 'so good']],
  [['ถ้า', 'If'], ['คุณ', 'you'], ['อยู่ที่นี่', 'were here'], ['จะพา', 'I’d take'], ['ไปกินด้วยกัน', 'there with me']],
  [['One day soon', 'อีกไม่นานนะ'], ['Save me a seat', 'เก็บที่นั่งไว้ให้หน่อย']],
]
export const demoMessages: Message[] = sampleMessages.map((message, index) => ({
  ...message,
  delivered_at: index < 5 ? message.created_at : null,
  read_at: index < 2 ? message.created_at : null,
  thai_romanization: pronunciationText(samplePronunciation[index]),
  thai_pronunciation_parts: samplePronunciation[index],
  alignment: parseAzureAlignment(pairs[index].map(([original, translated]) => {
    const start = message.original.indexOf(original)
    const target = message.translation!.indexOf(translated)
    if (start < 0 || target < 0) throw new Error('Sample alignment must refer to the exact message text.')
    return `${start}:${start + original.length - 1}-${target}:${target + translated.length - 1}`
  }).join(' '), message.original, message.translation!),
}))
