import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

export function uploadProgress(completed, total) {
  const percent = Math.floor(completed / total * 100)
  const filled = Math.floor(percent / 5)
  return `[${'#'.repeat(filled)}${'-'.repeat(20 - filled)}] ${percent}% (${completed}/${total} files)`
}

export function deploymentFiles(directory) {
  const files = []
  function walk(folder, prefix = '') {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name
      if (entry.isDirectory()) walk(join(folder, entry.name), relative + '/')
      else if (entry.isFile()) files.push(relative)
      else throw new Error('Deployment output must contain regular files only.')
    }
  }
  walk(directory)
  if (!files.includes('index.html') || !files.includes('sw.js')) throw new Error('Build output is missing index.html or sw.js.')
  const priority = file => file === 'sw.js' ? 2 : file === 'index.html' ? 1 : 0
  return files.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b))
}

export function uploadConfig(env, file) {
  for (const name of ['FRONTEND_FTP_HOST', 'FRONTEND_FTP_USER', 'FRONTEND_FTP_PASSWORD', 'FRONTEND_FTP_DIR']) {
    if (!env[name] || /[\r\n\0]/.test(env[name])) throw new Error(`Set a valid ${name} in .env.`)
  }
  if (!/^[a-z\d.-]+$/i.test(env.FRONTEND_FTP_HOST)) throw new Error('FRONTEND_FTP_HOST must be a hostname without a scheme or path.')
  if (env.FRONTEND_FTP_USER.includes(':')) throw new Error('FTP usernames cannot contain a colon.')
  const port = Number(env.FRONTEND_FTP_PORT || 21)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FRONTEND_FTP_PORT.')
  const directory = env.FRONTEND_FTP_DIR.replace(/\/+$/, '')
  if ([...directory.split('/'), ...file.split('/')].some(part => part === '..' || part === '.')) throw new Error('Upload paths cannot contain . or .. segments.')
  const path = `${directory}/${file}`.split('/').map(encodeURIComponent).join('/')
  const url = `${port === 990 ? 'ftps' : 'ftp'}://${env.FRONTEND_FTP_HOST}:${port}/${path}`
  const quote = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"'
  // Credentials go through stdin, never process arguments or deployment logs.
  return `user = ${quote(`${env.FRONTEND_FTP_USER}:${env.FRONTEND_FTP_PASSWORD}`)}\nurl = ${quote(url)}\n`
}

if (import.meta.main) {
  try {
    process.loadEnvFile('.env')
    uploadConfig(process.env, 'index.html')
    for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_VAPID_PUBLIC_KEY']) {
      if (!process.env[name]) throw new Error(`Set ${name} before building the frontend.`)
    }
    const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' })
    if (build.error || build.status !== 0) throw new Error('Frontend build failed; nothing was uploaded.')
    const files = deploymentFiles('dist')
    let completed = 0
    for (const file of files) {
      console.log(`\n${uploadProgress(completed, files.length)} Uploading ${file}`)
      // This host aborts macOS curl's FTPS data transfers unless TLS 1.2 is selected.
      const upload = spawnSync('curl', ['--disable', '--config', '-', '--progress-bar', '--fail', '--globoff', '--ssl-reqd', '--tlsv1.2', '--tls-max', '1.2', '--ftp-create-dirs', '--connect-timeout', '20', '--max-time', '120', '--upload-file', join('dist', file)], {
        input: uploadConfig(process.env, file), encoding: 'utf8', stdio: ['pipe', 'ignore', 'inherit'],
      })
      if (upload.error || upload.status !== 0) throw new Error(`Upload failed for ${file} (curl exit ${upload.status ?? 'unavailable'}). Check the FTPS host, port, credentials, folder and certificate. Rerunning is safe.`)
      completed++
    }
    console.log(`\n${uploadProgress(completed, files.length)} Upload complete. Checking HTTPS…`)
    // shortcut: retain old hashed assets for open tabs; clean them manually if host storage becomes tight.
    const response = await fetch(`https://kiki.wisener.me/?deploy=${Date.now()}`, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok || await response.text() !== readFileSync('dist/index.html', 'utf8')) {
      throw new Error('Uploads finished, but the public HTTPS page does not match this build. Check the subdomain document root and hosting cache.')
    }
    console.log('Frontend deployed and verified: https://kiki.wisener.me');
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
