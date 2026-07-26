-- Profilpraeferenzen und serverseitig vergebene Badges.
-- Billing-Felder in profiles bleiben weiterhin ausschliesslich fuer service_role schreibbar.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists default_editor_mode text not null default 'structured';

alter table public.profiles
  add constraint profiles_display_name_check
    check (
      display_name is null
      or (
        display_name = btrim(display_name)
        and char_length(display_name) between 1 and 40
      )
    ),
  add constraint profiles_default_editor_mode_check
    check (default_editor_mode in ('structured', 'free'));

create table public.badges (
  code text primary key,
  name text not null,
  description text not null,
  icon_path text not null,
  unlock_hint text not null,
  is_secret boolean not null default false,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint badges_code_check check (code ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  constraint badges_name_check check (char_length(btrim(name)) between 1 and 60),
  constraint badges_description_check check (char_length(btrim(description)) between 1 and 240),
  constraint badges_icon_path_check check (icon_path ~ '^assets/badges/[a-z0-9_-]+[.]svg$'),
  constraint badges_unlock_hint_check check (char_length(btrim(unlock_hint)) between 1 and 160)
);

create table public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_code text not null references public.badges(code) on update cascade on delete restrict,
  awarded_at timestamptz not null default timezone('utc', now()),
  award_reason text,
  primary key (user_id, badge_code),
  constraint user_badges_award_reason_check
    check (award_reason is null or char_length(award_reason) <= 120)
);

alter table public.profiles
  add column if not exists active_badge_code text;

alter table public.profiles
  add constraint profiles_active_badge_owned_fkey
  foreign key (id, active_badge_code)
  references public.user_badges(user_id, badge_code)
  on update cascade;

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

create policy "Authenticated users can view available badges"
on public.badges
for select
to authenticated
using (
  is_enabled
  and (
    not is_secret
    or exists (
      select 1
      from public.user_badges
      where user_badges.user_id = (select auth.uid())
        and user_badges.badge_code = badges.code
    )
  )
);

create policy "Users can view own badge awards"
on public.user_badges
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.badges from anon, authenticated;
revoke all on table public.user_badges from anon, authenticated;
grant select on table public.badges to authenticated;
grant select on table public.user_badges to authenticated;

-- profiles bleibt auf explizit freigegebene, harmlose Client-Spalten begrenzt.
revoke update on table public.profiles from anon, authenticated;
grant update (
  onboarding_completed,
  display_name,
  default_editor_mode,
  active_badge_code
) on table public.profiles to authenticated;

insert into public.badges (
  code,
  name,
  description,
  icon_path,
  unlock_hint,
  is_secret,
  sort_order
)
values (
  'founder',
  'Founder',
  'Von Anfang an dabei und Promptomizer früh unterstützt.',
  'assets/badges/founder.svg',
  'Schließe während des Einführungspreises ein Pro-Abo ab.',
  false,
  10
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  icon_path = excluded.icon_path,
  unlock_hint = excluded.unlock_hint,
  is_secret = excluded.is_secret,
  is_enabled = true,
  sort_order = excluded.sort_order;

-- Bereits aktive frühe Pro-Konten erhalten den Founder-Badge ebenfalls dauerhaft.
insert into public.user_badges (user_id, badge_code, award_reason)
select
  profiles.id,
  'founder',
  'intro_price_existing_pro'
from public.profiles
where profiles.subscription_status in ('active', 'trialing', 'past_due')
  and coalesce(profiles.billing_updated_at, profiles.plan_since, profiles.created_at)
      < timestamptz '2026-11-01 00:00:00+00'
on conflict (user_id, badge_code) do nothing;

update public.profiles
set active_badge_code = 'founder'
where active_badge_code is null
  and exists (
    select 1
    from public.user_badges
    where user_badges.user_id = profiles.id
      and user_badges.badge_code = 'founder'
  );
