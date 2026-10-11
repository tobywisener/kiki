import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const one = '11111111-1111-4111-8111-111111111111'
const two = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'
const message = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

async function database() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create publication supabase_realtime;
    insert into auth.users values ('${one}'), ('${two}'), ('${outsider}');
  `)
  const directory = new URL('../supabase/migrations/', import.meta.url)
  for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, directory), 'utf8'))
  }
  await db.query('insert into public.members (id,name,language) values ($1,$2,$3),($4,$5,$6)', [one, 'You', 'en', two, 'คนพิเศษ', 'th'])
  return db
}

async function asUser(db: PGlite, id: string) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec('set role authenticated')
}

test('private chat: members can send/read; outsiders and anonymous users cannot', async () => {
  const db = await database()
  try {
    await asUser(db, one)
    await db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, one, 'Hello 🤍\nสวัสดี', 'en'])
    await asUser(db, two)
    const visible = await db.query<{ original: string }>('select original from messages')
    assert.equal(visible.rows[0].original, 'Hello 🤍\nสวัสดี')
    await asUser(db, outsider)
    assert.equal((await db.query('select * from messages')).rows.length, 0)
    assert.equal((await db.query('select * from members')).rows.length, 0)
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', outsider, 'No', 'en']))
    await db.exec('reset role; set role anon;')
    await assert.rejects(db.query('select * from messages'))
  } finally { await db.close() }
})

test('members cannot impersonate, forge translations, edit history, or add a third member', async () => {
  const db = await database()
  try {
    await asUser(db, one)
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, two, 'No', 'th']))
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, one, 'No', 'th']))
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language,translation) values ($1,$2,$3,$4,$5)', [message, one, 'No', 'en', 'Forged']))
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language,thai_pronunciation_parts) values ($1,$2,$3,$4,$5)', [message, one, 'No', 'en', '[]']))
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language,thai_romanization) values ($1,$2,$3,$4,$5)', [message, one, 'No', 'en', 'forged']))
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language,alignment) values ($1,$2,$3,$4,$5)', [message, one, 'No', 'en', '[{"source":[0,1],"target":[0,1]}]']))
    await assert.rejects(db.query("update messages set original = 'Edited'"))
    await assert.rejects(db.query('delete from messages'))
    await assert.rejects(db.query("insert into members values ($1,'Intruder','en')", [outsider]))
    await db.exec('reset role')
    await assert.rejects(db.query("insert into members values ($1,'Third','th')", [outsider]))
  } finally { await db.close() }
})

test('empty/oversized text is rejected and duplicate message IDs cannot create two sends', async () => {
  const db = await database()
  try {
    await asUser(db, one)
    for (const text of ['   ', '\n\t', 'a'.repeat(2001)]) {
      await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, one, text, 'en']))
    }
    await db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, one, 'Hi', 'en'])
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, one, 'Hi', 'en']), { code: '23505' })
    assert.equal((await db.query('select * from messages')).rows.length, 1)
  } finally { await db.close() }
})

test('sending rate is limited and clients cannot call the privileged translation function', async () => {
  const db = await database()
  try {
    await asUser(db, one)
    for (let index = 0; index < 20; index++) {
      await db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [crypto.randomUUID(), one, `Hi ${index}`, 'en'])
    }
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, one, 'Too fast', 'en']), { code: 'P0001' })
    await assert.rejects(db.query('select * from claim_translation($1)', [message]))
  } finally { await db.close() }
})

test('translation leases prevent concurrent charges, allow stale retry, and cap attempts', async () => {
  const db = await database()
  try {
    await db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, one, 'Hi', 'en'])
    await db.exec('set role service_role')
    assert.equal((await db.query('select * from claim_translation($1)', [message])).rows.length, 1)
    assert.equal((await db.query('select * from claim_translation($1)', [message])).rows.length, 0)
    await db.query("update messages set translation_attempted_at = now() - interval '2 minutes', translation_status='failed' where id=$1", [message])
    assert.equal((await db.query('select * from claim_translation($1)', [message])).rows.length, 1)
    await db.query("update messages set translation_attempted_at = now() - interval '2 minutes', translation_attempts=5 where id=$1", [message])
    assert.equal((await db.query('select * from claim_translation($1)', [message])).rows.length, 0)
    await db.query("update messages set translation_attempts=0, translation_status='ready' where id=$1", [message])
    assert.equal((await db.query('select * from claim_translation($1)', [message])).rows.length, 0)
  } finally { await db.close() }
})

test('device subscriptions are private and clients cannot register arbitrary push destinations', async () => {
  const db = await database()
  try {
    await db.query('insert into push_subscriptions (endpoint,user_id,p256dh,auth) values ($1,$2,$3,$4)', ['https://web.push.apple.com/token', one, 'key', 'auth'])
    await asUser(db, two)
    assert.equal((await db.query('select * from push_subscriptions')).rows.length, 0)
    await db.query('delete from push_subscriptions')
    await assert.rejects(db.query('insert into push_subscriptions (endpoint,user_id,p256dh,auth) values ($1,$2,$3,$4)', ['https://localhost/token', two, 'key', 'auth']))
    await asUser(db, one)
    assert.equal((await db.query('select * from push_subscriptions')).rows.length, 1)
    await db.query('delete from push_subscriptions')
    assert.equal((await db.query('select * from push_subscriptions')).rows.length, 0)
  } finally { await db.close() }
})

test('only recipients can acknowledge messages; receipts are server-timed, immutable, and private', async () => {
  const db = await database()
  try {
    await asUser(db, one)
    await db.query('insert into messages (id,sender_id,original,source_language) values ($1,$2,$3,$4)', [message, one, 'Hi', 'en'])
    await assert.rejects(db.query('update messages set read_at = now() where id = $1', [message]))
    await assert.rejects(db.query('insert into messages (id,sender_id,original,source_language,delivered_at) values ($1,$2,$3,$4,now())', [crypto.randomUUID(), one, 'Forged', 'en']))
    assert.equal((await db.query('select * from acknowledge_messages($1, true)', [[message]])).rows.length, 0)
    await asUser(db, outsider)
    await assert.rejects(db.query('select * from acknowledge_messages($1, true)', [[message]]), { code: '42501' })
    await asUser(db, two)
    await assert.rejects(db.query('select * from acknowledge_messages($1, false)', [Array(101).fill(message)]), { code: '22023' })
    const delivered = await db.query<{ delivered_at: Date; read_at: Date | null }>('select * from acknowledge_messages($1, false)', [[message]])
    assert.ok(delivered.rows[0].delivered_at)
    assert.equal(delivered.rows[0].read_at, null)
    assert.equal((await db.query('select * from acknowledge_messages($1, false)', [[message]])).rows.length, 0)
    const read = await db.query<{ delivered_at: Date; read_at: Date }>('select * from acknowledge_messages($1, true)', [[message]])
    assert.equal(read.rows[0].delivered_at.toISOString(), delivered.rows[0].delivered_at.toISOString())
    assert.ok(read.rows[0].read_at >= read.rows[0].delivered_at)
    assert.equal((await db.query('select * from acknowledge_messages($1, true)', [[message]])).rows.length, 0)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select * from acknowledge_messages($1, true)', [[message]]))
  } finally { await db.close() }
})
