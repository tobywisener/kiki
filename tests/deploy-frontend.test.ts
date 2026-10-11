import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deploymentFiles, uploadConfig, uploadProgress } from '../scripts/deploy-frontend.mjs'

const settings = { FRONTEND_FTP_HOST: 'ftp.example.com', FRONTEND_FTP_USER: 'toby', FRONTEND_FTP_PASSWORD: 'test\\"password', FRONTEND_FTP_DIR: '/public_html/kiki' }

test('progress bar reports completed files from zero to 100 percent', () => {
  assert.equal(uploadProgress(0, 4), '[--------------------] 0% (0/4 files)')
  assert.equal(uploadProgress(1, 4), '[#####---------------] 25% (1/4 files)')
  assert.equal(uploadProgress(4, 4), '[####################] 100% (4/4 files)')
})

test('deployment includes only build output, uploads assets before the page, and rejects symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiki-deploy-test-'))
  try {
    const dist = join(root, 'dist')
    mkdirSync(join(dist, 'assets'), { recursive: true })
    for (const file of ['index.html', 'sw.js', 'assets/chat.js']) writeFileSync(join(dist, file), 'sample')
    writeFileSync(join(root, '.env'), 'private')
    assert.deepEqual(deploymentFiles(dist), ['assets/chat.js', 'index.html', 'sw.js'])
    symlinkSync(join(root, '.env'), join(dist, 'leak'))
    assert.throws(() => deploymentFiles(dist), /regular files/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('FTPS config escapes credentials, preserves remote folder semantics, and encodes filenames', () => {
  const config = uploadConfig(settings, 'assets/a b.js')
  assert.ok(config.includes('user = "toby:test\\\\\\"password"'))
  assert.ok(config.includes('ftp://ftp.example.com:21//public_html/kiki/assets/a%20b.js'))
  assert.ok(uploadConfig({ ...settings, FRONTEND_FTP_DIR: 'kiki', FRONTEND_FTP_PORT: '990' }, 'index.html').includes('ftps://ftp.example.com:990/kiki/index.html'))
  assert.ok(uploadConfig({ ...settings, FRONTEND_FTP_DIR: '/' }, 'index.html').includes(':21//index.html'))
})

test('deployment rejects missing settings, invalid ports, config injection and traversal', () => {
  for (const change of [
    { FRONTEND_FTP_PASSWORD: '' }, { FRONTEND_FTP_PASSWORD: 'bad\nconfig' },
    { FRONTEND_FTP_HOST: 'ftp://example.com' }, { FRONTEND_FTP_USER: 'user:other' },
    { FRONTEND_FTP_PORT: '70000' }, { FRONTEND_FTP_PORT: '0' }, { FRONTEND_FTP_DIR: '../other' },
  ]) assert.throws(() => uploadConfig({ ...settings, ...change }, 'index.html'))
  assert.throws(() => uploadConfig(settings, '../.env'))
})
