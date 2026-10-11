import webpush from 'web-push'
import { appendFileSync, existsSync, chmodSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')
if (process.env.VAPID_PRIVATE_KEY || process.env.VITE_VAPID_PUBLIC_KEY) {
  throw new Error('VAPID keys already exist. Keep them: rotating keys invalidates existing device subscriptions.')
}
const keys = webpush.generateVAPIDKeys()
appendFileSync('.env', `\nVITE_VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`)
chmodSync('.env', 0o600)
console.log('VAPID keys saved to the ignored .env file. No keys were printed.')
