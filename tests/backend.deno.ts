import assert from 'node:assert/strict'

// Capture the actual deployed handlers without starting a listening server.
const handlers: ((request: Request) => Promise<Response>)[] = []
const serve = Deno.serve
Deno.serve = ((handler: (request: Request) => Promise<Response>) => { handlers.push(handler) }) as typeof Deno.serve
await import('../supabase/functions/process-message/index.ts')
await import('../supabase/functions/save-subscription/index.ts')
Deno.serve = serve
const [processMessage, saveSubscription] = handlers

const id = '9157f11a-07aa-4ead-94e1-3a00fdb9f711'
const userId = '11111111-1111-4111-8111-111111111111'
const secret = 'test-only-webhook-secret-not-a-real-secret'
const fakeFetch = globalThis.fetch
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const webhook = (value: unknown) => new Request('https://local.test/process-message', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret }, body: JSON.stringify(value),
})
const event = { type: 'INSERT', schema: 'public', table: 'messages', record: { id } }

function configure() {
  Deno.env.set('SUPABASE_URL', 'https://project.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service-key')
  Deno.env.set('MESSAGE_WEBHOOK_SECRET', secret)
  Deno.env.set('AZURE_TRANSLATOR_KEY', 'test-only-azure-key')
  Deno.env.set('AZURE_TRANSLATOR_REGION', 'westeurope')
  Deno.env.delete('VAPID_PRIVATE_KEY')
  globalThis.fetch = () => { throw new Error('Unexpected network request') }
}

Deno.test('all functions reject callers without a member JWT or valid webhook secret', async () => {
  configure()
  try {
    for (const handler of [processMessage, saveSubscription]) {
      assert.equal((await handler(new Request('https://local.test', { method: 'POST', body: '{}' }))).status, 401)
    }
    assert.equal((await processMessage(new Request('https://local.test', { method: 'POST', headers: { 'x-webhook-secret': 'wrong' }, body: JSON.stringify(event) }))).status, 401)
  } finally { globalThis.fetch = fakeFetch }
})

Deno.test('an authenticated outsider cannot process translations or register a device', async () => {
  configure()
  globalThis.fetch = async input => {
    const url = String(input)
    if (url.includes('/auth/v1/user')) return response({ id: userId })
    if (url.includes('/rest/v1/members')) return response(null)
    throw new Error('Unexpected request')
  }
  try {
    for (const handler of [processMessage, saveSubscription]) {
      assert.equal((await handler(new Request('https://local.test', { method: 'POST', headers: { Authorization: 'Bearer fake-user-jwt' }, body: '{}' }))).status, 401)
    }
  } finally { globalThis.fetch = fakeFetch }
})

Deno.test('valid webhook secrets do not allow malformed events or JSON', async () => {
  configure()
  try {
    assert.equal((await processMessage(webhook({ ...event, table: 'members' }))).status, 400)
    assert.equal((await processMessage(new Request('https://local.test', { method: 'POST', headers: { 'x-webhook-secret': secret }, body: '{broken' }))).status, 400)
  } finally { globalThis.fetch = fakeFetch }
})

for (const source of ['en', 'th']) {
  Deno.test(`${source} messages translate canonical text and save the result even when push is unconfigured`, async () => {
    configure()
    const updates: Record<string, unknown>[] = []
    const original = 'Hello 💛\nสวัสดี'
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('/rpc/claim_translation')) return response([{ id, original, sender_id: userId, source_language: source, translation_attempted_at: '2026-10-09T10:00:00Z' }])
      if (url.includes('/transliterate?')) {
        const params = new URL(url).searchParams
        assert.equal(params.get('language'), 'th')
        assert.equal(params.get('fromScript'), 'Thai')
        assert.equal(params.get('toScript'), 'Latn')
        assert.deepEqual(JSON.parse(String(init?.body)), [{ Text: 'สวัสดี' }])
        return response([{ text: 'sawatdi', script: 'Latn' }])
      }
      if (url.includes('api.cognitive.microsofttranslator.com')) {
        const params = new URL(url).searchParams
        assert.equal(params.get('from'), source)
        assert.equal(params.get('to'), source === 'en' ? 'th' : 'en')
        assert.equal(params.get('includeAlignment'), 'true')
        assert.equal(params.get('textType'), 'plain')
        assert.equal(params.get('toScript'), source === 'en' ? 'Latn' : null)
        assert.deepEqual(JSON.parse(String(init?.body)), [{ Text: original }])
        assert.equal(new Headers(init?.headers).get('Ocp-Apim-Subscription-Key'), 'test-only-azure-key')
        assert.equal(new Headers(init?.headers).get('Ocp-Apim-Subscription-Region'), 'westeurope')
        return response([{ translations: [{ text: 'Translated 💛', to: source === 'en' ? 'th' : 'en', alignment: { proj: '0:4-0:9' }, transliteration: source === 'en' ? { text: 'sawatdi', script: 'Latn' } : undefined }] }])
      }
      if (url.includes('/rest/v1/messages')) {
        if (init?.method === 'PATCH') { updates.push(JSON.parse(String(init.body))); return response([]) }
        return response({ id })
      }
      throw new Error('Unexpected request')
    }
    try {
      const result = await processMessage(webhook({ ...event, record: { id, original: 'Forged webhook text' } }))
      assert.equal(result.status, 200)
      assert.deepEqual(updates, [{ translation: 'Translated 💛', alignment: [{ source: [0, 5], target: [0, 10] }], thai_romanization: source === 'en' ? 'sawatdi' : 'Hello 💛\nsawatdi', thai_pronunciation_parts: source === 'en' ? [] : [{ start: 0, end: 5, text: 'Hello' }, { start: 5, end: 6, text: ' ' }, { start: 6, end: 8, text: '💛' }, { start: 8, end: 9, text: '\n' }, { start: 9, end: 15, text: 'sawatdi' }], translation_status: 'ready' }])
    } finally { globalThis.fetch = fakeFetch }
  })
}

Deno.test('provider failure records a failed translation without changing the original', async () => {
  configure()
  const updates: unknown[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/rpc/claim_translation')) return response([{ id, original: 'Keep me', source_language: 'en', translation_attempted_at: '2026-10-09T10:00:00Z' }])
    if (url.includes('api.cognitive.microsofttranslator.com')) return response({ error: 'Unavailable' }, 503)
    if (url.includes('/rest/v1/messages')) {
      if (init?.method === 'PATCH') { updates.push(JSON.parse(String(init.body))); return response([]) }
      return response({ id })
    }
    throw new Error('Unexpected request')
  }
  try {
    assert.equal((await processMessage(webhook(event))).status, 502)
    assert.deepEqual(updates, [{ translation_status: 'failed' }])
  } finally { globalThis.fetch = fakeFetch }
})

Deno.test('missing or invalid word links never discard a successful translation', async () => {
  configure()
  try {
    for (const projection of [undefined, 'bad 0:999-0:999']) {
      let saved: unknown
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url.includes('/rpc/claim_translation')) return response([{ id, original: 'I love you', source_language: 'en', translation_attempted_at: '2026-10-09T10:00:00Z' }])
        if (url.includes('api.cognitive.microsofttranslator.com')) return response([{ translations: [{ text: 'ฉันรักคุณ', to: 'th', alignment: projection ? { proj: projection } : undefined }] }])
        if (url.includes('/rest/v1/messages')) {
          if (init?.method === 'PATCH') { saved = JSON.parse(String(init.body)); return response([]) }
          return response({ id })
        }
        throw new Error('Unexpected request')
      }
      assert.equal((await processMessage(webhook(event))).status, 200)
      assert.deepEqual(saved, { translation: 'ฉันรักคุณ', alignment: [], thai_romanization: null, thai_pronunciation_parts: [], translation_status: 'ready' })
    }
  } finally { globalThis.fetch = fakeFetch }
})

Deno.test('already claimed messages never call the translation provider again', async () => {
  configure()
  globalThis.fetch = async input => {
    const url = String(input)
    if (url.includes('/rpc/claim_translation')) return response([])
    if (url.includes('/rest/v1/messages')) return response({ id })
    throw new Error('Unexpected request')
  }
  try { assert.equal((await processMessage(webhook(event))).status, 200) }
  finally { globalThis.fetch = fakeFetch }
})

Deno.test('member subscription registration binds to the verified user, ignoring forged ownership', async () => {
  configure()
  const subscription = { endpoint: 'https://web.push.apple.com/token', user_id: 'forged-owner', keys: { p256dh: 'A'.repeat(87), auth: 'a'.repeat(22) } }
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/auth/v1/user')) return response({ id: userId })
    if (url.includes('/rest/v1/members')) return response({ id: userId, language: 'th', name: 'Person' })
    if (url.includes('/rest/v1/push_subscriptions')) {
      assert.deepEqual(JSON.parse(String(init?.body)), { endpoint: subscription.endpoint, user_id: userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth })
      return response([])
    }
    throw new Error('Unexpected request')
  }
  try {
    const result = await saveSubscription(new Request('https://local.test', { method: 'POST', headers: { Authorization: 'Bearer fake-user-jwt' }, body: JSON.stringify(subscription) }))
    assert.equal(result.status, 200)
  } finally { globalThis.fetch = fakeFetch }
})

Deno.test('unavailable or malformed pronunciation preserves a successful Thai message translation', async () => {
  configure()
  try {
    for (const failure of ['http', 'network', 'malformed']) {
      let saved: unknown
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url.includes('/rpc/claim_translation')) return response([{ id, original: 'สวัสดี', source_language: 'th', translation_attempted_at: '2026-10-09T10:00:00Z' }])
        if (url.includes('/transliterate?')) {
          if (failure === 'network') throw new Error('Network unavailable')
          return failure === 'http' ? response({}, 503) : response([{ text: 42, script: 'Latn' }])
        }
        if (url.includes('api.cognitive.microsofttranslator.com')) return response([{ translations: [{ text: 'Hello', to: 'en' }] }])
        if (url.includes('/rest/v1/messages')) {
          if (init?.method === 'PATCH') { saved = JSON.parse(String(init.body)); return response([]) }
          return response({ id })
        }
        throw new Error('Unexpected request')
      }
      assert.equal((await processMessage(webhook(event))).status, 200)
      assert.deepEqual(saved, { translation: 'Hello', alignment: [], thai_romanization: null, thai_pronunciation_parts: [], translation_status: 'ready' })
    }
  } finally { globalThis.fetch = fakeFetch }
})
