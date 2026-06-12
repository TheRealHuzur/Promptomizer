# send-welcome-email

Versendet die Willkommens-Mail (Brevo-Template `5`) an neu registrierte Nutzer.
Aufgerufen wird die Function von einem **Supabase Database Webhook** auf
`INSERT` in `auth.users`.

## Schutzschichten

Die Function ist über das API-Gateway zwar mit `verify_jwt = true` konfiguriert,
der öffentliche anon-Key ist aber selbst ein gültiges JWT — das allein schützt
nicht vor Missbrauch. Deshalb prüft die Function zusätzlich:

1. **Shared Secret** — Header `x-welcome-secret` muss dem Secret
   `WELCOME_EMAIL_SECRET` entsprechen (timing-sicherer Vergleich). Nur der
   Database-Webhook kennt dieses Secret.
2. **User-Existenz** — `record.id` muss ein realer Auth-User sein und
   `record.email` muss zu diesem User gehören. Beliebige Fremdadressen können
   damit nicht angeschrieben werden.
3. **Einmal-Versand** — pro Account wird höchstens eine Willkommens-Mail
   versendet (`profiles.welcome_email_sent_at`). Das wirkt gleichzeitig als
   Rate Limit und Replay-Schutz.

Abgelehnte Aufrufe und Fehler werden per `console.error` geloggt und sind in
den Supabase Edge-Function-Logs sichtbar (Dashboard → Edge Functions →
send-welcome-email → Logs).

## Benötigte Secrets

| Secret | Zweck |
| --- | --- |
| `brevo_api_key` | API-Key für Brevo (transaktionale Mails) |
| `WELCOME_EMAIL_SECRET` | Shared Secret zwischen Database-Webhook und Function |

Secret erzeugen und setzen:

```sh
# starkes Secret erzeugen (oder beliebigen Passwort-Generator verwenden)
openssl rand -hex 32

supabase secrets set WELCOME_EMAIL_SECRET=<erzeugtes-secret>
```

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` werden von Supabase automatisch
bereitgestellt.

## Webhook-Konfiguration

Im Dashboard unter **Database → Webhooks** (bzw. beim bestehenden Webhook für
`auth.users INSERT`) müssen zwei HTTP-Header gesetzt sein:

| Header | Wert |
| --- | --- |
| `Authorization` | `Bearer <anon-key>` (für das Gateway, `verify_jwt`) |
| `x-welcome-secret` | Wert von `WELCOME_EMAIL_SECRET` |

Ohne den `x-welcome-secret`-Header beantwortet die Function jeden Aufruf mit
`401 Unauthorized` — nach dem Deployment also zwingend den Webhook anpassen,
sonst gehen keine Willkommens-Mails mehr raus.

## Deployment

```sh
# 1. Migration anwenden (Spalte profiles.welcome_email_sent_at)
supabase db push

# 2. Secret setzen (einmalig, siehe oben)
supabase secrets set WELCOME_EMAIL_SECRET=<erzeugtes-secret>

# 3. Function deployen
supabase functions deploy send-welcome-email

# 4. Webhook-Header x-welcome-secret im Dashboard ergänzen
```

## Testen

```sh
# Ohne Secret → 401
curl -i -X POST "https://<projekt>.supabase.co/functions/v1/send-welcome-email" \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"record":{"id":"00000000-0000-0000-0000-000000000000","email":"test@example.com"}}'

# Mit Secret, aber unbekanntem User → 403
curl -i -X POST "https://<projekt>.supabase.co/functions/v1/send-welcome-email" \
  -H "Authorization: Bearer <anon-key>" \
  -H "x-welcome-secret: <secret>" \
  -H "Content-Type: application/json" \
  -d '{"record":{"id":"00000000-0000-0000-0000-000000000000","email":"test@example.com"}}'

# Echter End-to-End-Test: neuen Account registrieren und prüfen, dass genau
# eine Willkommens-Mail ankommt und profiles.welcome_email_sent_at gesetzt ist.
```
