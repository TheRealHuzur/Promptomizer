-- RLS- und Datenzugriffs-Haertung (Go-Live-Roadmap Punkt 7, Audit vom 12.06.2026)

-- 1) Kritisch: Clients konnten ueber PostgREST beliebige eigene profiles-Spalten
--    updaten, inkl. tier (Self-Upgrade auf Pro ohne Zahlung) und stripe_customer_id
--    (Portal-Session fuer fremde Stripe-Kunden, Umleitung von Webhook-Updates).
--    Clientseitig schreibbar bleibt nur onboarding_completed; alle Billing-Felder
--    schreiben ausschliesslich die Edge Functions per service_role.
revoke update on table public.profiles from anon, authenticated;
grant update (onboarding_completed) on table public.profiles to authenticated;

-- 2) Defense in depth: Gaeste (anon) arbeiten rein in sessionStorage und brauchen
--    keinerlei Tabellenzugriff. RLS blockt sie bereits (auth.uid() ist null),
--    aber ohne Grants faellt auch jede kuenftige Policy-Luecke nicht auf anon zurueck.
revoke all on table public.profiles from anon;
revoke all on table public.library from anon;
revoke all on table public.prompt_history from anon;
revoke all on table public.snippets from anon;
revoke all on table public.prompt_categories from anon;

-- 3) tier gegen unerwartete Werte absichern (aktuell nur 'free' und 'pro' in Benutzung)
alter table public.profiles
  add constraint profiles_tier_check check (tier in ('free', 'pro'));

-- 4) Free-Limit-Trigger haerten:
--    - search_path fixieren (SECURITY DEFINER ohne search_path ist angreifbar)
--    - Advisory Lock pro User schliesst die Race-Condition, durch die parallele
--      Inserts (mehrere Tabs / doppelte Requests) das Limit ueberschreiten konnten
create or replace function public.check_free_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_tier text;
    prompt_count int;
begin
    perform pg_advisory_xact_lock(hashtextextended('library_free_limit:' || new.user_id::text, 0));

    select tier into user_tier from profiles where id = new.user_id;

    if user_tier = 'free' or user_tier is null then
        select count(*) into prompt_count
        from library
        where user_id = new.user_id;

        if prompt_count >= 10 then
            raise exception 'FREE_LIMIT_REACHED';
        end if;
    end if;

    return new;
end;
$$;

-- 5) user_id darf nie null sein; RLS erzwingt das implizit, NOT NULL macht es explizit
alter table public.library alter column user_id set not null;
alter table public.prompt_history alter column user_id set not null;

-- 6) Doppelte Kategorien pro Nutzer verhindern (doppelte Requests / parallele Tabs);
--    Rename und Delete mappen library.category ueber den Namen, Duplikate waeren inkonsistent
create unique index if not exists prompt_categories_user_name_key
  on public.prompt_categories (user_id, name);
