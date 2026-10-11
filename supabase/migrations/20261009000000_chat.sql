-- Exactly one member per language keeps this conversation private to two people.
create table public.members (
  id uuid primary key references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 40),
  language text not null unique check (language in ('en', 'th'))
);

create table public.messages (
  id uuid primary key,
  sender_id uuid not null references public.members(id) on delete restrict,
  original text not null check (char_length(btrim(original)) between 1 and 2000),
  source_language text not null check (source_language in ('en', 'th')),
  translation text,
  translation_status text not null default 'pending' check (translation_status in ('pending', 'processing', 'ready', 'failed')),
  translation_attempted_at timestamptz,
  translation_attempts integer not null default 0,
  notification_claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_history_idx on public.messages (created_at desc, id desc);
create index messages_sender_time_idx on public.messages (sender_id, created_at desc);

create table public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 2048),
  user_id uuid not null references public.members(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;

create function public.is_chat_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.members where id = (select auth.uid())) $$;
revoke all on function public.is_chat_member() from public;
grant execute on function public.is_chat_member() to authenticated;

create policy "Members can see the pair" on public.members for select to authenticated
using ((select public.is_chat_member()));
create policy "Members can read messages" on public.messages for select to authenticated
using ((select public.is_chat_member()));
create policy "Members can send as themselves" on public.messages for insert to authenticated
with check (sender_id = (select auth.uid()) and (select public.is_chat_member())
  and source_language = (select language from public.members where id = (select auth.uid())));
create policy "Read own device subscriptions" on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()) and (select public.is_chat_member()));
create policy "Remove own device subscriptions" on public.push_subscriptions for delete to authenticated
using (user_id = (select auth.uid()) and (select public.is_chat_member()));

revoke all on public.members, public.messages, public.push_subscriptions from anon, authenticated;
grant select on public.members to authenticated;
grant select on public.messages to authenticated;
-- Clients cannot set timestamps, translation results, attempts, or notification state.
grant insert (id, sender_id, original, source_language) on public.messages to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.members, public.messages, public.push_subscriptions to service_role;

create function public.limit_message_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize sends per person so concurrent requests cannot bypass the limit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.sender_id::text, 0));
  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending very quickly. Please try again in a minute.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_message_rate() from public;
create trigger limit_message_rate before insert on public.messages
for each row execute function public.limit_message_rate();

-- Only the server can acquire a translation lease; stale leases can be retried.
create function public.claim_translation(message_id uuid) returns setof public.messages
language sql security definer set search_path = '' as $$
  update public.messages
  set translation_status = 'processing', translation_attempted_at = now(), translation_attempts = translation_attempts + 1
  where id = message_id and translation_status <> 'ready' and translation_attempts < 5
    and (translation_attempted_at is null or translation_attempted_at < now() - interval '1 minute')
  returning *;
$$;
revoke all on function public.claim_translation(uuid) from public, anon, authenticated;
grant execute on function public.claim_translation(uuid) to service_role;

alter publication supabase_realtime add table public.messages;
