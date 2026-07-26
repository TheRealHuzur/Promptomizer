create index if not exists profiles_active_badge_owned_idx
  on public.profiles (id, active_badge_code);

create index if not exists user_badges_badge_code_idx
  on public.user_badges (badge_code);
