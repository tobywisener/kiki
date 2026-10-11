import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

process.loadEnvFile('.env')
const ref = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST || `db.${ref}.supabase.co`,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER || 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: true, ca: readFileSync(process.env.SUPABASE_DB_CA_PATH || 'supabase/root-ca.crt', 'utf8') },
  connectionTimeoutMillis: 10_000,
})

try {
  await client.connect()
  const action = process.argv[2]
  if (action === 'migrate') {
    await client.query('begin')
    await client.query('create schema if not exists kiki_private')
    await client.query('create table if not exists kiki_private.migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())')
    for (const name of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) {
      const sql = readFileSync(`supabase/migrations/${name}`, 'utf8')
      const hash = createHash('sha256').update(sql).digest('hex')
      const { rows } = await client.query('select sha256 from kiki_private.migrations where name=$1', [name])
      if (rows.length) {
        if (rows[0].sha256 !== hash) throw new Error(`Applied migration changed: ${name}. Create a new migration instead.`)
        continue
      }
      await client.query(sql)
      await client.query('insert into kiki_private.migrations (name,sha256) values ($1,$2)', [name, hash])
      console.log(`Applied ${name}`)
    }
    await client.query('commit')
    console.log('Database is up to date.')
  } else if (action === 'members') {
    const english = process.env.KIKI_EN_EMAIL
    const thai = process.env.KIKI_TH_EMAIL
    if (!english || !thai || english.toLowerCase() === thai.toLowerCase()) throw new Error('Set distinct KIKI_EN_EMAIL and KIKI_TH_EMAIL values in .env first.')
    await client.query('begin')
    for (const [email, name, language] of [[english, process.env.KIKI_EN_NAME || 'You', 'en'], [thai, process.env.KIKI_TH_NAME || 'คนพิเศษ', 'th']]) {
      const { rows } = await client.query('select id from auth.users where lower(email)=lower($1)', [email])
      if (rows.length !== 1) throw new Error(`Create the ${language} account in Supabase Authentication first.`)
      await client.query('insert into public.members (id,name,language) values ($1,$2,$3) on conflict (id) do update set name=excluded.name,language=excluded.language', [rows[0].id, name, language])
    }
    await client.query('commit')
    console.log('Both chat members are configured.')
  } else if (action === 'webhook') {
    const secret = process.env.MESSAGE_WEBHOOK_SECRET
    if (!secret || secret.length < 32) throw new Error('Set MESSAGE_WEBHOOK_SECRET to a random secret of at least 32 characters.')
    if (!/^[a-z]{20}$/.test(ref)) throw new Error('Unexpected project reference.')
    await client.query('begin')
    await client.query('create extension if not exists pg_net with schema extensions')
    const { rows } = await client.query("select id from vault.secrets where name='kiki_webhook_secret'")
    if (rows.length) await client.query('select vault.update_secret($1,$2)', [rows[0].id, secret])
    else await client.query("select vault.create_secret($1,'kiki_webhook_secret','Kiki message webhook authentication')", [secret])
    const endpoint = `https://${ref}.supabase.co/functions/v1/process-message`
    await client.query(`
      create schema if not exists kiki_private;
      create or replace function kiki_private.process_message_insert() returns trigger
      language plpgsql security definer set search_path = '' as $$
      declare webhook_secret text;
      begin
        select decrypted_secret into webhook_secret from vault.decrypted_secrets where name='kiki_webhook_secret';
        perform net.http_post(
          url := '${endpoint}',
          headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret',webhook_secret),
          body := jsonb_build_object('type','INSERT','schema','public','table','messages','record',jsonb_build_object('id',new.id)),
          timeout_milliseconds := 30000
        );
        return new;
      end;
      $$;
      revoke all on function kiki_private.process_message_insert() from public;
      drop trigger if exists process_message_insert on public.messages;
      create trigger process_message_insert after insert on public.messages
        for each row execute function kiki_private.process_message_insert();
    `)
    await client.query('commit')
    console.log('Message webhook configured. Its secret is stored in Supabase Vault.')
  } else throw new Error('Use migrate, members, or webhook.')
} catch (error) {
  await client.query('rollback').catch(() => {})
  // Do not print connection objects, credentials, or a PostgreSQL URI on failure.
  console.error('Database operation failed:', error.code || error.message)
  process.exitCode = 1
} finally { await client.end() }
