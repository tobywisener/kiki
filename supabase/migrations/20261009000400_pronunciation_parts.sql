alter table public.messages add column thai_pronunciation_parts jsonb not null default '[]'::jsonb
check (jsonb_typeof(thai_pronunciation_parts) = 'array');
