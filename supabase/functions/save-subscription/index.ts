import { adminClient, corsHeaders, getMember, json } from '../_shared/http.ts'
import { isValidSubscription } from '../_shared/validation.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const client = adminClient()
    const member = await getMember(req, client)
    if (!member) return json({ error: 'Sign in to this private chat first' }, 401)
    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    if (!isValidSubscription(body)) return json({ error: 'Invalid push subscription' }, 400)
    // An endpoint can move to the other account when a shared device changes users.
    const { error } = await client.from('push_subscriptions').upsert({
      endpoint: body.endpoint, user_id: member.id, p256dh: body.keys.p256dh, auth: body.keys.auth,
    }, { onConflict: 'endpoint' })
    if (error) throw error
    return json({ ok: true })
  } catch {
    return json({ error: 'Could not register this device' }, 500)
  }
})
