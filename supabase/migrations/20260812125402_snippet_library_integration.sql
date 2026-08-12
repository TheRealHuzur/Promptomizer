-- Promptomizer Bibliothek Phase 7: Bausteine-Integration
-- Additive Migration. Prompts (`library`) und Bausteine (`snippets`) bleiben
-- getrennte Datenmodelle; lediglich das Free-Limit wird gemeinsam geprueft.

alter table public.snippets
  add column updated_at timestamptz,
  add column is_favorite boolean not null default false,
  add column last_used_at timestamptz,
  add column archived_at timestamptz,
  add column search_vector tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(name, '') || ' ' || coalesce(content, '')
    )
  ) stored;

update public.snippets
set mode = case
      when field_id in ('role', 'context', 'task', 'format') then 'structured'
      else 'free'
    end,
    field_id = case
      when field_id in ('role', 'context', 'task', 'format') then field_id
      else 'free'
    end,
    updated_at = coalesce(created_at, timezone('utc'::text, now()));

alter table public.snippets
  alter column user_id set not null,
  alter column name set not null,
  alter column content set not null,
  alter column mode set not null,
  alter column field_id set not null,
  alter column updated_at set not null,
  alter column updated_at set default timezone('utc'::text, now()),
  add constraint snippets_mode_check
    check (mode in ('structured', 'free')),
  add constraint snippets_field_id_check
    check (field_id in ('role', 'context', 'task', 'format', 'free')),
  add constraint snippets_mode_field_check
    check (
      (mode = 'structured' and field_id in ('role', 'context', 'task', 'format'))
      or (mode = 'free' and field_id = 'free')
    ),
  add constraint snippets_name_required_check
    check (char_length(btrim(name)) between 1 and 200),
  add constraint snippets_content_required_check
    check (char_length(btrim(content)) between 1 and 50000);

create index snippets_user_id_idx
  on public.snippets (user_id);

create index snippets_user_active_updated_idx
  on public.snippets (user_id, updated_at desc, id desc)
  where archived_at is null;

create index snippets_user_archived_updated_idx
  on public.snippets (user_id, updated_at desc, id desc)
  where archived_at is not null;

create index snippets_user_field_active_idx
  on public.snippets (user_id, field_id, updated_at desc, id desc)
  where archived_at is null;

create index snippets_user_favorite_active_idx
  on public.snippets (user_id, is_favorite, last_used_at desc, id desc)
  where archived_at is null;

create index snippets_search_vector_idx
  on public.snippets using gin (search_vector);

create or replace function private.prepare_snippet_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, new.created_at, timezone('utc'::text, now()));
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'SNIPPET_OWNER_IMMUTABLE' using errcode = '42501';
  end if;

  if old.name is distinct from new.name
     or old.content is distinct from new.content
     or old.mode is distinct from new.mode
     or old.field_id is distinct from new.field_id
     or old.archived_at is distinct from new.archived_at then
    new.updated_at := timezone('utc'::text, now());
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_snippet_metadata() from public, anon, authenticated;

create trigger prepare_snippet_metadata
before insert or update on public.snippets
for each row execute function private.prepare_snippet_metadata();

-- Dasselbe Advisory Lock und dieselbe Zaehllogik gelten fuer Inserts in beide
-- Tabellen. Archivierte Datensaetze werden absichtlich mitgezaehlt.
create or replace function public.check_free_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_tier text;
  content_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('library_free_limit:' || new.user_id::text, 0)
  );

  select profiles.tier into user_tier
  from public.profiles
  where profiles.id = new.user_id;

  if user_tier = 'free' or user_tier is null then
    select
      (select count(*) from public.library where library.user_id = new.user_id)
      +
      (select count(*) from public.snippets where snippets.user_id = new.user_id)
    into content_count;

    if content_count >= 10 then
      raise exception 'FREE_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.check_free_plan_limit() from public, anon, authenticated;

drop trigger if exists enforce_snippet_free_limit on public.snippets;
create trigger enforce_snippet_free_limit
before insert on public.snippets
for each row execute function public.check_free_plan_limit();

create or replace function public.duplicate_snippet(p_snippet_id bigint)
returns setof public.snippets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_snippet public.snippets%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select snippets.* into source_snippet
  from public.snippets
  where snippets.id = p_snippet_id
    and snippets.user_id = (select auth.uid());

  if not found then
    raise exception 'SNIPPET_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  insert into public.snippets (user_id, name, content, mode, field_id)
  values (
    source_snippet.user_id,
    source_snippet.name || ' – Kopie',
    source_snippet.content,
    source_snippet.mode,
    source_snippet.field_id
  )
  returning *;
end;
$$;

revoke all on function public.duplicate_snippet(bigint) from public, anon;
grant execute on function public.duplicate_snippet(bigint) to authenticated;

create or replace function public.get_snippet_counts()
returns table(field_id text, snippet_count bigint)
language sql
security invoker
set search_path = ''
stable
as $$
  select snippets.field_id, count(*)::bigint
  from public.snippets
  where snippets.user_id = (select auth.uid())
    and snippets.archived_at is null
  group by snippets.field_id;
$$;

revoke all on function public.get_snippet_counts() from public, anon;
grant execute on function public.get_snippet_counts() to authenticated;

create or replace function public.bulk_manage_snippets(
  p_snippet_ids bigint[],
  p_action text,
  p_field_id text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows bigint := 0;
  owned_rows bigint := 0;
  target_mode text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.tier = 'pro'
  ) then
    raise exception 'PRO_REQUIRED' using errcode = '42501';
  end if;

  if coalesce(array_length(p_snippet_ids, 1), 0) = 0 then
    return 0;
  end if;

  if cardinality(p_snippet_ids) <> cardinality(array(select distinct unnest(p_snippet_ids))) then
    raise exception 'SNIPPET_SELECTION_INVALID' using errcode = '22023';
  end if;

  select count(*) into owned_rows
  from public.snippets
  where snippets.id = any(p_snippet_ids)
    and snippets.user_id = (select auth.uid());

  if owned_rows <> cardinality(p_snippet_ids) then
    raise exception 'SNIPPET_SELECTION_INVALID' using errcode = '42501';
  end if;

  if p_action = 'archive' then
    update public.snippets
    set archived_at = timezone('utc'::text, now())
    where id = any(p_snippet_ids) and user_id = (select auth.uid());
  elsif p_action = 'restore' then
    update public.snippets
    set archived_at = null
    where id = any(p_snippet_ids) and user_id = (select auth.uid());
  elsif p_action = 'move' then
    if p_field_id not in ('role', 'context', 'task', 'format', 'free') then
      raise exception 'SNIPPET_FIELD_INVALID' using errcode = '22023';
    end if;
    target_mode := case when p_field_id = 'free' then 'free' else 'structured' end;
    update public.snippets
    set field_id = p_field_id, mode = target_mode
    where id = any(p_snippet_ids) and user_id = (select auth.uid());
  elsif p_action = 'delete' then
    delete from public.snippets
    where id = any(p_snippet_ids) and user_id = (select auth.uid());
  else
    raise exception 'BULK_ACTION_INVALID' using errcode = '22023';
  end if;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.bulk_manage_snippets(bigint[], text, text) from public, anon;
grant execute on function public.bulk_manage_snippets(bigint[], text, text) to authenticated;

drop policy if exists "Users can view own snippets" on public.snippets;
drop policy if exists "Users can insert own snippets" on public.snippets;
drop policy if exists "Users can update own snippets" on public.snippets;
drop policy if exists "Users can delete own snippets" on public.snippets;
drop policy if exists snippets_select_own on public.snippets;
drop policy if exists snippets_insert_own on public.snippets;
drop policy if exists snippets_update_own on public.snippets;
drop policy if exists snippets_delete_own on public.snippets;

create policy snippets_select_own
on public.snippets for select to authenticated
using ((select auth.uid()) = user_id);

create policy snippets_insert_own
on public.snippets for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy snippets_update_own
on public.snippets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy snippets_delete_own
on public.snippets for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.snippets from anon;
revoke all on table public.snippets from authenticated;
grant select, delete on table public.snippets to authenticated;
grant insert (user_id, name, content, mode, field_id)
  on table public.snippets to authenticated;
grant update (
  name, content, mode, field_id, is_favorite, last_used_at, archived_at
) on table public.snippets to authenticated;
grant usage, select on sequence public.snippets_id_seq to authenticated;
