-- Triggerfunktionen duerfen nicht als Data-API-RPC aufrufbar sein.
-- Die Triggerausfuehrung selbst benoetigt kein EXECUTE-Recht fuer Endnutzer.
revoke all on function public.check_free_plan_limit() from public, anon, authenticated;
revoke all on function public.check_category_free_limit() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
