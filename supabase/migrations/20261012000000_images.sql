alter table public.messages add column image_url text;
alter table public.messages alter column original set default '';
alter table public.messages drop constraint messages_original_check;
alter table public.messages drop constraint messages_nonblank;
alter table public.messages add constraint messages_content_check check (
  char_length(original) <= 2000 and (original ~ '[^[:space:]]' or image_url is not null)
);
alter table public.messages add constraint messages_image_url_check check (
  image_url is null or (char_length(image_url) <= 2048 and image_url ~ '^https://i\.ibb\.co/[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp|gif)$')
);
grant insert (image_url) on public.messages to authenticated;

create function public.prepare_image_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.image_url is not null and new.original !~ '[^[:space:]]' then
    new.translation_status := 'ready';
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_image_message() from public;
create trigger prepare_image_message before insert on public.messages
for each row execute function public.prepare_image_message();

-- Images without captions must never acquire a translation lease.
create or replace function public.claim_translation(message_id uuid) returns setof public.messages
language sql security definer set search_path = '' as $$
  update public.messages
  set translation_status = 'processing', translation_attempted_at = now(), translation_attempts = translation_attempts + 1
  where id = message_id and original ~ '[^[:space:]]' and translation_status <> 'ready' and translation_attempts < 5
    and (translation_attempted_at is null or translation_attempted_at < now() - interval '1 minute')
  returning *;
$$;
