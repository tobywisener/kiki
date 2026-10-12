import React, { act, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { appendDictation } from '../src/dictation'
import { resizeMessageInput } from '../src/composer'

// Exercise the actual React component and library without recording or calling any service.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
class Recognizer extends EventTarget {
  static current: Recognizer
  lang = ''; continuous = false; interimResults = true; active = false; stops = 0; aborts = 0
  onstart?: (event: Event) => void; onend?: (event: Event) => void; onresult?: (event: Event) => void; onerror?: (event: Event) => void
  constructor() { super(); Recognizer.current = this }
  emit(type: 'start' | 'end' | 'result' | 'error', props = {}) {
    const event = Object.assign(new Event(type), props)
    this[`on${type}`]?.(event)
    this.dispatchEvent(event)
  }
  start() { this.active = true; queueMicrotask(() => this.emit('start')) }
  end() { this.active = false; this.emit('end') }
  stop() { this.stops++; queueMicrotask(() => this.end()) }
  abort() { this.aborts++; queueMicrotask(() => this.end()) }
  result(text: string, final = true) {
    this.emit('result', { resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 1 }], { isFinal: final })] })
  }
}
const unsupported = new URLSearchParams(location.search).has('unsupported')
Object.defineProperty(window, 'SpeechRecognition', { value: unsupported ? undefined : Recognizer, configurable: true })
Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true })
const { default: Dictation } = await import('../src/DictationControl')
const root = createRoot(document.getElementById('root')!)
let edit: (draft: string) => void
let limit: (() => void) | undefined
let dismissReview: (() => void) | undefined
const originalTimeout = window.setTimeout.bind(window)
window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
  if (delay === 60_000 && typeof handler === 'function') limit = handler as () => void
  if (delay === 4_000 && typeof handler === 'function') dismissReview = handler as () => void
  return originalTimeout(handler, delay, ...args)
}) as typeof window.setTimeout
function Composer({ language = 'en' }: { language?: 'en' | 'th' }) {
  const [draft, setDraft] = useState('Existing draft.')
  const [busy, setBusy] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => { if (textarea.current) resizeMessageInput(textarea.current) }, [draft])
  edit = setDraft
  return <div><textarea ref={textarea} aria-label="Draft" value={draft} onChange={e => setDraft(e.target.value)} />
    <Dictation language={language} disabled={false} onBusyChange={setBusy} onTranscript={text => setDraft(current => appendDictation(current, text))} />
    <button data-send disabled={busy || draft.length > 2000}>Send</button></div>
}
const result = document.getElementById('results')!
const reports: string[] = []
function check(condition: boolean, description: string) {
  if (!condition) throw new Error(description)
  reports.push(`PASS: ${description}`)
  result.textContent = reports.join('\n')
}
const draft = () => document.querySelector('textarea')!.value
const send = () => document.querySelector<HTMLButtonElement>('[data-send]')!
const microphone = () => document.querySelector<HTMLButtonElement>('.dictation-button')!
const step = async (action: () => void) => { await act(async () => { action(); await Promise.resolve() }) }
try {
  await act(async () => root.render(<Composer />))
  if (unsupported) {
    check(microphone().disabled && send().disabled === false && document.body.textContent!.includes('does not support dictation'), 'Unsupported browser explains fallback and permits typing/sending')
  } else {
    await step(() => microphone().click())
    const recognition = Recognizer.current
    check(recognition.lang === 'en-GB' && !recognition.continuous && send().disabled, 'English locale; sending blocked while listening')
    await step(() => recognition.result('temporary words', false))
    check(draft() === 'Existing draft.', 'Interim recognition does not overwrite the draft')
    await step(() => recognition.result('Hello.'))
    await step(() => recognition.result('Hello.'))
    check(draft() === 'Existing draft. Hello.', 'Final words append once; duplicate event is ignored')
    await step(() => microphone().click())
    check(recognition.stops === 1 && !send().disabled, 'Stop releases listening and permits review/send')
    check(document.body.textContent!.includes('Check the text before sending.'), 'English review notice appears after dictation')
    await step(() => dismissReview!())
    check(!document.querySelector('.dictation-status') && draft() === 'Existing draft. Hello.', 'English review notice expires without removing the dictated text')
    await step(() => edit('Edited while dictating.'))
    await step(() => microphone().click())
    await step(() => recognition.result('Second attempt.'))
    await step(() => recognition.end())
    check(draft() === 'Edited while dictating. Second attempt.' && !send().disabled, 'Second dictation preserves edits and starts with a fresh transcript')
    await step(() => document.querySelector<HTMLButtonElement>('[aria-label="Dismiss dictation notice"]')!.click())
    check(!document.querySelector('.dictation-status'), 'Review notice can also be dismissed immediately')
    await step(() => edit('A multiline\ndraft'))
    await step(() => edit(''))
    check(document.querySelector('textarea')!.style.height === 'auto', 'Clearing a programmatic draft removes the previous explicit input height')
    await step(() => edit('Edited while dictating. Second attempt.'))
    await step(() => microphone().click())
    await step(() => recognition.emit('error', { error: 'network' }))
    await step(() => recognition.end())
    check(draft() === 'Edited while dictating. Second attempt.' && !send().disabled && document.body.textContent!.includes('Check your connection'), 'Recognition errors preserve the draft and permit sending')
    await act(async () => root.render(<Composer key="thai" language="th" />))
    await step(() => microphone().click())
    await step(() => recognition.result('สวัสดี', false))
    await step(() => recognition.result('สวัสดี คิดถึงนะ'))
    check(recognition.lang === 'th-TH' && draft() === 'Existing draft. สวัสดี คิดถึงนะ', 'Thai locale appends Thai text to the message box')
    await step(() => limit!())
    check(!send().disabled && !recognition.active, 'One-minute limit stops the microphone')
    check(document.body.textContent!.includes('ตรวจสอบข้อความก่อนส่ง'), 'Thai review notice appears after dictation')
    await step(() => dismissReview!())
    check(!document.querySelector('.dictation-status') && draft() === 'Existing draft. สวัสดี คิดถึงนะ', 'Thai review notice expires without removing the dictated text')
    await step(() => microphone().click())
    await step(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    check(!send().disabled && !recognition.active, 'Leaving the app stops the microphone')
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    await step(() => microphone().click())
    await act(async () => root.render(<p>Signed out</p>))
    await step(() => recognition.result('Late words'))
    check(recognition.aborts > 0 && !document.querySelector('textarea'), 'Unmount aborts recognition; late words do not restore the composer')
    await act(async () => root.render(<Composer key="permission" />))
    await step(() => microphone().click())
    await step(() => recognition.emit('error', { error: 'not-allowed' }))
    check(microphone().disabled && !send().disabled && document.body.textContent!.includes('Allow microphone access'), 'Permission denial explains recovery and permits typing/sending')
  }
  result.textContent += '\nALL CHECKS PASSED'
} catch (error) {
  result.textContent += `\nFAIL: ${String(error)}`
} finally { window.setTimeout = originalTimeout }
