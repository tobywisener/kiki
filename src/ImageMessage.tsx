import { useState } from 'react'
import type { Language } from './messages'
import { isMessageImageUrl } from '../supabase/functions/_shared/images'

export default function ImageMessage({ url, language }: { url: string; language: Language }) {
  const [failed, setFailed] = useState(false)
  const unavailable = language === 'en' ? 'Image unavailable' : 'โหลดรูปภาพไม่ได้'
  if (!isMessageImageUrl(url)) return <p>{unavailable}</p>
  return <a className="message-image" href={url} target="_blank" rel="noopener noreferrer"
    aria-label={language === 'en' ? 'Open image in full size' : 'เปิดรูปภาพขนาดเต็ม'}>
    {failed ? <span>{unavailable} · {language === 'en' ? 'Open image' : 'เปิดรูปภาพ'}</span>
      : <img src={url} alt={language === 'en' ? 'Image attachment' : 'รูปภาพแนบ'} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
  </a>
}
