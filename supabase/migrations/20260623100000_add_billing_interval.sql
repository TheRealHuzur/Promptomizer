-- Abrechnungsintervall (month/year) in profiles speichern.
-- Wird von stripe-webhook und sync-stripe-subscription gesetzt (service_role).
-- Das Frontend liest den Wert nur, schreibt ihn nie selbst.

alter table profiles
  add column if not exists billing_interval text
  check (billing_interval in ('month', 'year'));
