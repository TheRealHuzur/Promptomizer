# CLAUDE.md — Entwicklungskontext Promptomizer

Diese Datei wird beim Sessionstart automatisch als Kontext geladen. Sie soll einer KI (oder einem neuen Entwickler) beim **Chat-/Kontextwechsel** sofort das nötige Hintergrundwissen geben: Architektur, Konventionen, Fallstricke und der Stand der Go-Live-Arbeiten.

> **Pflege:** Wenn du etwas Nicht-Offensichtliches änderst (neue Tabelle, neue Edge Function, geänderte Konvention, neuer Workflow), aktualisiere diese Datei. Detaillierte To-dos und der Launch-Fortschritt stehen in [`Promptomizer Go-Live Roadmap.md`](Promptomizer%20Go-Live%20Roadmap.md) — die ist die „lebende" Aufgabenliste, diese Datei ist das „wie ist es gebaut".

---

## 1. Was ist Promptomizer?

Ein Web-Tool, mit dem Nutzer strukturierte KI-Prompts bauen, in einer persönlichen **Bibliothek** speichern, in **Kategorien** organisieren und aus **Bausteinen** (Snippets) zusammensetzen. Free-Plan mit Limit, Pro-Plan per Stripe. Deutschsprachig.

- **Produktiv-Domain:** https://www.promptomizer.de (Hauptdomain), `promptomizer.de` → 301-Redirect (bis 02.08.2026 war das ein 307, per Vercel-API auf `redirectStatusCode: 301` korrigiert — Projekt-Domain-Setting, nicht in `vercel.json`), `promptomizer.vercel.app` (Vercel-Default).
- **Hosting:** Vercel (statisches Hosting). Kein Build-Step — die Dateien werden direkt ausgeliefert.
- **URL-Architektur (seit 02.08.2026, SEO/GEO-Roadmap Phase 0):** `/` ist die Marketing-Startseite (`index.html`, indexierbar), die eigentliche App liegt unter `/app` (physisch `app.html`, `noindex`). `vercel.json` setzt `"cleanUrls": true` — jede `.html`-Datei ist automatisch ohne Endung erreichbar (`app.html` → `/app`, `preise.html` → `/preise`, usw.) und die `.html`-URL redirected automatisch (308) auf die saubere URL. Gilt für **jede** `.html`-Datei im Repo-Root, auch künftige, ohne `vercel.json` anfassen zu müssen. Details siehe §2 und §3.

---

## 2. Tech-Stack & Architektur

- **Frontend, zwei getrennte Dokumente seit dem `/app`-Umzug (02.08.2026):**
  - [`app.html`](app.html) (~270 KB, vormals `index.html`) ist die eigentliche App: Markup, Styles, gesamte UI-Logik, mit eingebettetem `<style>` und `<script>`. Wird dank `cleanUrls` unter `/app` ausgeliefert (URL bleibt `/app`, Datei bleibt physisch `app.html`; `/app.html` redirected automatisch auf `/app`). Enthält `<base href="/">` im `<head>` — **wichtig:** dadurch lösen die weiterhin relativen Asset-Pfade in dieser Datei (`styles.css`, `db.js`, `vendor/...`) gegen die Domain-Wurzel auf, unabhängig davon, dass die URL `/app` und nicht `/` lautet (interne Links wie zu `/preise` sind bereits absolut geschrieben und bräuchten das `base` eigentlich nicht mehr, es bleibt aber für die Asset-Pfade nötig). **Beim Verschieben/Umbenennen dieser Datei immer den `<base>`-Mechanismus mitdenken**, sonst brechen alle Assets lautlos. Zusätzlich `<meta name="robots" content="noindex, follow">`, da die App-Oberfläche selbst nicht indexiert werden soll.
  - [`index.html`](index.html) ist die öffentliche, indexierbare Marketing-Startseite (seit 02.08.2026, SEO/GEO-Roadmap Phase 0). Eigenständiges Dokument, kein App-Shell, normale scrollende Seite wie `preise.html`.
  - **Kein Framework, kein Bundler, kein Build.** Tailwind, Font Awesome, Inter und Driver.js liegen lokal unter [`vendor/`](vendor/) (kein CDN mehr, seit 16.07.2026 — Tailwind wird einmalig per CLI kompiliert, siehe [`vendor/tailwind/README.md`](vendor/tailwind/README.md), keine Live-Build-Pipeline).
  - ⚠️ **Falle bei neuen statischen Seiten:** `vendor/tailwind/tailwind.css` ist JIT-gepurged, `content` in `vendor/tailwind/tailwind.config.js` listet die HTML-Dateien einzeln auf (aktuell `index.html`, `app.html`, `preise.html`, `impressum.html`, `datenschutz.html`, `agb.html`). Eine neue `.html`-Datei, die dort nicht eingetragen ist, bekommt **stillschweigend keine Fehlermeldung**, sondern einfach fehlende Utility-Klassen (kaputte Abstände, fehlende Grid-Spalten, unsichtbare `md:`-Elemente). Bei jeder neuen Marketing-/Content-Seite: Datei zu `content` hinzufügen und mit der CLI neu kompilieren (Befehl in `vendor/tailwind/README.md`). Relevant vor allem für die SEO/GEO-Roadmap (Phase 3, 4, 7 bringen viele neue statische Seiten).
  - `vercel.json` (neu, 02.08.2026): `"cleanUrls": true` (alle `.html`-Endungen sitewide weg, siehe oben), `"trailingSlash": false`, plus expliziter Redirect `/index.html` → `/` als Sicherheitsnetz. Interne Links in allen `.html`-Dateien sind entsprechend ohne `.html`-Endung geschrieben (z. B. `/preise`, nicht `/preise.html`). Apex-Domain `promptomizer.de` redirected mit 301 (war 307 bis 02.08.2026) — das ist eine Vercel-Projekt-Domain-Einstellung (`redirect`/`redirectStatusCode` am Domain-Objekt, per API/Dashboard steuerbar, **nicht** über `vercel.json`).
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
| `index.html` | Marketing-Startseite (öffentlich, indexierbar) |
| `app.html` | Gesamte App: Markup, Styles, gesamte UI-Logik. Ausgeliefert unter `/app` (siehe §2, `vercel.json`) |
| `preise.html` | Preisseite |
| `impressum.html`, `datenschutz.html`, `agb.html` | Rechtstexte als eigene, indexierbare Seiten (seit 02.08.2026). Verlinkt im Footer von `index.html`/`preise.html`, **nicht** im App-Footer — innerhalb der App sind sie bewusst nur über Profilmenü erreichbar (2 Klicks, als ausreichend bewertet). Inhaltlich identisch mit den In-App-Views (`view-impressum`/`view-datenschutz`/`view-agb`) in `app.html` sowie mit `AGB.md`/`Datenschutzerklaerung.md`/`Impressum.md` — bei Rechtstext-Änderungen **alle Stellen** aktualisieren. |
| `vercel.json` | `cleanUrls`, `trailingSlash`, Redirects (siehe §2) |
| `wissen/<slug>.html` | Wissensseiten (noch keine existieren, Stand 02.08.2026 — Infrastruktur/Template steht, Inhalte kommen erst Phase 4/7). Template und Publikations-Workflow: `/srv/wuw-storage/53_promptomizer/02_guides/wissensseite-template.html` + `wissensseiten-workflow.md` |
| `db.js` | Supabase-Client, Auth, `window.db`-API |
| `library.js` | Eigenständige Bibliothekslogik für Karten-/Listenansicht, Suche, Filter, Metadaten, Archiv, Export und Pro-Massenaktionen |
| `library.css` | Desktop-Design der Bibliothek; bewusst ohne appweites Responsive-Redesign |
| `sw.js` | Service Worker — **Kill-Switch** (räumt alte Caches/Registrierungen ab) |
| `manifest.json` | PWA-Manifest, `start_url` zeigt auf `/app` |
| `icon.png` | App-Icon |
| `supabase/migrations/*.sql` | DB-Migrationen (Quelle der Wahrheit für das Schema) |
| `supabase/functions/*` | Edge Functions (Deno/TypeScript) |
| `supabase/config.toml` | Function-Konfiguration (u.a. `verify_jwt`) |
| `/srv/wuw-storage/53_promptomizer/01_roadmaps/` | Nicht versionierte Roadmaps, Checklisten und Fortschrittsnotizen |
| `AGB.md`, `Datenschutzerklaerung.md`, `Impressum.md` | Ursprungstexte der Rechtstexte (Quelle für die In-App-Views und die eigenständigen Seiten) |

---

## 4. Supabase

- **Projekt-Ref:** `nrrsroaubbpmjyexhuhi` · **Name:** `promptomizer-db` · **Region:** `eu-central-1`
- **anon key** steht (öffentlich, by design) in `db.js`. **service_role key** und **Management-API-Token** gehören **nicht** ins Repo (siehe §10).

### Tabellen (alle mit aktivem RLS)
`profiles`, `library`, `prompt_versions`, `prompt_history`, `snippets`, `prompt_categories`, `badges`, `user_badges`

- Jede Daten-Tabelle hat `user_id uuid` (bzw. `profiles.id`) mit FK auf `auth.users(id) ON DELETE CASCADE` → Account-Löschung räumt alle Nutzerdaten automatisch ab.
- `profiles` wird beim Signup vom Trigger `handle_new_user` (auf `auth.users`) angelegt (`tier = 'free'`).

### RLS-/Sicherheitsmodell (Stand 11.08.2026, inkl. Migration `20260811191926`)
- **Policies:** Lese-/Schreibzugriff nur auf eigene Zeilen (`auth.uid() = user_id` bzw. `= id`).
- **`profiles` ist nur spaltenweise schreibbar:** `authenticated` darf per UPDATE ausschließlich `onboarding_completed`, `display_name`, `default_editor_mode` und `active_badge_code` setzen. **Alle Billing-Felder (`tier`, `stripe_*`, `subscription_status`, …) schreiben ausschließlich die Edge Functions per `service_role`.**
  - ⚠️ **Wichtig:** Niemals `authenticated`/`anon` ein breites `GRANT UPDATE` auf `profiles` geben. Sonst kann sich jeder Nutzer selbst auf `tier='pro'` setzen (Gratis-Upgrade) oder fremde `stripe_customer_id` kapern. Genau diese Lücke wurde geschlossen.
- **`anon`** hat **keinerlei** Tabellen-Grants (Gäste arbeiten rein clientseitig).
- **Free-Limit:** Trigger `check_free_plan_limit` (BEFORE INSERT auf `library`) wirft `FREE_LIMIT_REACHED` ab 10 gespeicherten Prompts für Free-User. Gehärtet mit `SET search_path = public` und `pg_advisory_xact_lock` (gegen Race bei parallelen Tabs/Doppel-Requests). Das Frontend fängt die Meldung ab und öffnet das Upgrade-Modal.
- **Badges:** `badges` ist der lesbare Katalog, `user_badges` enthält ausschließlich serverseitig vergebene Auszeichnungen. Ein zusammengesetzter FK von `profiles(id, active_badge_code)` auf `user_badges(user_id, badge_code)` verhindert die Auswahl unverdienter Badges. Der Founder-Badge wird bei berechtigten, bestätigten Stripe-Events idempotent vergeben.
- **Bibliothek V2:** `library.category_id` referenziert Kategorien zusammen mit `user_id` eigentümersicher; das alte Textfeld `category` bleibt während der Übergangszeit synchron erhalten. `description`, `is_favorite`, `last_used_at` und `archived_at` sind Metadaten. `prompt_type` und `search_vector` werden generiert; ein GIN-Index ermöglicht serverseitige Volltextsuche. Mehrfachaktionen laufen ausschließlich als Pro über `bulk_manage_library_prompts`.
- **Prompt-Versionierung:** `library.current_version`/`updated_at` halten den aktuellen Stand. Private Trigger schreiben beim Anlegen und bei jeder Änderung von `name`/`fields` unveränderliche Snapshots nach `prompt_versions`; Beschreibungs-, Kategorie-, Favoriten-, Nutzungs- und Archivänderungen erzeugen keine Inhaltsversion. Bestehende Prompts wurden als Version 1 übernommen.
- **Pro-Zugriff:** Versionen werden auch für Free-Nutzer erzeugt, sind per RLS aber nur für den jeweiligen Eigentümer mit `profiles.tier = 'pro'` lesbar. Direkte Client-Schreibrechte auf `prompt_versions` existieren nicht. `restore_library_prompt_version` läuft als `SECURITY INVOKER`, übernimmt Name/Inhalt und erzeugt eine neue aktuelle Version; die Kategorie bleibt unverändert.
- Constraints: `profiles_tier_check` (nur `free`/`pro`), `profiles_default_editor_mode_check`, Anzeigename maximal 40 Zeichen, `NOT NULL` auf `library.user_id` & `prompt_history.user_id`, Unique-Indizes `prompt_categories(user_id, name)` und `prompt_versions(prompt_id, version_number)`.

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

- Stripe läuft bis zum abgeschlossenen Live-Cutover im **Test-/Sandbox-Modus**. `getStripeEnvironment()` leitet `metadata[env]` automatisch aus dem serverseitigen Stripe-Schlüssel ab, damit beim Key-Wechsel keine Sandbox-Metadaten in Live-Objekten landen.
- Umsatzsteuer wird bewusst **nicht über Stripe Tax**, sondern über die feste, inklusive deutsche 19-%-Tax-Rate aus dem Edge-Function-Secret `STRIPE_TAX_RATE_ID_DE_STANDARD` berechnet. `create-stripe-checkout-session` setzt sie als `subscription_data[default_tax_rates]` und speichert die im Checkout eingegebene Rechnungsadresse am Stripe-Kunden.
- Die UI-Texte sind für den Livebetrieb vorbereitet und enthalten keine „Testabo/Testcheckout"-Formulierung mehr.
- **Beim Umstieg auf Stripe-Live** anzupassen: Stripe-Live-Key, Live-Webhook-Secret, Live-Preis-IDs und Live-Tax-Rate-ID; Sandbox-Billing-Verweise in `profiles` dürfen nicht mit dem Live-Key weiterverwendet werden.
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
- **Standard-Editor:** `profiles.default_editor_mode` wird pro Konto gespeichert und beim ersten leeren Editor einer Sitzung angewendet. Geladene Inhalte und `promptEditSession` haben immer Vorrang.
- **Profil/Badges:** Account-Daten laufen über `getAccountSettings`/`saveAccountSettings`/`getUserBadges`. Badge-Assets dürfen nur aus `assets/badges/*.svg` kommen; dynamische Namen und Texte weiterhin escapen.
- **Bibliotheks-Bearbeitung:** `promptEditSession` lädt einen Prompt bewusst in den Haupteditor und sperrt den Moduswechsel. Abbrechen stellt den vorherigen Editorentwurf wieder her; ein erfolgreiches `saveActivePromptVersion()` beendet dagegen die Bearbeitung und lässt den aktualisierten Prompt im normalen Editor stehen. Normales `handlePromptClick()` bleibt ein nicht verknüpftes Laden als Vorlage.
- **Versionsverlauf:** `prompt_versions` ist nicht mit der allgemeinen `prompt_history` zu verwechseln. Der Pro-Verlauf ist ausschließlich über „Bearbeiten“ → „Versionen“ erreichbar; ein Restore erzeugt stets eine neue Version und ändert keine Kategorie.
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
3. `profiles` clientseitig nur für `onboarding_completed`, `display_name`, `default_editor_mode` und `active_badge_code` freigeben; niemals breites `UPDATE` erlauben.
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
