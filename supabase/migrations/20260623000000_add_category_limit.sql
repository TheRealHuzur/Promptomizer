-- Kategorien-Limit fuer Free-User (max. 5 Kategorien)
-- Analog zu check_free_plan_limit auf library; Advisory Lock schliesst
-- Race-Condition bei parallelen Tabs / Doppel-Requests aus.

create or replace function public.check_category_free_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_tier text;
    category_count int;
begin
    perform pg_advisory_xact_lock(hashtextextended('category_free_limit:' || new.user_id::text, 0));

    select tier into user_tier from profiles where id = new.user_id;

    if user_tier = 'free' or user_tier is null then
        select count(*) into category_count
        from prompt_categories
        where user_id = new.user_id;

        if category_count >= 5 then
            raise exception 'CATEGORY_LIMIT_REACHED';
        end if;
    end if;

    return new;
end;
$$;

create trigger enforce_category_free_limit
before insert on public.prompt_categories
for each row execute function public.check_category_free_limit();
