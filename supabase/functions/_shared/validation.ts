export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      (url.hostname === 'fcm.googleapis.com' && url.pathname.startsWith('/fcm/send/')) ||
      (url.hostname === 'web.push.apple.com' && url.pathname.startsWith('/')) ||
      (url.hostname === 'updates.push.services.mozilla.com' && url.pathname.startsWith('/wpush/'))
    )
  } catch { return false }
}

export function isValidSubscription(value: unknown): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== 'object') return false
  const subscription = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  return isAllowedPushEndpoint(subscription.endpoint)
    && typeof subscription.keys?.p256dh === 'string' && /^[A-Za-z0-9_-]{87}=?$/.test(subscription.keys.p256dh)
    && typeof subscription.keys?.auth === 'string' && /^[A-Za-z0-9_-]{22}={0,2}$/.test(subscription.keys.auth)
}

export function isWebhookInsert(value: unknown): value is { record: { id: string } } {
  if (!value || typeof value !== 'object') return false
  const event = value as { type?: unknown; schema?: unknown; table?: unknown; record?: { id?: unknown } }
  return event.type === 'INSERT' && event.schema === 'public' && event.table === 'messages'
    && typeof event.record?.id === 'string' && uuidPattern.test(event.record.id)
}
