import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { isStandalone, installInstructions } from '../src/pwa.ts'

test('install instructions match the browser/device, including iPad desktop mode and browser fallbacks', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'
  assert.match(installInstructions(`${iphone} Version/18.0 Mobile/15E148 Safari/604.1`).en, /^Tap Share/)
  assert.match(installInstructions(`${iphone} CriOS/130.0 Mobile/15E148 Safari/604.1`).en, /^Open this page in Safari/)
  assert.match(installInstructions(ipad, 5).en, /^Tap Share/)
  assert.match(installInstructions(ipad, 0).en, /Add to Dock/)
  const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
  assert.match(installInstructions(android).en, /^Tap the ⋮ menu/)
  assert.match(installInstructions(`${android} SamsungBrowser/27.0`).en, /^Open this page in Chrome,/)
  assert.match(installInstructions(`${android} EdgA/130.0`).en, /^Open this page in Chrome,/)
  assert.match(installInstructions('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0').en, /^Click the install icon/)
  assert.match(installInstructions('Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/130.0').en, /^Open this page in Chrome or Edge/)
  assert.match(installInstructions(`${iphone} Version/18.0 Mobile/15E148 Safari/604.1`).th, /^แตะแชร์/)
  assert.match(installInstructions(android).th, /^แตะเมนู ⋮/)
})

test('install banner detection covers regular browsers, Android PWA, and iPhone home-screen mode', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    for (const [displayMode, safariStandalone, expected] of [
      [false, undefined, false], [false, false, false], [true, undefined, true], [false, true, true],
    ] as const) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: (query: string) => {
        assert.equal(query, '(display-mode: standalone)')
        return { matches: displayMode }
      } } })
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { standalone: safariStandalone } })
      assert.equal(isStandalone(), expected)
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
})

test('manifest provides correctly sized install icons and a standalone app', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  for (const icon of manifest.icons) {
    const file = readFileSync(`public${icon.src}`)
    assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    const expected = Number(icon.sizes.split('x')[0])
    assert.equal(file.readUInt32BE(16), expected)
    assert.equal(file.readUInt32BE(20), expected)
  }
})

test('service worker ignores API and cross-origin requests', () => {
  const handlers: Record<string, (event: unknown) => void> = {}
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://kiki.example' }, addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler } },
    URL,
  })
  for (const url of ['https://project.supabase.co/rest/v1/messages', 'https://kiki.example/api/messages']) {
    let intercepted = false
    handlers.fetch({ request: { url, method: 'GET', mode: 'cors' }, respondWith: () => { intercepted = true } })
    assert.equal(intercepted, false)
  }
})

test('push notification works even when its payload is malformed', async () => {
  const handlers: Record<string, (event: unknown) => void> = {}
  let title = ''
  let body = ''
  const pending: Promise<unknown>[] = []
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: {
      addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler },
      registration: { showNotification: (value: string, options: { body: string }) => { title = value; body = options.body; return Promise.resolve() } },
    },
  })
  handlers.push({ data: { json: () => { throw new Error('Malformed') } }, waitUntil: (value: Promise<unknown>) => pending.push(value) })
  await Promise.all(pending)
  assert.equal(title, 'Kiki')
  assert.equal(body, 'You have a new message.')
})

test('app navigation revalidates cached HTML so deployments load the current asset files', async () => {
  const handlers: Record<string, (event: unknown) => void> = {}
  let response: Promise<unknown> | undefined
  const networkResponse = { ok: false }
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://kiki.example' }, addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler } },
    URL,
    fetch: (_request: unknown, options: { cache: string }) => {
      assert.equal(options.cache, 'no-cache')
      return Promise.resolve(networkResponse)
    },
  })
  handlers.fetch({ request: { url: 'https://kiki.example/', method: 'GET', mode: 'navigate' }, respondWith: (value: Promise<unknown>) => { response = value } })
  assert.equal(await response, networkResponse)
})
