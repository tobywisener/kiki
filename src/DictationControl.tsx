import { useEffect, useRef, useState } from 'react'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import type { Language } from './messages'

const copy = {
  en: {
    start: 'Dictate a message', stop: 'Stop dictation', starting: 'Allow microphone access…',
    listening: 'Listening in English…', stopping: 'Finishing dictation…', review: 'Check the text before sending.',
    microphone: 'Allow microphone access in your browser settings, then reload to try again.',
    unsupported: 'This browser does not support dictation. You can still type a message.',
    failed: 'Dictation failed. Check your connection and try again. Your draft is kept.',
    no_speech: 'No speech was recognised. Tap the microphone to try again.',
    language: 'English dictation is unavailable in this browser. You can still type a message.',
  },
  th: {
    start: 'พูดเพื่อพิมพ์ข้อความ', stop: 'หยุดการพูด', starting: 'โปรดอนุญาตให้ใช้ไมโครโฟน…',
    listening: 'กำลังฟังภาษาไทย…', stopping: 'กำลังจบการถอดเสียง…', review: 'ตรวจสอบข้อความก่อนส่ง',
    microphone: 'โปรดอนุญาตให้ใช้ไมโครโฟนในการตั้งค่าเบราว์เซอร์ แล้วโหลดหน้าใหม่เพื่อลองอีกครั้ง',
    unsupported: 'เบราว์เซอร์นี้ไม่รองรับการพูดเพื่อพิมพ์ คุณยังพิมพ์ข้อความได้',
    failed: 'ถอดเสียงไม่ได้ โปรดตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง ข้อความที่พิมพ์ไว้ยังอยู่',
    no_speech: 'ไม่พบคำพูด แตะไมโครโฟนเพื่อลองอีกครั้ง',
    language: 'เบราว์เซอร์นี้ไม่รองรับการถอดเสียงภาษาไทย คุณยังพิมพ์ข้อความได้',
  },
}

export default function DictationControl({ language, disabled, onTranscript, onBusyChange }: {
  language: Language; disabled: boolean; onTranscript: (text: string) => void; onBusyChange: (busy: boolean) => void
}) {
  const { listening, resetTranscript, browserSupportsSpeechRecognition, isMicrophoneAvailable } = useSpeechRecognition()
  const [pending, setPending] = useState<'' | 'starting' | 'stopping'>('')
  const [notice, setNotice] = useState('')
  const session = useRef(false)
  const delivered = useRef(0)
  const transcriptHandler = useRef(onTranscript)
  const t = copy[language]
  const supported = window.isSecureContext && browserSupportsSpeechRecognition
  const busy = isMicrophoneAvailable && (!!pending || listening)

  useEffect(() => { transcriptHandler.current = onTranscript }, [onTranscript])

  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])

  useEffect(() => {
    const recognition = SpeechRecognition.getRecognition()
    const result = (event: SpeechRecognitionEvent) => {
      if (!session.current) return
      // Read final result indices directly: the library can suppress a new session's first final-only result.
      for (let index = Math.max(event.resultIndex, delivered.current); index < event.results.length; index++) {
        if (!event.results[index].isFinal) continue
        delivered.current = index + 1
        const text = event.results[index][0].transcript.trim()
        if (text) { transcriptHandler.current(text); setNotice(t.review) }
      }
    }
    const started = () => setPending('')
    const ended = () => {
      setPending('')
      setNotice(current => current || t.no_speech)
    }
    const failed = (event: SpeechRecognitionErrorEvent) => {
      setPending('')
      if (event.error === 'aborted') return
      setNotice(event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'service-not-allowed'
        ? t.microphone : event.error === 'no-speech' ? t.no_speech : event.error === 'language-not-supported' ? t.language : t.failed)
    }
    recognition?.addEventListener('start', started)
    recognition?.addEventListener('result', result)
    recognition?.addEventListener('end', ended)
    recognition?.addEventListener('error', failed)
    return () => {
      session.current = false
      recognition?.removeEventListener('start', started)
      recognition?.removeEventListener('result', result)
      recognition?.removeEventListener('end', ended)
      recognition?.removeEventListener('error', failed)
      void SpeechRecognition.abortListening()
      onBusyChange(false)
    }
  }, [t, onBusyChange])

  async function stop() {
    setPending('stopping')
    await SpeechRecognition.stopListening()
    if (session.current) setPending('')
  }

  useEffect(() => {
    if (!listening) return
    const stopOnHide = () => { if (document.hidden) void stop() }
    const timer = window.setTimeout(() => void stop(), 60_000)
    document.addEventListener('visibilitychange', stopOnHide)
    stopOnHide()
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', stopOnHide) }
  }, [listening])

  async function start() {
    if (busy || disabled || !supported || !isMicrophoneAvailable) return
    resetTranscript()
    delivered.current = 0
    session.current = true
    setPending('starting')
    setNotice('')
    try {
      // shortcut: browser recognition support varies; add a provider only if the actual phones need it.
      await SpeechRecognition.startListening({ language: language === 'th' ? 'th-TH' : 'en-GB', continuous: false })
      if (!session.current) void SpeechRecognition.abortListening()
    } catch {
      if (session.current) { setPending(''); setNotice(t.failed) }
    }
  }

  return <div className="dictation">
    <button type="button" className={`icon-button dictation-button${listening ? ' recording' : ''}`}
      aria-label={listening ? t.stop : t.start} aria-pressed={listening} title={supported ? listening ? t.stop : t.start : t.unsupported}
      disabled={!!pending || (!listening && (disabled || !supported || !isMicrophoneAvailable))}
      onClick={() => listening ? void stop() : void start()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        {listening ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          : <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>}
      </svg>
    </button>
    {(!supported || !isMicrophoneAvailable || busy || notice) && <div className="dictation-status">
      <span role="status">{!supported ? t.unsupported : !isMicrophoneAvailable ? t.microphone : pending ? t[pending] : listening ? t.listening : notice}</span>
    </div>}
  </div>
}
