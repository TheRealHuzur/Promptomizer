# CLAUDE.md — Entwicklungskontext Promptomizer

Diese Datei wird beim Sessionstart automatisch als Kontext geladen. Sie soll einer KI (oder einem neuen Entwickler) beim **Chat-/Kontextwechsel** sofort das nötige Hintergrundwissen geben: Architektur, Konventionen, Fallstricke und der Stand der Go-Live-Arbeiten.

> **Pflege:** Wenn du etwas Nicht-Offensichtliches änderst (neue Tabelle, neue Edge Function, geänderte Konvention, neuer Workflow), aktualisiere diese Datei. Detaillierte To-dos und der Launch-Fortschritt stehen in [`Promptomizer Go-Live Roadmap.md`](Promptomizer%20Go-Live%20Roadmap.md) — die ist die „lebende" Aufgabenliste, diese Datei ist das „wie ist es gebaut".

---

## 1. Was ist Promptomizer?

Ein Web-Tool, mit dem Nutzer strukturierte KI-Prompts bauen, in einer persönlichen **Bibliothek** speichern, in **Kategorien** organisieren und aus **Bausteinen** (Snippets) zusammensetzen. Free-Plan mit Limit, Pro-Plan per Stripe. Deutschsprachig.

- **Produktiv-Domain:** https://www.promptomizer.de (Hauptdomain), `promptomizer.de` → 307-Redirect, `promptomizer.vercel.app` (Vercel-Default).
- **Hosting:** Vercel (statisches Hosting). Kein Build-Step — die Dateien werden direkt ausgeliefert.

---

## 2. Tech-Stack & Architektur

- **Frontend:** Eine einzige große Datei [`index.html`](index.html) (~270 KB) mit eingebettetem `<style>` und `<script>`. **Kein Framework, kein Bundler, kein Build.** Tailwind kommt per CDN (`cdn.tailwindcss.com`), Font Awesome + Inter ebenfalls per CDN.
- **Datenzugriff/Auth:** [`db.js`](db.js) kapselt den Supabase-Client und stellt `window.db.*` sowie Auth-Funktionen (`loginUser`, `registerUser`, `handleLogout`, `requestPasswordReset`, `updateUserPassword`, `loginWithGoogle`) bereit.
- **Backend:** Supabase (Postgres + Auth + Edge Functions). Billing über Stripe (aktuell **Sandbox/Test-Modus**, siehe §6).
- **Consent:** Cookiebot (läuft nur auf den autorisierten Domains, **nicht** auf localhost — die „domain not authorized"-Warnungen lokal sind erwartbar).
- **PWA:** [`manifest.json`](manifest.json) + [`sw.js`](sw.js) (Service Worker ist aktuell ein **Kill-Switch**, siehe §8).

### Datenfluss
- **Eingeloggt:** Daten liegen in Supabase (Cloud), Zugriff strikt per RLS auf den eigenen Nutzer beschränkt.
- **Gast (nicht eingeloggt):** History wird in `sessionStorage` gehalten; Bibliothek/Snippets gibt es nur eingeloggt. `window.currentUser` ist die zentrale Quelle des Login-Status (gesetzt durch den `onAuthStateChange`-Listener in `db.js`).

---

## 3. Dateienübersicht

| Datei | Zweck |
|---|---|
| `index.html` | Gesamte App: Markup, Styles, gesamte UI-Logik |
| `db.js` | Supabase-Client, Auth, `window.db`-API |
| `sw.js` | Service Worker — **Kill-Switch** (räumt alte Caches/Registrierungen ab) |
| `manifest.json` | PWA-Manifest |
| `icon.png` | App-Icon |
| `supabase/migrations/*.sql` | DB-Migrationen (Quelle der Wahrheit für das Schema) |
| `supabase/functions/*` | Edge Functions (Deno/TypeScript) |
| `supabase/config.toml` | Function-Konfiguration (u.a. `verify_jwt`) |
| `Promptomizer Go-Live Roadmap.md` | Aufgaben-/Fortschrittsliste bis zum Launch |
| `AGB.md`, `Datenschutzerklaerung.md`, `Impressum.md` | Rechtstexte (auch als Views in `index.html` eingebettet) |

---

## 4. Supabase

- **Projekt-Ref:** `nrrsroaubbpmjyexhuhi` · **Name:** `promptomizer-db` · **Region:** `eu-central-1`
- **anon key** steht (öffentlich, by design) in `db.js`. **service_role key** und **Management-API-Token** gehören **nicht** ins Repo (siehe §10).

### Tabellen (alle mit aktivem RLS)
`profiles`, `library`, `prompt_history`, `snippets`, `prompt_categories`

- Jede Daten-Tabelle hat `user_id uuid` (bzw. `profiles.id`) mit FK auf `auth.users(id) ON DELETE CASCADE` → Account-Löschung räumt alle Nutzerdaten automatisch ab.
- `profiles` wird beim Signup vom Trigger `handle_new_user` (auf `auth.users`) angelegt (`tier = 'free'`).

### RLS-/Sicherheitsmodell (Stand 12.06.2026, Migration `20260612130000`)
- **Policies:** Lese-/Schreibzugriff nur auf eigene Zeilen (`auth.uid() = user_id` bzw. `= id`).
- **`profiles` ist nur spaltenweise schreibbar:** `authenticated` darf per UPDATE **nur** `onboarding_completed` setzen. **Alle Billing-Felder (`tier`, `stripe_*`, `subscription_status`, …) schreiben ausschließlich die Edge Functions per `service_role`.**
  - ⚠️ **Wichtig:** Niemals `authenticated`/`anon` ein breites `GRANT UPDATE` auf `profiles` geben. Sonst kann sich jeder Nutzer selbst auf `tier='pro'` setzen (Gratis-Upgrade) oder fremde `stripe_customer_id` kapern. Genau diese Lücke wurde geschlossen.
- **`anon`** hat **keinerlei** Tabellen-Grants (Gäste arbeiten rein clientseitig).
- **Free-Limit:** Trigger `check_free_plan_limit` (BEFORE INSERT auf `library`) wirft `FREE_LIMIT_REACHED` ab 10 gespeicherten Prompts für Free-User. Gehärtet mit `SET search_path = public` und `pg_advisory_xact_lock` (gegen Race bei parallelen Tabs/Doppel-Requests). Das Frontend fängt die Meldung ab und öffnet das Upgrade-Modal.
- Constraints: `profiles_tier_check` (nur `free`/`pro`), `NOT NULL` auf `library.user_id` & `prompt_history.user_id`, Unique-Index `prompt_categories(user_id, name)`.

### Migrationen
- Liegen in `supabase/migrations/`, Format `<timestamp>_<name>.sql`. **Sind die Quelle der Wahrheit fürs Schema.**
- Deploy: `npx supabase db push --linked` (verwendet die im CLI gespeicherten Zugangsdaten; **kein** lokales Docker nötig — `db dump`/`db diff` würden Docker brauchen, `db push` nicht).
- Schema/Policies live abfragen ohne Docker: Management-API `POST https://api.supabase.com/v1/projects/<ref>/database/query` mit Bearer-Token (siehe §10).

### Edge Functions (`supabase/functions/`)
| Function | `verify_jwt` | Zweck |
|---|---|---|
| `create-stripe-checkout-session` | true | Startet Stripe-Checkout für Pro |
| `create-stripe-portal-session` | true | Öffnet Stripe Customer Portal |
| `sync-stripe-subscription` | true | Gleicht Abo-Status nach Redirect ab |
| `stripe-webhook` | **false** | Stripe-Events → schreibt `tier`/`stripe_*` per service_role |
| `send-welcome-email` | true | Einmalige Willkommens-Mail |
| `_shared/stripe.ts` | — | Gemeinsame Helfer (`deriveTier`, `ensureStripeCustomer`, …) |

- **Welcome-Mail-Härtung** (siehe `supabase/functions/send-welcome-email/README.md`): geschützt durch Shared Secret `WELCOME_EMAIL_SECRET` (Header `x-welcome-secret`) + User-Existenz-Check; Einmal-Versand über `profiles.welcome_email_sent_at`. Ausgelöst durch DB-Trigger `trigger_send_welcome_email` (auf `auth.users`).
- Deploy einer Function: `npx supabase functions deploy <name>`.

---

## 5. Auth-Flows & -Konfiguration

- **Flows:** E-Mail/Passwort-Registrierung (mit AGB-Pflichthaken, Submit erst dann aktiv), E-Mail-Bestätigung (kein Autoconfirm), Login, Logout, Passwort-Reset (Recovery-Link → `modal-password-new`), Google-OAuth.
- **Session-Persistenz:** `localStorage` wenn „Angemeldet bleiben" aktiv, sonst `sessionStorage`. Umschalten über `window.setRememberPref(bool)` (re-initialisiert den Client). `detectSessionInUrl: true` übernimmt Tokens aus dem URL-Fragment.
- **Supabase Auth-Config (Management-API):**
  - `site_url = https://www.promptomizer.de` — ⚠️ war zwischenzeitlich kaputt (führendes Leerzeichen, falsche Domain), was Bestätigungs-/Reset-Mails ins Leere laufen ließ. **Beim Anlegen neuer Umgebungen prüfen.**
  - `uri_allow_list` enthält die Produktiv-Domains + localhost-Ports. Für lokale Auth-Tests ggf. temporär den Preview-Port (`4173`) hinzufügen und **danach wieder entfernen**.
- `registerUser` und `requestPasswordReset` setzen `emailRedirectTo`/`redirectTo` auf `window.location.origin`, damit der Link zur richtigen Domain zurückführt.

---

## 6. Billing / Stripe — aktuell SANDBOX

- Stripe läuft im **Test-/Sandbox-Modus** (`metadata[env]=sandbox` in `_shared/stripe.ts`).
- Deshalb sind UI-Texte wie „Stripe-Testabo verfügbar" / „Stripe-Testcheckout" **bewusst ehrlich** und sollen so bleiben, **bis** auf Live-Modus umgestellt wird.
- **Beim Umstieg auf Stripe-Live** anzupassen: diese UI-Texte, die Stripe-Keys/Preis-IDs, und die Rechtstexte (Roadmap Punkt 5).
- `tier` wird **nie** vom Client gesetzt, sondern nur über `stripe-webhook` / `sync-stripe-subscription` (service_role). `deriveTier(subscription_status)` entscheidet `free`/`pro`.

---

## 7. Frontend-Konventionen (WICHTIG einhalten)

- **XSS-Schutz ist Pflicht.** Nutzerdaten (Prompt-/Snippet-/Kategorie-Namen, Inhalte, Favoriten) nie roh in `innerHTML`:
  - `escapeHtml(value)` für Text in Markup.
  - `jsArg(value)` für Argumente in **Inline-Handlern** (`onclick='fn(${jsArg(x)})'`) — baut ein JSON-Literal und HTML-escaped es, damit weder Attribut- noch Skript-Kontext verlassen werden kann.
  - Alternativ `textContent` statt `innerHTML`.
- **Keine `alert()` / `confirm()`-Popups.** Stattdessen die nicht-blockierende Toast-Komponente:
  - `showToast(message, type = 'error', duration = 4000)` mit `type` ∈ `'error' | 'info' | 'success'`.
  - Container `#toast-container`, Styles `.toast` / `.toast-error|info|success` im `<style>`-Block.
  - **Technische/entwickler-orientierte Details** (RLS-Hinweise, Secret-Namen, Stack-Infos) gehören in `console.error`, **nicht** in den Toast vor dem Nutzer.
  - In `db.js` ist `showToast` nur defensiv erreichbar (`if (typeof window.showToast === 'function')`), weil `db.js` vor/unabhängig von `index.html` laufen kann.
- **Zwei Editor-Modi:** `currentMode` ∈ `'structured'` (Felder: `role`, `context`, `task`, `format`) und `'free'` (ein Rich-/Markdown-Feld). Viele Funktionen verzweigen darauf.
- **Bausteine/Snippets:** laufen über das **Accordion** (`renderSnippetsAccordion`, `toggleSnippetSection`, `loadSnippetSection`, `openSnippetCategory`, `insertSnippetEncoded`/`insertSnippetText`). Ältere `loadSnippetsForField*`/`insertSnippet`-Funktionen wurden als toter Code entfernt — **nicht wieder einführen**.
- **Sidebar/Tier-Anzeige:** überall denselben Tier-Status verwenden (`window.db.getUserTier()`), Upgrade-Hinweise nur zeigen, wenn fachlich korrekt.

---

## 8. Service Worker (`sw.js`) — Kill-Switch, NICHT löschen

- Vom 04.–16.01.2026 war ein **Cache-first**-Worker live, der `index.html` + CDN-Assets dauerhaft cachte. Clients aus dem Fenster hängen sonst für immer auf der alten Version.
- `sw.js` ist jetzt ein **Kill-Switch**: `skipWaiting` → beim Aktivieren alle Caches löschen, sich selbst deregistrieren, offene Tabs neu laden. Danach läuft die App **ohne** Service Worker; Releases kommen direkt vom Server.
- **`sw.js` muss weiter deployt werden und darf nicht gelöscht werden**, solange Alt-Clients existieren können.
- Solange die App für alles Wesentliche eine Supabase-Verbindung braucht, bringt ein Offline-Cache keinen Nutzen. Falls je wieder ein Worker eingeführt wird: Navigationen **network-first**, keine CDN-Skripte blind cachen.

---

## 9. Entwicklungs-Workflow

- **Umgebung:** Windows + PowerShell. Bei Pfaden/Variablen PowerShell-Syntax (`$env:VAR`, `$null`, Backtick als Zeilenfortsetzung).
- **Lokale Vorschau:** statischer Server auf Port **4173** (siehe `.claude/launch.json`, Name `promptomizer-static`). HMR gibt es nicht → nach Edits Seite neu laden.
- **Git:**
  - Auf `main` wird gearbeitet (Solo-Projekt). Remote: `github.com/TheRealHuzur/Promptomizer`.
  - **LF→CRLF-Warnungen** beim Commit sind unter Windows normal und harmlos.
  - **PowerShell-Falle bei Commit-Messages:** Eingebettete `"`-Anführungszeichen in `git commit -m @'...'@` zerlegen die Argumente. In Messages doppelte Anführungszeichen vermeiden (oder Zeichen ersetzen).
  - Commit-Messages auf Deutsch, mit `Co-Authored-By`-Trailer, wenn von der KI erstellt.
- **Supabase ohne Docker:** `db push` und `functions deploy` brauchen **kein** Docker. Nur `db dump`/`db diff`/lokaler Stack bräuchten es (Docker Desktop ist hier nicht installiert → diese Befehle meiden).
- **`supabase/.temp/` ist gitignored** (enthält u.a. `welcome-secret.txt`). Dort keine dauerhaften Artefakte ablegen, die ins Repo sollen.

---

## 10. Secrets & Zugänge (NIE ins Repo)

- **anon key:** öffentlich, liegt korrekt in `db.js`.
- **service_role key** & **Supabase Management-API-Token:** geheim. Während der Arbeit abrufbar über:
  - Management-Token: Windows Credential Manager, Eintrag `Supabase CLI:supabase` (von der Supabase-CLI hinterlegt).
  - service_role/anon: Management-API `…/projects/<ref>/api-keys?reveal=true`.
  - Diese Werte nur transient verwenden (z.B. unter `supabase/.temp/`, das gitignored ist) und **nie** committen.
- **Edge-Function-Secrets** (Stripe-Keys, `WELCOME_EMAIL_SECRET`, …) liegen in den Supabase-Function-Secrets, nicht im Repo.

---

## 11. Sicherheits- & Vertrauens-Leitplanken (Zusammenfassung)

1. Nutzerdaten immer escapen (`escapeHtml`/`jsArg`/`textContent`).
2. `tier` & Billing-Felder ausschließlich serverseitig (Edge Functions/service_role) setzen.
3. `profiles` clientseitig nur `onboarding_completed` schreibbar lassen.
4. Keine `alert()` — `showToast` nutzen; technische Details nur in die Konsole.
5. Keine toten Buttons / „demnächst verfügbar"-Platzhalter im Produkt (besonders in bezahlungsnahen Bereichen). Wenn ein Weg existiert (z.B. Konto-Löschung per Mail an `info@promptomizer.de`), echten Pfad anbieten.
6. UI-Aussagen müssen zum echten Produktverhalten passen (z.B. „Test"-Wording nur solange Sandbox aktiv).

---

## 12. Stand der Go-Live-Arbeiten (13.06.2026)

Phase 1 (harte Blocker) ist bis auf **Punkt 5 (Rechtstexte — macht der Inhaber selbst)** erledigt. In Phase 2 sind erledigt: **6** (Auth-Flows, Kern getestet), **7** (RLS-Audit), **8** (Service Worker), **9** (UI-Vertrauen), **10b** (toter Code).

**Noch offen** (Details in der Roadmap):
- Punkt 5 — Rechtstexte an Realität angleichen (Inhaber).
- Punkt 6 — manuelle Resttests: echter Mail-Empfang, Google-OAuth, Consent-/Cookie-Szenarien auf der Live-Domain.
- Punkt 10 — Mobile-/Cross-Browser-Durchlauf.
- Phase 3 — Monitoring/Fehlertracking, Support-/Recovery-Prozesse, Deployment-/Release-Absicherung.
- Phase 4 — Conversion/Geschäft.

Immer zuerst [`Promptomizer Go-Live Roadmap.md`](Promptomizer%20Go-Live%20Roadmap.md) lesen — dort steht der aktuelle, detaillierte Stand inkl. der bewussten „nicht geändert"-Entscheidungen.
