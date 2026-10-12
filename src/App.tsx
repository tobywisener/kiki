import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, vapidPublicKey, mergeMessages, canRetryTranslation, toApplicationServerKey } from './lib'
import type { Language, Member, Message } from './lib'
import { demoMembers, demoMessages } from './demo'
import AlignedMessage from './AlignedMessage'
import Dictation from './DictationControl'
import { appendDictation } from './dictation'
import { resizeMessageInput } from './composer'
import ImageMessage from './ImageMessage'
import { validateSelectedImage } from './images'
import { imageAccept, isMessageImageUrl } from '../supabase/functions/_shared/images'
import { isStandalone, installInstructions } from './pwa'
import { canMarkRead, receiptStatus } from './messages'

function Icon({ name, size = 20 }: { name: 'heart' | 'send' | 'bell' | 'settings' | 'close' | 'globe' | 'arrow' | 'image'; size?: number }) {
  const paths = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    settings: <><path d="m9 3-1 3-3 1-2 3 2 2-1 4 3 2 3-1 2 4 3-1 1-3 3-1 2-3-2-2 1-4-3-2-3 1-2-4Z" /><circle cx="12" cy="12" r="3" /></>,
    close: <><path d="m6 6 12 12M6 18 18 6" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18" /></>,
    arrow: <path d="m9 5 7 7-7 7" />,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 16 5-5 5 5 3-3 5 5" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const copy = {
  en: { tagline: 'A little place for the two of us.', chat: 'Our conversation', subtitle: 'Different languages. Same feeling.', settings: 'Our little space', notifications: 'Enable notifications', placeholder: 'Type a message', send: 'Send message', original: 'Original', translated: 'Translation', translating: 'Translating…', failed: 'Translation unavailable', retry: 'Try translation again', offline: 'You’re offline. Unsent messages can be retried when you reconnect.', pending: 'Sending…', unsent: 'Not sent · tap to retry', empty: 'Your story starts here.', emptySub: 'Send your first message. We’ll take care of the translation.', older: 'Earlier messages', signout: 'Sign out', yourLanguage: 'Your language', notificationNote: 'A gentle nudge when your person sends a message. Message text stays off the lock screen.', install: 'Make yourself at home', installNote: 'iPhone: open in Safari → Share → Add to Home Screen. Android: open in Chrome → menu → Install app. Then open Kiki from its icon to enable notifications.', privacy: 'Only the two of you can access this chat. Messages are processed by our backend and Azure Translator; they are not end-to-end encrypted. Dictation uses your browser’s speech service, which may send audio to its provider. Kiki does not save voice clips. Images are hosted by imgbb and can be viewed by anyone with their link.', preview: 'Preview conversation · these are sample messages', previewSend: 'This is a preview. Sign in to send a real message.', signin: 'Sign in to your space', email: 'Email', password: 'Password', login: 'Come on in', back: 'Back to sign in', viewPreview: 'Take a little look around', setup: 'Connect your Supabase project to start your private chat. See the setup guide in README.md.', enabled: 'Notifications enabled', refresh: 'Reconnect', loading: 'Opening your space…' },
  th: { tagline: 'พื้นที่เล็ก ๆ ของเราสองคน', chat: 'บทสนทนาของเรา', subtitle: 'ต่างภาษา แต่ความรู้สึกเดียวกัน', settings: 'พื้นที่ของเรา', notifications: 'เปิดการแจ้งเตือน', placeholder: 'พิมพ์ข้อความ', send: 'ส่งข้อความ', original: 'ข้อความต้นฉบับ', translated: 'คำแปล', translating: 'กำลังแปล…', failed: 'แปลข้อความไม่ได้', retry: 'ลองแปลอีกครั้ง', offline: 'คุณออฟไลน์อยู่ ลองส่งข้อความอีกครั้งเมื่อเชื่อมต่อแล้ว', pending: 'กำลังส่ง…', unsent: 'ยังไม่ส่ง · แตะเพื่อลองอีกครั้ง', empty: 'เรื่องราวของเราเริ่มที่นี่', emptySub: 'ส่งข้อความแรก แล้วเราจะแปลให้', older: 'ข้อความก่อนหน้า', signout: 'ออกจากระบบ', yourLanguage: 'ภาษาของคุณ', notificationNote: 'แจ้งเตือนเมื่อคนพิเศษส่งข้อความ โดยไม่แสดงข้อความบนหน้าจอล็อก', install: 'เพิ่มไว้บนหน้าจอหลัก', installNote: 'iPhone: เปิดใน Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม Android: เปิดใน Chrome → เมนู → ติดตั้งแอป แล้วเปิด Kiki จากไอคอนเพื่อเปิดการแจ้งเตือน', privacy: 'มีเพียงคุณสองคนที่เข้าถึงแชตนี้ได้ ระบบและ Azure Translator ประมวลผลข้อความ ไม่มีการเข้ารหัสแบบต้นทางถึงปลายทาง การพูดเพื่อพิมพ์ใช้บริการถอดเสียงของเบราว์เซอร์ ซึ่งอาจส่งเสียงไปยังผู้ให้บริการ Kiki ไม่บันทึกไฟล์เสียง รูปภาพเก็บไว้ที่ imgbb และผู้ที่มีลิงก์สามารถดูได้', preview: 'ตัวอย่างบทสนทนา · ไม่ใช่ข้อความจริง', previewSend: 'นี่คือตัวอย่าง เข้าสู่ระบบเพื่อส่งข้อความจริง', signin: 'เข้าสู่พื้นที่ของคุณ', email: 'อีเมล', password: 'รหัสผ่าน', login: 'เข้าสู่ระบบ', back: 'กลับไปเข้าสู่ระบบ', viewPreview: 'ดูตัวอย่าง', setup: 'เชื่อมต่อโปรเจกต์ Supabase เพื่อเริ่มแชตส่วนตัว ดู README.md สำหรับวิธีตั้งค่า', enabled: 'เปิดการแจ้งเตือนแล้ว', refresh: 'เชื่อมต่ออีกครั้ง', loading: 'กำลังเปิดพื้นที่ของคุณ…' },
}

function dayLabel(date: string, language: Language) {
  const value = new Date(date)
  const today = new Date()
  if (value.toDateString() === today.toDateString()) return language === 'en' ? 'Today' : 'วันนี้'
  return value.toLocaleDateString(language === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: value.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [preview, setPreview] = useState(false)
  const [language, setLanguage] = useState<Language>('en')
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [dictating, setDictating] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const imageAbort = useRef<AbortController | null>(null)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(false)
  const [standalone, setStandalone] = useState(isStandalone)
  const [online, setOnline] = useState(navigator.onLine)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [draftOwner, setDraftOwner] = useState<string | null>(null)
  const [notificationState, setNotificationState] = useState<'off' | 'on' | 'busy'>('off')
  const [retrying, setRetrying] = useState<string[]>([])
  const [, tick] = useState(0)
  const bottom = useRef<HTMLDivElement>(null)
  const messageList = useRef<HTMLElement>(null)
  const receiptLocks = useRef(new Set<string>())
  const textarea = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef(messages)
  const userRef = useRef(session?.user.id)
  const retryLocks = useRef(new Set<string>())
  messagesRef.current = messages
  userRef.current = session?.user.id
  const t = copy[language]
  const installHelp = installInstructions(navigator.userAgent, navigator.maxTouchPoints)
  const me = preview ? demoMembers.find(member => member.language === language) : members.find(member => member.id === session?.user.id)
  const partner = (preview ? demoMembers : members).find(member => member.id !== me?.id)
  const shownMessages = preview ? demoMessages : messages
  const isChat = preview || !!session

  useLayoutEffect(() => {
    if (textarea.current) resizeMessageInput(textarea.current)
  }, [draft, isChat, authReady, me?.id])

  useEffect(() => {
    if (!image) { setImagePreview(''); return }
    const url = URL.createObjectURL(image)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  useEffect(() => {
    setImage(null)
    imageAbort.current?.abort()
    return () => { imageAbort.current?.abort() }
  }, [session?.user.id])

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const update = () => setStandalone(isStandalone())
    displayMode.addEventListener('change', update)
    return () => displayMode.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError('Could not restore your session. Please sign in again.')
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const timer = window.setInterval(() => tick(value => value + 1), 30_000)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!session || !supabase) { setMembers([]); setMessages([]); setDraft(''); setDraftOwner(null); return }
    const client = supabase
    const userId = session.user.id
    let cancelled = false
    let syncing = false
    setMessages([])
    setMembers([])
    setConnected(false)
    setLoading(true)
    setError('')
    try {
      setDraft(localStorage.getItem(`kiki-draft-${userId}`) || '')
      const pending = JSON.parse(localStorage.getItem(`kiki-unsent-${userId}`) || '[]') as Message[]
      setMessages(pending.filter(message => message.sender_id === userId).map(message => ({ ...message, local_status: 'failed' })))
    } catch { setError('Your saved draft could not be restored.') }
    setDraftOwner(userId)

    async function sync() {
      if (cancelled || syncing) return
      syncing = true
      try {
        const { data: people, error: profileError } = await client.from('members').select('id,name,language')
        if (profileError) throw profileError
        if (!people?.some(person => person.id === userId)) throw new Error('Your account has not been added to this private chat. Ask the project owner to finish setup.')
        if (cancelled) return
        setMembers(people)
        setLanguage(people.find(person => person.id === userId)!.language)
        const latestKnown = messagesRef.current.filter(message => !message.local_status).at(-1)?.created_at
        // Catch up every missed message, even if more than one page arrived while offline.
        if (latestKnown) {
          let offset = 0
          while (!cancelled) {
            const { data, error } = await client.from('messages').select('*').gte('created_at', latestKnown).order('created_at').order('id').range(offset, offset + 499)
            if (error) throw error
            if (cancelled) return
            setMessages(current => mergeMessages(current, data || []))
            if (!data || data.length < 500) break
            offset += 500
          }
        }
        const { data, error } = await client.from('messages').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100)
        if (error) throw error
        if (cancelled) return
        setMessages(current => mergeMessages(current, data || []))
        if (!latestKnown) setHasOlder(data?.length === 100)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your conversation. Please reconnect.')
      } finally {
        syncing = false
        if (!cancelled) setLoading(false)
      }
    }

    const channel = client.channel(`our-chat-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
        if (cancelled || !('id' in payload.new)) return
        setMessages(current => mergeMessages(current, [payload.new as Message]))
      })
      .subscribe(status => {
        if (cancelled) return
        setConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') void sync()
      })
    void sync()
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) void sync() }
    window.addEventListener('online', resume)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      cancelled = true
      void client.removeChannel(channel)
      window.removeEventListener('online', resume)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [session?.user.id])

  useEffect(() => {
    if (!session || preview || draftOwner !== session.user.id) return
    try {
      localStorage.setItem(`kiki-draft-${session.user.id}`, draft)
      localStorage.setItem(`kiki-unsent-${session.user.id}`, JSON.stringify(messages.filter(message => message.local_status)))
    } catch { setError(language === 'en' ? 'This browser cannot save unsent drafts. Keep this window open until your message is sent.' : 'บันทึกข้อความที่ยังไม่ส่งไม่ได้ โปรดเปิดหน้านี้ไว้จนกว่าจะส่งสำเร็จ') }
  }, [draft, messages, session?.user.id, preview, language, draftOwner])

  useEffect(() => {
    if (!supabase || !session || preview || !messageList.current) return
    const client = supabase
    const userId = session.user.id
    const incoming = messages.filter(message => message.sender_id !== userId && !message.local_status)
    const visible = new Set<string>()
    let readTimer: number | undefined
    async function acknowledge(ids: string[], read: boolean) {
      if (!navigator.onLine) return
      const pending = ids.filter(id => !receiptLocks.current.has(`${id}:${read}`))
      pending.forEach(id => receiptLocks.current.add(`${id}:${read}`))
      try {
        for (let offset = 0; offset < pending.length; offset += 100) {
          if (userRef.current !== userId) return
          const { data, error } = await client.rpc('acknowledge_messages', { message_ids: pending.slice(offset, offset + 100), mark_read: read })
          if (error) throw error
          if (userRef.current === userId) setMessages(current => mergeMessages(current, data || []))
        }
      } catch {
        if (userRef.current === userId) setError(language === 'en' ? 'Message receipts could not be updated. Reopen the chat to retry.' : 'อัปเดตสถานะข้อความไม่ได้ โปรดเปิดแชตอีกครั้งเพื่อลองใหม่')
      } finally { pending.forEach(id => receiptLocks.current.delete(`${id}:${read}`)) }
    }
    const markVisible = () => {
      if (settings || !canMarkRead(document.visibilityState === 'visible', document.hasFocus(), visible.size > 0)) return
      void acknowledge(incoming.filter(message => !message.read_at && visible.has(message.id)).map(message => message.id), true)
    }
    const resume = () => {
      void acknowledge(incoming.filter(message => !message.delivered_at).map(message => message.id), false)
      markVisible()
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.messageId!
        if (entry.isIntersecting && entry.intersectionRect.height > 0) visible.add(id)
        else visible.delete(id)
      }
      window.clearTimeout(readTimer)
      readTimer = window.setTimeout(markVisible, 100)
    }, { root: messageList.current })
    messageList.current.querySelectorAll('[data-message-id]').forEach(element => observer.observe(element))
    resume()
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      observer.disconnect()
      window.clearTimeout(readTimer)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [messages, session?.user.id, preview, connected, language, settings])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [shownMessages.at(-1)?.id, isChat])

  useEffect(() => {
    if (!session || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    let cancelled = false
    navigator.serviceWorker.getRegistration().then(async registration => {
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription && supabase) {
        const { error } = await supabase.functions.invoke('save-subscription', { body: subscription.toJSON() })
        if (!cancelled && !error) setNotificationState('on')
      }
    }).catch(() => { /* Notification setup remains available in settings. */ })
    return () => { cancelled = true; setNotificationState('off') }
  }, [session?.user.id])

  async function send(existing?: Message) {
    if (preview) { setError(t.previewSend); return }
    if (!supabase || !me || !session) return
    if (!existing && (dictating || imageAbort.current)) return
    const text = existing ? existing.original : draft.trim()
    let imageUrl = existing?.image_url || null
    if ((!text && !imageUrl && !image) || text.length > 2000) return
    const userId = session.user.id
    if (!existing && image) {
      const controller = new AbortController()
      imageAbort.current = controller
      setUploadingImage(true)
      setError('')
      try {
        const mime = await validateSelectedImage(image)
        if (controller.signal.aborted) return
        const { data, error } = await supabase.functions.invoke('upload-image', {
          body: image, headers: { 'Content-Type': mime }, signal: controller.signal, timeout: 45_000,
        })
        if (controller.signal.aborted || userRef.current !== userId) return
        if (error || !isMessageImageUrl(data?.image_url)) throw new Error('Upload failed')
        imageUrl = data.image_url
      } catch {
        if (!controller.signal.aborted && userRef.current === userId) setError(language === 'en'
          ? 'Could not upload the image. Your photo and caption are still here; try Send again.'
          : 'อัปโหลดรูปภาพไม่ได้ ยังเก็บรูปภาพและข้อความไว้ โปรดลองส่งอีกครั้ง')
        return
      } finally {
        if (imageAbort.current === controller) { imageAbort.current = null; setUploadingImage(false) }
      }
    }
    const message: Message = existing || {
      id: crypto.randomUUID(), sender_id: me.id, original: text, source_language: me.language,
      image_url: imageUrl, translation: null, translation_status: text ? 'pending' : 'ready', translation_attempted_at: null, created_at: new Date().toISOString(),
    }
    if (retryLocks.current.has(message.id)) return
    retryLocks.current.add(message.id)
    setMessages(current => mergeMessages(current, [{ ...message, local_status: 'sending' }]))
    if (!existing) { setDraft(''); setImage(null) }
    setError('')
    try {
      const { data, error } = await supabase.from('messages').insert({ id: message.id, sender_id: me.id, original: text, source_language: me.language, ...(imageUrl ? { image_url: imageUrl } : {}) }).select().abortSignal(AbortSignal.timeout(15_000)).single()
      if (error) {
        if (error.code === '23505') {
          const { data: saved, error: readError } = await supabase.from('messages').select('*').eq('id', message.id).single()
          if (readError) throw readError
          if (userRef.current === userId) setMessages(current => mergeMessages(current, [saved]))
          return
        }
        throw error
      }
      if (userRef.current === userId) setMessages(current => mergeMessages(current, [data]))
    } catch (err) {
      if (userRef.current === userId) {
        setMessages(current => mergeMessages(current, [{ ...message, local_status: 'failed' }]))
        const reason = err && typeof err === 'object' && 'message' in err ? String(err.message) : ''
        setError(reason || 'Could not send. Your message is saved on this device; tap it to retry.')
      }
    } finally { retryLocks.current.delete(message.id) }
  }

  async function chooseImage(file?: File) {
    if (!file || imageAbort.current || !me) return
    const userId = session?.user.id
    try {
      await validateSelectedImage(file)
      if (userRef.current !== userId) return
      setImage(file)
      setError('')
    } catch { setError(language === 'en' ? 'Choose a JPEG, PNG, WebP or GIF image under 10 MB.' : 'เลือกรูปภาพ JPEG, PNG, WebP หรือ GIF ขนาดไม่เกิน 10 MB') }
  }

  async function retryTranslation(message: Message) {
    if (!supabase || retryLocks.current.has(message.id)) return
    retryLocks.current.add(message.id)
    setRetrying(current => [...current, message.id])
    try {
      const { error } = await supabase.functions.invoke('process-message', { body: { message_id: message.id } })
      if (error) throw error
      const { data, error: readError } = await supabase.from('messages').select('*').eq('id', message.id).single()
      if (readError) throw readError
      setMessages(current => mergeMessages(current, [data]))
    } catch { setError(language === 'en' ? 'Translation could not be retried. Please try again in a minute.' : 'แปลข้อความไม่ได้ โปรดลองอีกครั้งในหนึ่งนาที') }
    finally {
      retryLocks.current.delete(message.id)
      setRetrying(current => current.filter(id => id !== message.id))
    }
  }

  async function loadOlder() {
    if (!supabase) return
    const oldest = messages.find(message => !message.local_status)
    if (!oldest) return
    setLoading(true)
    const { data, error } = await supabase.from('messages').select('*')
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100)
    if (error) setError('Could not load earlier messages. Please try again.')
    else { setMessages(current => mergeMessages(current, data || [])); setHasOlder(data?.length === 100) }
    setLoading(false)
  }

  async function enableNotifications() {
    if (preview) { setError(t.previewSend); return }
    if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) {
      setError(language === 'en' ? 'Install Kiki on your Home Screen first, then enable notifications. iPhone needs iOS 16.4 or newer.' : 'ติดตั้ง Kiki บนหน้าจอโฮมก่อน แล้วเปิดการแจ้งเตือน iPhone ต้องใช้ iOS 16.4 ขึ้นไป')
      return
    }
    if (!vapidPublicKey) { setError('Notifications need the VAPID keys from the setup guide.'); return }
    setNotificationState('busy')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error(language === 'en' ? 'Notifications are blocked. Allow them in your phone’s notification settings, then try again.' : 'การแจ้งเตือนถูกปิดอยู่ โปรดเปิดในการตั้งค่าโทรศัพท์')
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toApplicationServerKey(vapidPublicKey) })
      const { error } = await supabase!.functions.invoke('save-subscription', { body: subscription.toJSON() })
      if (error) throw new Error('Your device could not be registered. Please try again.')
      setNotificationState('on')
      setError('')
    } catch (err) {
      setNotificationState('off')
      setError(err instanceof Error ? err.message : 'Could not enable notifications.')
    }
  }

  async function signOut() {
    // Remove this user's push registration before ending the session on this device.
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription && supabase) {
        const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
        if (error) throw error
        await subscription.unsubscribe()
      }
      const { error } = await supabase!.auth.signOut({ scope: 'local' })
      if (error) throw error
      if (session) {
        localStorage.removeItem(`kiki-draft-${session.user.id}`)
        localStorage.removeItem(`kiki-unsent-${session.user.id}`)
      }
      setSettings(false)
      setError('')
    } catch { setError('Could not sign out safely. Please reconnect and try again.') }
  }

  return <div className="app-frame">
    {!standalone && <aside className="install-banner" aria-label={language === 'en' ? 'Add to your home screen' : 'เพิ่มไว้บนหน้าจอหลัก'}>
      <strong>{language === 'en' ? 'Add to your home screen' : 'เพิ่มไว้บนหน้าจอหลัก'}</strong>
      <p>{installHelp[language]}</p>
    </aside>}
    <div className="app-shell chat-app">
    <aside className="sidebar">
      <a className="wordmark" href="/" aria-label="Kiki home">kiki<span>✳</span></a>
      <div className="sidebar-intro"><span className="eyebrow">JUST US TWO</span><h1>A little closer,<br />in every word.</h1><p>{t.tagline}</p></div>
      <div className="language-card"><Icon name="globe" size={22} /><div><strong>English <span>↔</span> ไทย</strong><p>{language === 'en' ? 'You talk. We translate.' : 'คุณพูด เราแปลให้'}</p></div></div>
      <div className="sidebar-art" aria-hidden="true"><div className="speech speech-en">hello, you <span>♡</span></div><div className="speech speech-th">คิดถึงนะ <span>✧</span></div><div className="art-line" /><span className="art-star">✳</span></div>
      <footer><Icon name="heart" size={14} /><span>A space made for two.</span></footer>
    </aside>

    <main className="main-panel">
      {!authReady ? <div className="center-state">{t.loading}</div> : !isChat ? <div className="login-layout">
        <div className="mobile-wordmark wordmark">kiki<span>✳</span></div>
        <div className="login-card"><div className="login-heart"><Icon name="heart" size={28} /></div><span className="eyebrow">YOUR PRIVATE LITTLE CORNER</span><h2>{t.signin}</h2><p>{t.tagline}</p>
          <div className="language-toggle" aria-label="Interface language"><button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>English</button><button className={language === 'th' ? 'active' : ''} onClick={() => setLanguage('th')}>ไทย</button></div>
          <Login language={language} onError={setError} />
          {!supabase && <p className="setup-note">{t.setup}</p>}
          {error && <div className="error-note" role="alert">{error}</div>}
          <button className="preview-link" onClick={() => { setPreview(true); setError('') }}>{t.viewPreview}<Icon name="arrow" size={16} /></button>
        </div><p className="login-footnote">English or Thai. Always you.</p>
      </div> : <>
        <header className="chat-header">
          <div className="partner-avatar">{partner?.name?.slice(0, 1) || '♡'}</div>
          <div className="header-title"><h2>{partner?.name || t.chat}</h2><p>English ↔ ไทย</p></div>
          <div className="connection-pill"><span className={preview || (online && connected) ? 'status-dot' : 'status-dot muted'} />{preview ? 'Preview' : !online ? 'Offline' : connected ? 'Connected' : 'Connecting'}</div>
          <button className="icon-button" onClick={() => setSettings(true)} aria-label={t.settings}><Icon name="settings" /></button>
        </header>
        {!online && <div className="notice" role="status">{t.offline}</div>}
        {preview && <div className="preview-banner">{t.preview}<button onClick={() => { setPreview(false); setSettings(false); setError('') }}>{t.back}<Icon name="arrow" size={13} /></button></div>}
        {error && <div className="error-note chat-error" role="alert">{error}<button aria-label="Dismiss" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
        <section ref={messageList} className="message-list" aria-label={t.chat} aria-busy={loading}>
          {hasOlder && !preview && <button className="older-button" disabled={loading} onClick={() => void loadOlder()}>{t.older}</button>}
          {loading && !shownMessages.length ? <div className="center-state">{t.loading}</div> : !shownMessages.length ? <div className="empty-state"><div className="empty-heart"><Icon name="heart" size={32} /></div><h3>{t.empty}</h3><p>{t.emptySub}</p></div> : shownMessages.map((message, index) => {
            const own = message.sender_id === me?.id
            const newDay = index === 0 || new Date(message.created_at).toDateString() !== new Date(shownMessages[index - 1].created_at).toDateString()
            const translated = message.translation_status === 'ready' && !!message.translation
            const footer = <div className="message-meta"><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(language === 'en' ? 'en-GB' : 'th-TH', { hour: '2-digit', minute: '2-digit' })}</time>{own && (message.local_status === 'failed' ? <button onClick={() => void send(message)}>{t.unsent}</button> : message.local_status === 'sending' ? <span>{t.pending}</span> : <MessageTicks message={message} language={language} />)}</div>
            return <div key={message.id}>
              {newDay && <div className="date-divider"><span>{dayLabel(message.created_at, language)}</span></div>}
              <article data-message-id={own ? undefined : message.id} className={`message-row ${own ? 'own' : 'incoming'}`}>
                <div className="message-content"><div className={`message-bubble ${message.local_status === 'failed' ? 'unsent' : ''}`}>
                  {message.image_url && <ImageMessage url={message.image_url} language={language} />}
                  {message.original && (translated ? <AlignedMessage message={message} own={own} language={language} label={own ? t.translated : t.original} footer={footer} /> : <><p lang={message.source_language}>{message.original}</p>{!message.local_status && <div className="translation-status"><Icon name="globe" size={12} />{message.translation_status === 'failed' ? t.failed : t.translating}{!preview && canRetryTranslation(message) && <button disabled={retrying.includes(message.id)} onClick={() => void retryTranslation(message)}>{t.retry}</button>}</div>}</>)}
                  {!translated && footer}
                </div></div>
              </article>
            </div>
          })}<div ref={bottom} />
        </section>
        <form className="composer" onSubmit={event => { event.preventDefault(); void send() }}>
          {image && <div className="attachment-preview">
            {imagePreview && <img src={imagePreview} alt={language === 'en' ? 'Selected image' : 'รูปภาพที่เลือก'} />}
            <span role="status">{uploadingImage ? language === 'en' ? 'Uploading image…' : 'กำลังอัปโหลดรูปภาพ…' : language === 'en' ? 'Add a caption below, or send the image.' : 'เพิ่มข้อความด้านล่าง หรือส่งรูปภาพได้เลย'}</span>
            <button type="button" className="icon-button" aria-label={language === 'en' ? 'Remove image' : 'ลบรูปภาพ'} onClick={() => { imageAbort.current?.abort(); setImage(null) }}><Icon name="close" /></button>
          </div>}
          <div className="composer-box"><div className="composer-input">{!preview && me && <>
            <input ref={imageInput} type="file" accept={imageAccept} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void chooseImage(file) }} />
            <button type="button" className="icon-button image-button" aria-label={language === 'en' ? 'Attach image' : 'แนบรูปภาพ'} disabled={uploadingImage || !online} onClick={() => imageInput.current?.click()}><Icon name="image" /></button>
          </>}<textarea ref={textarea} aria-label={t.placeholder} placeholder={image ? language === 'en' ? 'Add a caption (optional)' : 'เพิ่มข้อความ (ไม่จำเป็น)' : t.placeholder} disabled={uploadingImage} value={draft} maxLength={2000} rows={1} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !matchMedia('(pointer: coarse)').matches) { event.preventDefault(); void send() } }} />{!preview && me && <Dictation key={me.id} language={me.language} disabled={uploadingImage || !online} onBusyChange={setDictating} onTranscript={text => {
            setDraft(current => appendDictation(current, text))
          }} />}</div><button className="send-button" aria-label={t.send} disabled={uploadingImage || dictating || (!draft.trim() && !image) || draft.length > 2000 || (!preview && !me)} type="submit"><Icon name="send" size={19} /></button></div>
          {draft.length > 2000 && <p className="draft-limit" role="alert">{language === 'en' ? 'Your text is kept. Shorten it to 2,000 characters before sending.' : 'เก็บข้อความไว้แล้ว โปรดย่อให้ไม่เกิน 2,000 ตัวอักษรก่อนส่ง'}</p>}
          <div className={`composer-caption${draft.length > 1800 ? ' has-count' : ''}`}><span><Icon name="globe" size={11} />{language === 'en' ? 'English → Thai, automatically' : 'ไทย → English แปลให้อัตโนมัติ'}</span><span>{draft.length > 1800 ? `${draft.length}/2000` : <><Icon name="heart" size={10} /> Just us two</>}</span></div>
        </form>
      </>}
    </main>

    {settings && <div className="modal-backdrop" onClick={() => setSettings(false)}><SettingsDialog title={t.settings} onClose={() => setSettings(false)}>
      <div className="setting-block"><h3>{t.yourLanguage}</h3>{preview ? <div className="language-toggle"><button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>English</button><button className={language === 'th' ? 'active' : ''} onClick={() => setLanguage('th')}>ไทย</button></div> : <p>{language === 'en' ? 'English → Thai' : 'ไทย → English'}</p>}</div>
      <div className="setting-block"><h3><Icon name="bell" size={18} />{t.notifications}</h3><p>{t.notificationNote}</p><button className="primary-button" disabled={notificationState === 'busy' || notificationState === 'on'} onClick={() => void enableNotifications()}>{notificationState === 'on' ? `✓ ${t.enabled}` : notificationState === 'busy' ? '…' : t.notifications}</button></div>
      <div className="setting-block"><h3>{t.install}</h3><p>{t.installNote}</p></div>
      <p className="privacy-note">{t.privacy}</p>
      {error && <div className="error-note" role="alert">{error}</div>}
      <button className="signout-button" onClick={() => preview ? (setPreview(false), setSettings(false), setError('')) : void signOut()}>{preview ? t.back : t.signout}</button>
    </SettingsDialog></div>}
  </div></div>
}

function MessageTicks({ message, language }: { message: Message; language: Language }) {
  const status = receiptStatus(message)
  const label = language === 'en'
    ? status === 'read' ? 'Read' : status === 'delivered' ? 'Delivered' : 'Sent'
    : status === 'read' ? 'อ่านแล้ว' : status === 'delivered' ? 'ส่งถึงแล้ว' : 'ส่งแล้ว'
  return <span className={`sent-check ${status}`} role="img" aria-label={label} title={label}>
    <svg width={status === 'sent' ? 16 : 22} height="16" viewBox={status === 'sent' ? '0 0 18 20' : '0 0 26 20'} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2 10 5 5L17 5" />{status !== 'sent' && <path d="m13 13 2 2L25 5" />}
    </svg>
  </span>
}

function Login({ language, onError }: { language: Language; onError: (value: string) => void }) {
  const [busy, setBusy] = useState(false)
  const t = copy[language]
  return <form className="login-form" onSubmit={async event => {
    event.preventDefault()
    if (!supabase) return
    const data = new FormData(event.currentTarget)
    setBusy(true)
    onError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) })
      if (error) throw error
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not sign in. Please try again.') }
    finally { setBusy(false) }
  }}><label>{t.email}<input name="email" type="email" autoComplete="username" placeholder="you@example.com" required disabled={busy} /></label><label>{t.password}<input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required disabled={busy} /></label><button className="primary-button" disabled={busy || !supabase}>{busy ? '…' : t.login}<Icon name="arrow" size={16} /></button></form>
}

function SettingsDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close() }, [])
  return <dialog ref={ref} className="settings-dialog" aria-labelledby="settings-title" onCancel={onClose} onClick={event => event.stopPropagation()}><div className="dialog-header"><h2 id="settings-title">{title}</h2><button className="icon-button" aria-label="Close settings" onClick={onClose}><Icon name="close" /></button></div>{children}</dialog>
}
