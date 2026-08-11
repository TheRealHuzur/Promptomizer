-- Promptomizer Bibliothek V2
-- Additive, abwaertskompatible Migration. Die bestehende Textspalte `category`
-- bleibt bis zu einer spaeteren, separat freizugebenden Cleanup-Migration erhalten.

alter table public.library
  add column category_id bigint,
  add column description text,
  add column is_favorite boolean not null default false,
  add column last_used_at timestamptz,
  add column archived_at timestamptz,
  add column prompt_type text generated always as (
    case
      when jsonb_typeof(fields) = 'object'
       and (fields ->> 'mode' = 'free' or fields ? 'text')
        then 'free'
      else 'structured'
    end
  ) stored,
  add column search_vector tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(fields::text, '')
    )
  ) stored;

alter table public.library
  add constraint library_description_length_check
    check (description is null or char_length(description) <= 1000),
  add constraint library_prompt_type_check
    check (prompt_type in ('free', 'structured'));

alter table public.prompt_categories
  add constraint prompt_categories_id_user_unique unique (id, user_id);

update public.library as library
set category_id = categories.id
from public.prompt_categories as categories
where categories.user_id = library.user_id
  and categories.name = btrim(library.category)
  and nullif(btrim(library.category), '') is not null;

alter table public.library
  add constraint library_category_owner_fkey
  foreign key (category_id, user_id)
  references public.prompt_categories (id, user_id);

create index library_category_owner_idx
  on public.library (category_id, user_id)
  where category_id is not null;

create index library_user_active_updated_idx
  on public.library (user_id, updated_at desc, id desc)
  where archived_at is null;

create index library_user_archived_updated_idx
  on public.library (user_id, updated_at desc, id desc)
  where archived_at is not null;

create index library_user_category_active_idx
  on public.library (user_id, category_id, updated_at desc, id desc)
  where archived_at is null;

create index library_user_favorite_active_idx
  on public.library (user_id, is_favorite, last_used_at desc, id desc)
  where archived_at is null;

create index library_user_prompt_type_active_idx
  on public.library (user_id, prompt_type, updated_at desc, id desc)
  where archived_at is null;

create index library_search_vector_idx
  on public.library using gin (search_vector);

create or replace function private.sync_library_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resolved_id bigint;
  resolved_name text;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'LIBRARY_OWNER_IMMUTABLE' using errcode = '42501';
  end if;

  new.category := nullif(btrim(new.category), '');

  if tg_op = 'INSERT' then
    if new.category_id is not null then
      select categories.name into resolved_name
      from public.prompt_categories as categories
      where categories.id = new.category_id
        and categories.user_id = new.user_id;

      if not found then
        raise exception 'PROMPT_CATEGORY_NOT_FOUND' using errcode = '23503';
      end if;

      new.category := resolved_name;
    elsif new.category is not null then
      select categories.id into resolved_id
      from public.prompt_categories as categories
      where categories.user_id = new.user_id
        and categories.name = new.category;

      if not found then
        raise exception 'PROMPT_CATEGORY_NOT_FOUND' using errcode = '23503';
      end if;

      new.category_id := resolved_id;
    end if;

    return new;
  end if;

  if new.category_id is distinct from old.category_id then
    if new.category_id is null then
      new.category := null;
    else
      select categories.name into resolved_name
      from public.prompt_categories as categories
      where categories.id = new.category_id
        and categories.user_id = new.user_id;

      if not found then
        raise exception 'PROMPT_CATEGORY_NOT_FOUND' using errcode = '23503';
      end if;

      new.category := resolved_name;
    end if;
  elsif new.category is distinct from old.category then
    if new.category is null then
      new.category_id := null;
    else
      select categories.id into resolved_id
      from public.prompt_categories as categories
      where categories.user_id = new.user_id
        and categories.name = new.category;

      if not found then
        raise exception 'PROMPT_CATEGORY_NOT_FOUND' using errcode = '23503';
      end if;

      new.category_id := resolved_id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_library_category() from public;

create trigger sync_library_category
before insert or update on public.library
for each row execute function private.sync_library_category();

create or replace function private.sync_library_category_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.library
    set category = new.name
    where category_id = new.id
      and user_id = new.user_id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_library_category_name() from public;

create trigger sync_library_category_name
after update of name on public.prompt_categories
for each row execute function private.sync_library_category_name();

create or replace function private.detach_library_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.library
  set category_id = null,
      category = null
  where category_id = old.id
    and user_id = old.user_id;

  return old;
end;
$$;

revoke all on function private.detach_library_category() from public;

create trigger detach_library_category
before delete on public.prompt_categories
for each row execute function private.detach_library_category();

-- `updated_at` beschreibt die letzte fachliche Aenderung. Favorisieren und
-- Verwenden aendern diesen Zeitpunkt nicht; Inhalt, Beschreibung, Kategorie
-- und Archivstatus dagegen schon. Nur Name/Inhalt erzeugen eine neue Version.
create or replace function private.prepare_library_prompt_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  force_version boolean :=
    coalesce(current_setting('promptomizer.force_version', true), 'off') = 'on';
  content_changed boolean;
  metadata_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.current_version := 1;
    new.updated_at := coalesce(new.created_at, timezone('utc'::text, now()));
    return new;
  end if;

  content_changed :=
    old.name is distinct from new.name
    or old.fields is distinct from new.fields
    or force_version;

  metadata_changed :=
    old.description is distinct from new.description
    or old.category_id is distinct from new.category_id
    or old.archived_at is distinct from new.archived_at;

  if content_changed then
    new.current_version := old.current_version + 1;
    new.updated_at := timezone('utc'::text, now());
  elsif metadata_changed then
    new.current_version := old.current_version;
    new.updated_at := timezone('utc'::text, now());
  else
    new.current_version := old.current_version;
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

create or replace function public.duplicate_library_prompt(p_prompt_id bigint)
returns setof public.library
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_prompt public.library%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select library.* into source_prompt
  from public.library
  where library.id = p_prompt_id
    and library.user_id = (select auth.uid());

  if not found then
    raise exception 'PROMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  insert into public.library (
    user_id, name, fields, category, category_id, description
  )
  values (
    source_prompt.user_id,
    source_prompt.name || ' – Kopie',
    source_prompt.fields,
    source_prompt.category,
    source_prompt.category_id,
    source_prompt.description
  )
  returning *;
end;
$$;

revoke all on function public.duplicate_library_prompt(bigint) from public, anon;
grant execute on function public.duplicate_library_prompt(bigint) to authenticated;

create or replace function public.get_library_category_counts()
returns table(category_id bigint, prompt_count bigint)
language sql
security invoker
set search_path = ''
stable
as $$
  select library.category_id, count(*)::bigint
  from public.library
  where library.user_id = (select auth.uid())
    and library.archived_at is null
  group by library.category_id;
$$;

revoke all on function public.get_library_category_counts() from public, anon;
grant execute on function public.get_library_category_counts() to authenticated;

create or replace function public.bulk_manage_library_prompts(
  p_prompt_ids bigint[],
  p_action text,
  p_category_id bigint default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows bigint := 0;
  owned_rows bigint := 0;
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

  if coalesce(array_length(p_prompt_ids, 1), 0) = 0 then
    return 0;
  end if;

  select count(*) into owned_rows
  from public.library
  where library.id = any(p_prompt_ids)
    and library.user_id = (select auth.uid());

  if owned_rows <> cardinality(p_prompt_ids) then
    raise exception 'PROMPT_SELECTION_INVALID' using errcode = '42501';
  end if;

  if p_action = 'archive' then
    update public.library
    set archived_at = timezone('utc'::text, now())
    where id = any(p_prompt_ids)
      and user_id = (select auth.uid());
  elsif p_action = 'restore' then
    update public.library
    set archived_at = null
    where id = any(p_prompt_ids)
      and user_id = (select auth.uid());
  elsif p_action = 'move' then
    if p_category_id is not null and not exists (
      select 1 from public.prompt_categories
      where prompt_categories.id = p_category_id
        and prompt_categories.user_id = (select auth.uid())
    ) then
      raise exception 'PROMPT_CATEGORY_NOT_FOUND' using errcode = '23503';
    end if;

    update public.library
    set category_id = p_category_id
    where id = any(p_prompt_ids)
      and user_id = (select auth.uid());
  elsif p_action = 'delete' then
    delete from public.library
    where id = any(p_prompt_ids)
      and user_id = (select auth.uid());
  else
    raise exception 'BULK_ACTION_INVALID' using errcode = '22023';
  end if;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.bulk_manage_library_prompts(bigint[], text, bigint) from public, anon;
grant execute on function public.bulk_manage_library_prompts(bigint[], text, bigint) to authenticated;

drop policy if exists "Users can view own library" on public.library;
drop policy if exists "Users can insert into own library" on public.library;
drop policy if exists "Users can delete own library" on public.library;
drop policy if exists library_update_own on public.library;

create policy "Users can view own library"
on public.library for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert into own library"
on public.library for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own library"
on public.library for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own library"
on public.library for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists prompt_categories_select_own on public.prompt_categories;
drop policy if exists prompt_categories_insert_own on public.prompt_categories;
drop policy if exists prompt_categories_update_own on public.prompt_categories;
drop policy if exists prompt_categories_delete_own on public.prompt_categories;

create policy prompt_categories_select_own
on public.prompt_categories for select to authenticated
using ((select auth.uid()) = user_id);

create policy prompt_categories_insert_own
on public.prompt_categories for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy prompt_categories_update_own
on public.prompt_categories for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy prompt_categories_delete_own
on public.prompt_categories for delete to authenticated
using ((select auth.uid()) = user_id);

revoke insert on table public.library from authenticated;
revoke references, trigger, truncate on table public.library from authenticated;
grant insert (
  user_id, name, fields, category, category_id, description,
  is_favorite, last_used_at, archived_at
) on table public.library to authenticated;

grant update (
  name, fields, category, category_id, description,
  is_favorite, last_used_at, archived_at
) on table public.library to authenticated;

revoke all on table public.library from anon;
