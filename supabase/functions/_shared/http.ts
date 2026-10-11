import { createClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Missing server configuration')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export async function getMember(req: Request, client: ReturnType<typeof adminClient>) {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return null
  const { data: { user }, error } = await client.auth.getUser(token)
  if (error || !user) return null
  const { data: member, error: memberError } = await client.from('members').select('id,name,language').eq('id', user.id).maybeSingle()
  if (memberError) throw memberError
  return member
}
