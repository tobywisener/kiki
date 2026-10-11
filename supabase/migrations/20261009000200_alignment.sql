alter table public.messages add column alignment jsonb not null default '[]'::jsonb
check (jsonb_typeof(alignment) = 'array');
