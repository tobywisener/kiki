import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Language, Message } from './messages'
import { alignedSegments, validateAlignment } from '../supabase/functions/_shared/alignment'
import type { AlignmentSide } from '../supabase/functions/_shared/alignment'
import { pronunciationSpace, validatePronunciationParts } from '../supabase/functions/_shared/pronunciation'

export default function AlignedMessage({ message, own, language, label, footer }: {
  message: Message; own: boolean; language: Language; label: string; footer: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<{ links: number[]; pinned: boolean }>({ links: [], pinned: false })
  const translation = message.translation || ''
  const alignment = useMemo(() => validateAlignment(message.alignment, message.original, translation), [message.alignment, message.original, translation])
  const source = useMemo(() => alignedSegments(message.original, alignment, 'source'), [message.original, alignment])
  const target = useMemo(() => alignedSegments(translation, alignment, 'target'), [translation, alignment])
  const targetLanguage = message.source_language === 'en' ? 'th' : 'en'
  const hint = language === 'en' ? 'Hover or tap a word to see its match.' : 'เลื่อนเมาส์หรือแตะคำเพื่อดูคำที่ตรงกัน'
  const thaiSide = message.source_language === 'th' ? 'source' : 'target'
  const pronunciationParts = useMemo(() => validatePronunciationParts(message.thai_pronunciation_parts, message.source_language === 'th' ? message.original : translation), [message.thai_pronunciation_parts, message.source_language, message.original, translation])
  function pronunciation(textLanguage: Language) {
    return language === 'en' && textLanguage === 'th' && message.thai_romanization ? <div className="thai-pronunciation">
      <span>Pronunciation · approximate</span>
      <p lang="th-Latn">{pronunciationParts.length ? pronunciationParts.map((part, index) => {
        const matched = alignment.some((link, id) => selection.links.includes(id) && link[thaiSide][0] < part.end && link[thaiSide][1] > part.start)
        return <span key={part.start}>{pronunciationSpace(pronunciationParts[index - 1]?.text, part.text)}<span className={matched ? 'word-highlight' : undefined}>{part.text}</span></span>
      }) : message.thai_romanization}</p>
    </div> : null
  }

  function select(links: number[], pin = false) {
    setOpen(true)
    setSelection(current => pin && current.pinned && current.links.join() === links.join()
      ? { links: [], pinned: false } : { links, pinned: pin })
  }

  function text(side: AlignmentSide) {
    return (side === 'source' ? source : target).map(segment => segment.links.length && /[\p{L}\p{N}]/u.test(segment.text) ?
      <button key={segment.start} type="button" className={`linked-word${segment.links.some(id => selection.links.includes(id)) ? ' word-highlight' : ''}`}
        aria-pressed={segment.links.some(id => selection.links.includes(id))}
        onPointerEnter={event => { if (event.pointerType === 'mouse' && !selection.pinned) select(segment.links) }}
        onPointerLeave={() => setSelection(current => current.pinned ? current : { links: [], pinned: false })}
        onFocus={() => { if (!selection.pinned) select(segment.links) }}
        onBlur={() => setSelection(current => current.pinned ? current : { links: [], pinned: false })}
        onClick={() => select(segment.links, true)}
        onKeyDown={event => { if (event.key === 'Escape') setSelection({ links: [], pinned: false }) }}
      >{segment.text}</button> : <span key={segment.start}>{segment.text}</span>)
  }

  return <>
    <p lang={own ? message.source_language : targetLanguage}>{text(own ? 'source' : 'target')}</p>
    {pronunciation(own ? message.source_language : targetLanguage)}
    <div className="message-footer">{footer}<details className="message-translation" open={open} onToggle={event => {
      setOpen(event.currentTarget.open)
      if (!event.currentTarget.open) setSelection({ links: [], pinned: false })
    }}>
      <summary><svg className="translation-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>{label}</summary>
      <p lang={own ? targetLanguage : message.source_language}>{text(own ? 'target' : 'source')}</p>
      {pronunciation(own ? targetLanguage : message.source_language)}
      <span className="learning-hint">{alignment.length ? hint : language === 'en' ? 'Word matches aren’t available for this message.' : 'ข้อความนี้ไม่มีข้อมูลคำที่ตรงกัน'}</span>
    </details></div>
  </>
}
