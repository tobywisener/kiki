alter table public.messages add constraint messages_nonblank
check (original ~ '[^[:space:]]');
