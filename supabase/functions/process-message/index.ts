import webpush from 'npm:web-push@3.6.7'
import { adminClient, corsHeaders, getMember, json } from '../_shared/http.ts'
import { isAllowedPushEndpoint, isWebhookInsert, uuidPattern } from '../_shared/validation.ts'
import { parseAzureAlignment } from '../_shared/alignment.ts'
import { pronunciationText, romanizeThaiWords } from '../_shared/pronunciation.ts'
import { messageNotification } from '../_shared/notifications.ts'

type Message = { id: string; sender_id: string; original: string; source_language: 'en' | 'th'; translation_attempted_at: string }

async function translate(client: ReturnType<typeof adminClient>, id: string) {
  const { data, error } = await client.rpc('claim_translation', { message_id: id })
  if (error) throw error
  const message = data?.[0] as Message | undefined
  if (!message) return { claimed: false }
  try {
    const key = Deno.env.get('AZURE_TRANSLATOR_KEY')
    if (!key) throw new Error('Translation is not configured')
    const target = message.source_language === 'en' ? 'th' : 'en'
    const params = new URLSearchParams({ 'api-version': '3.0', from: message.source_language, to: target, textType: 'plain', includeAlignment: 'true' })
    if (target === 'th') params.set('toScript', 'Latn')
    const region = Deno.env.get('AZURE_TRANSLATOR_REGION')
    const headers = { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': key, ...(region ? { 'Ocp-Apim-Subscription-Region': region } : {}) }
    const response = await fetch(`https://api.cognitive.microsofttranslator.com/translate?${params}`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ Text: message.original }]),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error('Translation provider failed')
    const result = await response.json()
    const resultTranslation = result?.[0]?.translations?.[0]
    const translation = resultTranslation?.text
    if (typeof translation !== 'string' || !translation || resultTranslation.to !== target) throw new Error('Invalid translation')
    const alignment = parseAzureAlignment(resultTranslation.alignment?.proj, message.original, translation)
    const thai_pronunciation_parts = await romanizeThaiWords(message.source_language === 'th' ? message.original : translation, headers)
    const romanization = resultTranslation.transliteration
    const thai_romanization = thai_pronunciation_parts.length ? pronunciationText(thai_pronunciation_parts)
      : romanization?.script === 'Latn' && typeof romanization.text === 'string' && romanization.text.trim()
      ? romanization.text.trim() : null
    const { error: saveError } = await client.from('messages').update({ translation, alignment, thai_romanization, thai_pronunciation_parts, translation_status: 'ready' })
      .eq('id', id).eq('translation_attempted_at', message.translation_attempted_at)
    if (saveError) throw saveError
    return { claimed: true, translated: true }
  } catch {
    const { error: saveError } = await client.from('messages').update({ translation_status: 'failed' })
      .eq('id', id).eq('translation_attempted_at', message.translation_attempted_at)
    if (saveError) throw saveError
    return { claimed: true, translated: false }
  }
}

async function notify(client: ReturnType<typeof adminClient>, id: string) {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT')
  if (!publicKey || !privateKey || !subject) throw new Error('Push is not configured')
  const { data: message, error } = await client.from('messages').update({ notification_claimed_at: new Date().toISOString() })
    .eq('id', id).is('notification_claimed_at', null).select('id,sender_id,original,image_url').maybeSingle()
  if (error) throw error
  if (!message) return
  const { data: members, error: memberError } = await client.from('members').select('id,name,language')
  if (memberError) throw memberError
  const sender = members?.find(member => member.id === message.sender_id)
  for (const recipient of members || []) {
    if (recipient.id === message.sender_id) continue
    const { data: devices, error: deviceError } = await client.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', recipient.id)
    if (deviceError) throw deviceError
    const payload = JSON.stringify(messageNotification(sender?.name, message, recipient.language))
    await Promise.all((devices || []).map(async device => {
      if (!isAllowedPushEndpoint(device.endpoint)) return
      try {
        await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, {
          vapidDetails: { subject, publicKey, privateKey }, TTL: 86400, urgency: 'high', timeout: 10_000,
        })
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          const { error: deleteError } = await client.from('push_subscriptions').delete().eq('endpoint', device.endpoint)
          if (deleteError) throw deleteError
        } else {
          // shortcut: push is best effort without a queue; add durable retries if missed alerts become a problem.
          console.warn('Push delivery failed', { status: status || 'network' })
        }
      }
    }))
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const client = adminClient()
    const secret = Deno.env.get('MESSAGE_WEBHOOK_SECRET')
    const webhook = !!secret && req.headers.get('x-webhook-secret') === secret
    if (!webhook && !await getMember(req, client)) return json({ error: 'Unauthorized' }, 401)
    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    const id = webhook ? isWebhookInsert(body) ? body.record.id : null : body?.message_id
    if (typeof id !== 'string' || !uuidPattern.test(id)) return json({ error: 'Invalid message' }, 400)
    const { data: message, error } = await client.from('messages').select('id').eq('id', id).maybeSingle()
    if (error) throw error
    if (!message) return json({ error: 'Message not found' }, 404)
    // Sending notifications never waits on translation, or vice versa.
    const [translation, push] = await Promise.allSettled([translate(client, id), webhook ? notify(client, id) : Promise.resolve()])
    if (push.status === 'rejected') console.warn('Notification processing failed')
    if (translation.status === 'rejected') return json({ error: 'Could not process translation' }, 500)
    return json(translation.value, translation.value.translated === false ? 502 : 200)
  } catch {
    return json({ error: 'Could not process this message' }, 500)
  }
})
