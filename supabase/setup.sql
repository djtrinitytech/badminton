-- Run the COMPLETE script in Supabase > SQL Editor as postgres.
-- Rerunning preserves existing tournament data.
begin;
create table if not exists public.vyuha_state (
 id integer primary key, data jsonb not null,
 storage_version bigint not null default 0
);
alter table public.vyuha_state add column if not exists storage_version bigint not null default 0;
create table if not exists public.vyuha_auth_attempts (
 key text primary key, attempts integer not null, reset_at bigint not null
);
-- This is the ONLY table readable by public clients. No scores, audit or lock owners.
create table if not exists public.vyuha_updates (
 id integer primary key check (id = 1), revision bigint not null default 0,
 changed_at timestamptz not null default now()
);
insert into public.vyuha_updates (id) values (1) on conflict do nothing;
alter table public.vyuha_state enable row level security;
alter table public.vyuha_auth_attempts enable row level security;
alter table public.vyuha_updates enable row level security;
revoke all on public.vyuha_state, public.vyuha_auth_attempts, public.vyuha_updates from public, anon, authenticated;
grant all on public.vyuha_state, public.vyuha_auth_attempts, public.vyuha_updates to service_role;
grant select on public.vyuha_updates to anon, authenticated;
drop policy if exists "Public can read tournament revisions" on public.vyuha_updates;
create policy "Public can read tournament revisions" on public.vyuha_updates for select to anon, authenticated using (true);

create or replace function public.vyuha_initialize(p_seed jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
 insert into public.vyuha_state (id, data) values (1, p_seed) on conflict do nothing;
 select jsonb_build_object('data', s.data, 'storage_version', s.storage_version)
 into result from public.vyuha_state s where s.id = 1;
 return result;
end;
$$;

-- Atomic compare-and-swap also protects heartbeat writes, which do not change scores.
-- Competing writers re-read and re-validate before retrying. The revision update
-- commits in the same transaction, so Realtime never announces an unsaved score.
create or replace function public.vyuha_commit(p_expected_version bigint, p_next jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 update public.vyuha_state set data = p_next, storage_version = storage_version + 1
 where id = 1 and storage_version = p_expected_version;
 if not found then return false; end if;
 update public.vyuha_updates set revision = (p_next->>'revision')::bigint, changed_at = clock_timestamp()
 where id = 1 and revision is distinct from (p_next->>'revision')::bigint;
 return true;
end;
$$;

create or replace function public.vyuha_login_attempt(p_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
 current_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
 total integer;
begin
 insert into public.vyuha_auth_attempts (key, attempts, reset_at)
 values (p_key, 1, current_ms + 900000)
 on conflict (key) do update set
 attempts = case when public.vyuha_auth_attempts.reset_at < current_ms then 1 else public.vyuha_auth_attempts.attempts + 1 end,
 reset_at = case when public.vyuha_auth_attempts.reset_at < current_ms then current_ms + 900000 else public.vyuha_auth_attempts.reset_at end
 returning attempts into total;
 return total <= 10;
end;
$$;

-- Only the server secret/service_role key may execute mutation and seed RPCs.
revoke all on function public.vyuha_initialize(jsonb) from public, anon, authenticated;
revoke all on function public.vyuha_commit(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.vyuha_login_attempt(text) from public, anon, authenticated;
grant execute on function public.vyuha_initialize(jsonb) to service_role;
grant execute on function public.vyuha_commit(bigint, jsonb) to service_role;
grant execute on function public.vyuha_login_attempt(text) to service_role;

do $$
begin
 if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
  create publication supabase_realtime;
 end if;
 if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vyuha_updates') then
  alter publication supabase_realtime add table public.vyuha_updates;
 end if;
 if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vyuha_state') then
  alter publication supabase_realtime drop table public.vyuha_state;
 end if;
 if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vyuha_auth_attempts') then
  alter publication supabase_realtime drop table public.vyuha_auth_attempts;
 end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
