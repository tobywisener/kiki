import { mkdtempSync, writeFileSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

process.loadEnvFile('.env')
const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
if (!/^[a-z]{20}$/.test(projectRef)) throw new Error('Unexpected Supabase project reference.')
const names = ['AZURE_TRANSLATOR_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
for (const name of names) {
  if (!process.env[name]) throw new Error(`Set ${name} in your local .env before deployment.`)
}
if (!/^(mailto:|https:\/\/)/.test(process.env.VAPID_SUBJECT)) throw new Error('VAPID_SUBJECT must be a mailto: address or HTTPS URL.')
if (!process.env.MESSAGE_WEBHOOK_SECRET) {
  process.env.MESSAGE_WEBHOOK_SECRET = randomBytes(32).toString('hex')
  appendFileSync('.env', `\nMESSAGE_WEBHOOK_SECRET=${process.env.MESSAGE_WEBHOOK_SECRET}\n`)
}
names.push('MESSAGE_WEBHOOK_SECRET')
if (process.env.AZURE_TRANSLATOR_REGION) names.push('AZURE_TRANSLATOR_REGION')
if (process.env.IMGBB_API_KEY) names.push('IMGBB_API_KEY')
const temp = mkdtempSync(join(tmpdir(), 'kiki-secrets-'))
const secretsFile = join(temp, '.env')
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error('Deployment command failed. Check the CLI message above; rerunning is safe.')
}
try {
  writeFileSync(secretsFile, names.map(name => `${name}=${JSON.stringify(process.env[name])}`).join('\n') + '\n', { mode: 0o600 })
  run('npx', ['--yes', 'supabase@2.120.0', 'secrets', 'set', '--project-ref', projectRef, '--env-file', secretsFile])
  for (const name of ['process-message', 'save-subscription', 'upload-image']) {
    run('npx', ['--yes', 'supabase@2.120.0', 'functions', 'deploy', name, '--project-ref', projectRef, '--use-api'])
  }
  run(process.execPath, ['scripts/database.mjs', 'webhook'])
  console.log('Backend deployed. New messages will translate and notify registered devices.')
} finally { rmSync(temp, { recursive: true, force: true }) }
