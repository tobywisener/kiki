alter table public.messages add column delivered_at timestamptz;
alter table public.messages add column read_at timestamptz;
alter table public.messages add constraint read_requires_delivery
check (read_at is null or (delivered_at is not null and read_at >= delivered_at));

-- Only the recipient can acknowledge messages, using server timestamps.
create function public.acknowledge_messages(message_ids uuid[], mark_read boolean default false)
returns setof public.messages
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_chat_member() then
    raise exception 'Chat membership required' using errcode = '42501';
  end if;
  if message_ids is null or cardinality(message_ids) > 100 or mark_read is null then
    raise exception 'Provide at most 100 message IDs and a receipt type' using errcode = '22023';
  end if;
  return query
    update public.messages
    set delivered_at = coalesce(delivered_at, now()),
        read_at = case when mark_read then coalesce(read_at, greatest(delivered_at, now())) else read_at end
    where id = any(message_ids) and sender_id <> (select auth.uid())
      and (delivered_at is null or (mark_read and read_at is null))
    returning *;
end;
$$;
revoke all on function public.acknowledge_messages(uuid[], boolean) from public, anon;
grant execute on function public.acknowledge_messages(uuid[], boolean) to authenticated;
