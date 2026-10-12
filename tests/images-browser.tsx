import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Message } from '../src/messages'

// Exercise the real app with synthetic files and mocked Supabase; no live messages or uploads.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
Object.assign(globalThis, { IntersectionObserver: class { observe() {} disconnect() {} } })
HTMLElement.prototype.scrollIntoView = () => {}
Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => undefined }, configurable: true })
Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true })
Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true })
let uploads = 0, uploadFailure = false, databaseFailure = false, slow = false
let uploadSignal: AbortSignal | undefined
let authChanged: (event: string, session: unknown) => void = () => {}
const inserts: Record<string, unknown>[] = [], saved: Message[] = []
const userId = '11111111-1111-4111-8111-111111111111'
const imageUrl = 'https://i.ibb.co/abc/kiki-check.png'
const { supabase } = await import('../src/lib')
if (!supabase) throw new Error('A public Supabase configuration is needed for the mocked UI fixture')
Object.defineProperty(supabase, 'auth', { value: {
  getSession: async () => ({ data: { session: { user: { id: userId } } } }),
  onAuthStateChange: (callback: typeof authChanged) => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } } },
} })
class Query {
  payload?: Record<string, unknown>; id?: string
  constructor(readonly table: string) {}
  select() { return this } order() { return this } limit() { return this } range() { return this }
  gte() { return this } abortSignal() { return this }
  eq(key: string, value: string) { if (key === 'id') this.id = value; return this }
  insert(payload: Record<string, unknown>) { this.payload = payload; return this }
  result() {
    if (this.table === 'members') return { data: [{ id: userId, name: 'You', language: 'en' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Your person', language: 'th' }], error: null }
    if (this.table !== 'messages') throw new Error('Unexpected table or storage use')
    if (this.payload) {
      inserts.push(this.payload)
      if (databaseFailure) return { data: null, error: { code: 'network', message: 'Mock database unavailable' } }
      const message = { ...this.payload, translation: null, translation_status: this.payload.original ? 'pending' : 'ready', translation_attempted_at: null, created_at: new Date().toISOString() } as Message
      saved.push(message)
      return { data: message, error: null }
    }
    return { data: this.id ? saved.find(message => message.id === this.id) : saved, error: null }
  }
  single() { return Promise.resolve(this.result()) }
  then(resolve: (value: unknown) => unknown) { return Promise.resolve(this.result()).then(resolve) }
}
Object.assign(supabase, {
  from: (table: string) => new Query(table), rpc: async () => ({ data: [], error: null }),
  channel: () => { const channel = { on: () => channel, subscribe: (callback: (status: string) => void) => { queueMicrotask(() => callback('SUBSCRIBED')); return channel } }; return channel },
  removeChannel: async () => {},
})
Object.defineProperty(supabase, 'functions', { value: { invoke: async (name: string, options: { body: File; headers: Record<string, string>; signal: AbortSignal }) => {
  if (name !== 'upload-image') throw new Error('Unexpected function')
  uploads++
  if (options.headers['Content-Type'] !== 'image/png') throw new Error('Incorrect image content type')
  uploadSignal = options.signal
  if (slow) await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
  return uploadFailure ? { data: null, error: new Error('Mock upload failed') } : { data: { image_url: imageUrl }, error: null }
} } })
const { default: App } = await import('../src/App')
const root = createRoot(document.getElementById('root')!)
const reports: string[] = []
const output = document.getElementById('results')!
function check(condition: boolean, description: string) {
  if (!condition) throw new Error(description)
  reports.push(`PASS: ${description}`); output.textContent = reports.join('\n')
}
const step = async (action: () => void) => { await act(async () => { action(); await Promise.resolve() }) }
async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  if (!condition()) throw new Error('UI did not reach the expected state')
}
const draft = () => document.querySelector('textarea')!
const caption = async (value: string) => step(() => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft(), value)
  draft().dispatchEvent(new Event('input', { bubbles: true }))
})
const choose = async () => {
  await step(() => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], 'check.png', { type: 'image/png' })], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await waitFor(() => !!document.querySelector('.attachment-preview'))
}
const submit = () => step(() => document.querySelector('form.composer')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
try {
  await act(async () => root.render(<App />))
  await waitFor(() => !!document.querySelector('.image-button'))
  await choose()
  check(uploads === 0 && inserts.length === 0 && !!document.querySelector('.attachment-preview img'), 'Choosing an image previews it without uploading or sending')
  await step(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove image"]')!.click())
  check(!document.querySelector('.attachment-preview') && uploads === 0, 'Removing an unsent image cancels the attachment')
  await caption('Photo caption')
  await choose()
  uploadFailure = true
  await submit()
  await waitFor(() => !draft().disabled)
  check(draft().value === 'Photo caption' && !!document.querySelector('.attachment-preview') && inserts.length === 0, 'Upload failure preserves the image and caption for retry')
  uploadFailure = false
  await submit()
  await waitFor(() => saved.length === 1)
  check(saved[0].image_url === imageUrl && saved[0].original === 'Photo caption' && !document.querySelector('.attachment-preview'), 'Sending stores only the imgbb URL and optional caption')
  check(document.querySelector<HTMLAnchorElement>('.message-image')!.href === imageUrl && draft().value === '', 'Sent photo opens in full size and the composer clears')
  await choose()
  databaseFailure = true
  await submit()
  await waitFor(() => !!document.querySelector('.message-bubble.unsent'))
  const priorUploads = uploads
  await caption('Keep this next draft')
  databaseFailure = false
  await step(() => document.querySelector<HTMLButtonElement>('.message-bubble.unsent .message-meta button')!.click())
  await waitFor(() => saved.length === 2)
  check(uploads === priorUploads && saved[1].original === '' && saved[1].image_url === imageUrl && draft().value === 'Keep this next draft', 'Image-only retry reuses the URL and preserves the next typed draft')
  check(!Array.from(document.querySelectorAll('.message-bubble')).at(-1)!.textContent!.includes('Translating'), 'Images without captions do not show a translation spinner')
  await choose()
  slow = true
  const priorInserts = inserts.length
  await submit()
  await waitFor(() => draft().disabled)
  await step(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove image"]')!.click())
  await waitFor(() => !draft().disabled)
  check(uploadSignal!.aborted && inserts.length === priorInserts && draft().value === 'Keep this next draft', 'Cancelling an in-flight upload aborts it without sending or losing the caption')
  await choose()
  await submit()
  await waitFor(() => draft().disabled)
  await step(() => authChanged('SIGNED_OUT', null))
  await waitFor(() => !document.querySelector('.composer'))
  check(uploadSignal!.aborted && inserts.length === priorInserts, 'Signing out aborts uploads and prevents a late image message')
  output.textContent += '\nALL CHECKS PASSED'
} catch (error) { output.textContent += `\nFAIL: ${String(error)}` }
finally { await act(async () => root.unmount()) }
