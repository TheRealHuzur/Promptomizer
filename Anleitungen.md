# Anleitungen — Promptomizer

Operative Schritt-für-Schritt-Anleitungen für häufige Admin-Aufgaben.

---

## Anleitung 1: Nutzer manuell auf Pro oder Free setzen

### Wann brauchst du das?

Normalerweise setzt der Stripe-Webhook den `tier`-Wert automatisch, sobald ein Kauf oder eine Kündigung verarbeitet wird. Es gibt aber Situationen, in denen du manuell eingreifen musst:

- Stripe hat einen Webhook verpasst (passiert selten, aber möglich bei Netzwerkproblemen)
- Ein Nutzer schreibt dir, dass er bezahlt hat, aber das Produkt ihm immer noch den Free-Plan zeigt
- Du möchtest jemandem testweise kurzzeitig Pro-Zugang geben
- Ein Nutzer hat gekündigt, aber der Downgrade ist nicht angekommen
- Du brauchst es für manuelle Support-Fälle oder Kulanzentscheidungen

### Voraussetzung: Zugang zum Supabase SQL-Editor

1. Gehe auf [https://supabase.com/dashboard](https://supabase.com/dashboard) und melde dich an
2. Wähle das Projekt **promptomizer-db**
3. Klicke in der linken Seitenleiste auf **SQL Editor**
4. Du siehst ein leeres Eingabefeld — hier gibst du die SQL-Befehle ein

Der SQL-Editor läuft mit `service_role`-Rechten, d.h. RLS-Policies werden umgangen. Das ist genau das, was du brauchst, weil normale Nutzer `tier` nicht selbst ändern dürfen.

---

### Schritt 1: User-UUID herausfinden

Du brauchst die interne UUID des Nutzers (nicht die E-Mail-Adresse). Führe diesen Befehl aus:

```sql
SELECT id, email, created_at
FROM auth.users
WHERE email = 'email@des-nutzers.de';
```

Ersetze `email@des-nutzers.de` mit der echten E-Mail-Adresse. Das Ergebnis sieht so aus:

```
id                                   | email                    | created_at
-------------------------------------|--------------------------|----------------------------
a1b2c3d4-e5f6-7890-abcd-ef1234567890 | email@des-nutzers.de     | 2026-05-01 12:34:56+00
```

Kopiere die `id` — das ist die UUID, die du im nächsten Schritt brauchst.

---

### Schritt 2a: Nutzer auf Pro setzen

```sql
UPDATE public.profiles
SET
    tier = 'pro',
    subscription_status = 'active'
WHERE id = 'HIER-DIE-UUID-EINFÜGEN';
```

Ersetze `HIER-DIE-UUID-EINFÜGEN` mit der UUID aus Schritt 1. Klicke auf **Run**.

Du solltest als Ergebnis `1 row affected` sehen. Wenn `0 rows affected` erscheint, hast du die UUID falsch eingefügt oder der Nutzer hat noch keinen `profiles`-Eintrag (sollte nicht vorkommen, kann aber bei sehr alten Test-Accounts passieren).

---

### Schritt 2b: Nutzer auf Free zurücksetzen

```sql
UPDATE public.profiles
SET
    tier = 'free',
    subscription_status = 'canceled'
WHERE id = 'HIER-DIE-UUID-EINFÜGEN';
```

---

### Schritt 3: Prüfen ob es geklappt hat

```sql
SELECT id, tier, subscription_status, stripe_customer_id, stripe_subscription_id
FROM public.profiles
WHERE id = 'HIER-DIE-UUID-EINFÜGEN';
```

Das Ergebnis sollte den neuen `tier`-Wert zeigen.

---

### Was passiert im Produkt?

Der Nutzer sieht die Änderung beim nächsten Seitenaufruf oder nach einem Logout/Login. Das Frontend fragt den Tier-Status bei jedem Laden frisch aus der Datenbank ab — es gibt keinen clientseitigen Cache, den du invalidieren müsstest.

---

### Wichtige Hinweise

- **Niemals** `tier` direkt über die Supabase-Tabellen-UI (Table Editor) ändern — der Table Editor läuft auch mit `service_role`, aber du siehst dort alle Nutzer auf einmal und kannst leicht die falsche Zeile erwischen. SQL ist präziser.
- Wenn du auf Pro setzt, ohne dass ein echtes Stripe-Abo existiert, und Stripe danach einen Webhook schickt (z.B. nach echter Kündigung), überschreibt der Webhook deinen manuellen Eintrag wieder. Das ist das gewollte Verhalten.
- Die SQL-Snippets liegen auch in `supabase/.temp/admin-snippets.sql` zum Kopieren bereit (die Datei ist gitignored, also nicht im Repo).

---

## Anleitung 2: Rollback — vorherige Version wiederherstellen

### Wann brauchst du das?

Du hast etwas deployed und merkst danach, dass etwas kaputt ist — ein JS-Fehler, ein Layout-Problem, eine Edge Function die nicht mehr antwortet. Vercel erlaubt dir, mit einem Klick auf einen früheren Stand zurückzuspringen, ohne Git anfassen zu müssen.

### Schritte

1. Gehe auf [https://vercel.com/dashboard](https://vercel.com/dashboard) und wähle das Projekt **Promptomizer**
2. Klicke oben auf den Tab **Deployments**
3. Du siehst eine Liste aller bisherigen Deploys mit Zeitstempel und Commit-Nachricht
4. Suche den letzten funktionierenden Deploy (der Zeitstempel vor deinem kaputten Commit)
5. Klicke auf die **drei Punkte** rechts neben dem Eintrag → **Promote to Production**
6. Vercel schaltet sofort auf diesen Stand um — kein neuer Build, keine Wartezeit

### Was passiert dabei?

- Die Dateien auf `www.promptomizer.de` werden sofort auf den alten Stand gewechselt
- Dein Git-Repository bleibt unverändert — du machst keinen `git revert` oder ähnliches
- Edge Functions in Supabase sind davon **nicht** betroffen — die laufen unabhängig von Vercel
- Datenbank-Migrationen sind ebenfalls **nicht** rückgängig zu machen — ein Rollback in Vercel hilft nur bei Frontend-Fehlern

### Danach

Sobald du den Fehler im Code behoben hast, machst du einen normalen `git push` — Vercel deployt automatisch den neuen Stand und überschreibt das manuelle Rollback.

---

## Anleitung 3: Pre-Deploy-Checkliste

Diese Checkliste vor jedem `git push` durchgehen, wenn du etwas Wesentliches geändert hast.

### Vor dem Push

- [ ] Lokale Vorschau geöffnet (Port 4173) und die geänderte Funktion einmal manuell getestet
- [ ] Browser-Konsole offen — keine roten Fehlermeldungen
- [ ] Wenn du Supabase-Tabellen oder RLS-Policies geändert hast: Migration in `supabase/migrations/` liegt vor und wurde mit `npx supabase db push --linked` deployed
- [ ] Wenn du eine Edge Function geändert hast: `npx supabase functions deploy <name>` ausgeführt
- [ ] Wenn du `index.html`, `preise.html`, `impressum.html`, `datenschutz.html`, `agb.html` oder neue Wissensseiten geändert hast: `python3 tools/check-seo-meta.py` ausgeführt (prüft Title/Description/Canonical/JSON-LD-Validität, siehe Phase 1 der SEO/GEO-Roadmap)
- [ ] Wenn du neue Tailwind-Klassen in einer `.html`-Datei benutzt hast: Datei in `vendor/tailwind/tailwind.config.js` → `content` eingetragen und neu kompiliert (siehe `vendor/tailwind/README.md`, `CLAUDE.md` §2)
- [ ] Wenn du in `app.html` an der Prompt-Zusammensetzung gearbeitet hast — `handleCopyAndSave()`, `structuredPromptToText()`, `extractStructuredFields()`, `historyParseStructuredFromText()`, `isFreePrompt()`, `prefixSearchQuery()` oder an `FIELDS` / der Feldreihenfolge: `src/editor.py` im MCP-Gateway nachgezogen (siehe Anleitung 5 und `CLAUDE.md` §7a). **Der Bruch wäre lautlos** — der Agent bekäme leere Felder oder ein abweichendes Format, ohne dass irgendwo ein Fehler auftaucht
- [ ] Commit-Nachricht beschreibt was und warum (nicht nur "fix")

### Nach dem Push

- [ ] Vercel-Dashboard aufmachen und prüfen, dass der Deploy-Status auf **Ready** wechselt (dauert ~30 Sekunden)
- [ ] `www.promptomizer.de` im Browser aufrufen und kurz die geänderte Stelle prüfen
- [ ] Sentry-Dashboard kurz checken — keine neuen Issues aufgetaucht

### Bei Stripe-relevanten Änderungen zusätzlich

- [ ] Stripe-Dashboard → Webhooks → letzten Event prüfen ob er ankam
- [ ] Einen Test-Checkout im Sandbox-Modus durchklicken

---

## Anleitung 4: Vendor-Abhängigkeiten aktualisieren

### Überblick

Seit 16.07.2026 liegen alle Frontend-Bibliotheken lokal unter [`vendor/`](vendor/) statt auf externen CDN-Servern (Grund: Produktionstauglichkeit, weniger Drittland-/Consent-Risiken, keine Abhängigkeit von CDN-Verfügbarkeit). Einzige Ausnahme: Sentry und Cookiebot bleiben CDN-geladen (Consent-Management bzw. Fehler-Tracking-SDK, beide mit fixer/gehashter Version effektiv eingefroren).

| Bibliothek | Aktuelle Version | Ablage |
|---|---|---|
| driver.js | 1.4.0 | `vendor/driverjs/` |
| @supabase/supabase-js | 2.108.1 | `vendor/supabase/` |
| Font Awesome | 6.4.0 | `vendor/fontawesome/` |
| Tailwind CSS | 3.4.17, lokal per CLI kompiliert | `vendor/tailwind/` (siehe `vendor/tailwind/README.md`) |
| Google Fonts (Inter) | v20 (variable font, alle Gewichte 300–700) | `vendor/fonts/inter/` |
| Sentry | Hash in URL (weiterhin CDN, effektiv eingefroren) | — |

### Wann und wie aktualisieren?

Nur aktualisieren wenn es einen konkreten Grund gibt (Sicherheitslücke, benötigtes Feature). Nicht blind auf "latest" aktualisieren.

**driver.js / Font Awesome / Inter / Supabase-js** (statische Dateien, kein Build):
1. Neue Version-Dateien von der jeweiligen Quelle herunterladen (jsdelivr/cdnjs/fonts.googleapis.com) und die Dateien unter `vendor/<lib>/` ersetzen.
2. Bei Font Awesome/Inter: referenzierte Webfont-Dateien (`.woff2`/`.ttf`) mit herunterladen, Pfade in der CSS ggf. anpassen.
3. Lokal testen (Port 4173, Konsole auf Fehler prüfen).
4. Committen und pushen.

**Tailwind** (Build-Schritt, siehe `vendor/tailwind/README.md`):
1. `tailwind.config.js` bei Theme-Änderungen anpassen.
2. Mit der Tailwind-CLI neu kompilieren (`vendor/tailwind/README.md` enthält den genauen Befehl).
3. `vendor/tailwind/tailwind.css` committen.

---

## Anleitung 5: Agentenzugang (Workbuddy) prüfen, abschalten, wieder anschalten

### Worum geht es?

Seit 14.08.2026 nutzt ein KI-Agent Promptomizer über ein **ganz normales Konto**:
`workbuddy@promptomizer.de`, regulär registriert, Pro über ein echtes Stripe-Abo mit
hundertprozentigem Rabatt. Er meldet sich mit gewöhnlichen Zugangsdaten an und arbeitet mit
einem normalen Nutzer-Token gegen dieselben Endpunkte wie ein Browser — **kein
Service-Role-Key, kein Admin-Zugriff, keine Umgehung von RLS**.

Am Code in diesem Repo ändert das nichts. Die Verbindung stellt ein **Gateway-Container
außerhalb dieses Repos** her: `/home/patrick/projects/promptomizer-mcp-gateway/`. Er liegt
bewusst draußen, weil Vercel diesen Baum statisch ausliefert — eine `.env` hier wäre nach
einem Commit öffentlich abrufbar.

Hintergrund und Gesamtplanung: `/srv/wuw-storage/53_promptomizer/01_roadmaps/mcp`.
Alles, was den Rechte- und Werkzeugkatalog betrifft, steht nicht hier, sondern in der
WorkDESK-Doku (`/srv/wuw-storage/52_WorkDESK`, Abschnitte Integrationen und Betrieb).

---

### Prüfen, ob der Zugang lebt

```bash
curl -s http://127.0.0.1:8110/health
```

Erwartete Antwort:

```json
{"status":"ok","angemeldet_als":"0f5a21ad-...","contract_version":"promptomizer.v1"}
```

Der Healthcheck **prüft die Anmeldung mit**, nicht nur den Prozess. Steht dort etwas anderes
als `ok`, ist entweder die Anmeldung kaputt (Passwort geändert, siehe unten) oder Supabase
nicht erreichbar. Der Port `8110` liegt nur auf dem Loopback und ist ausschließlich für die
Fehlersuche gedacht — nach außen tritt WorkDESK auf, nicht dieses Gateway.

Protokoll ansehen:

```bash
cd /home/patrick/projects/promptomizer-mcp-gateway && docker compose logs -f promptomizer-gateway
```

---

### Sehen, was der Agent angelegt hat

Melde dich auf `www.promptomizer.de` mit **denselben Zugangsdaten** an
(`workbuddy@promptomizer.de`). Du siehst dieselbe Bibliothek wie der Agent, in Echtzeit, mit
vollem Kontozugriff. Es gibt keinen getrennten Datenbestand und keine Sonderbehandlung — genau
das war der Sinn der Konstruktion.

Das Passwort liegt bei dir, das Postfach ist bei Ionos. Das Gateway hält es nur als
Container-Secret.

---

### Abschalten — drei Stufen

Alle drei greifen **beim nächsten Aufruf**. Der Promptomizer-Account und sämtliche Inhalte
bleiben in jedem Fall unangetastet.

| Stufe | Wie | Wirkung |
|---|---|---|
| Einzelne Fähigkeit | In WorkDESK die betreffende Capability global blockieren (z.B. nur `promptomizer.delete`) | Der Agent darf weiterlesen, aber nicht mehr löschen |
| Ganzer Dienst | In WorkDESK `mcp_server.status = 'inaktiv'` setzen | Promptomizer verschwindet komplett aus dem Werkzeugkasten, andere Dienste laufen weiter |
| Harter Stopp | `cd /home/patrick/projects/promptomizer-mcp-gateway && docker compose down` | Der Container ist weg; WorkDESK meldet den Server als nicht erreichbar |

Die beiden ersten Stufen liegen in WorkDESK, nicht in Promptomizer — dort sitzt das
Rechte-Gate. Der genaue Weg steht in `05_BETRIEB.md` der WorkDESK-Doku.

Wieder anschalten: Container mit `docker compose up -d` starten, Status in WorkDESK zurück auf
aktiv setzen, dann den Healthcheck oben ausführen.

---

### Drei Dinge, die du von Promptomizer-Seite aus kaputt machen kannst

**1. Passwort des Agentenkontos ändern.** Das Gateway meldet sich damit an. Nach einer Änderung
im Supabase-Dashboard oder über „Passwort vergessen" kommt es nicht mehr rein — der
Healthcheck fällt, der Server verschwindet aus dem Werkzeugkasten. Reparatur: neuen Wert in
`PROMPTOMIZER_AGENT_PASSWORD` in der `.env` des Gateways eintragen (Rechte `600`, nicht im
Repo) und `docker compose up -d --force-recreate` ausführen. **`docker compose restart` reicht
nicht** — der Container startet dann mit seiner alten Konfiguration weiter.

**2. Das Stripe-Abo mit Vollrabatt kündigen oder auslaufen lassen.** Dann setzt
`sync-stripe-subscription` das Konto auf `free` zurück, und ab dem zehnten Inhalt (Prompts und
Bausteine zusammen, Archiv eingerechnet) bricht jedes Anlegen mit `FREE_LIMIT_REACHED` ab.
Bearbeiten, Exportieren und Löschen laufen weiter — der Ausfall sieht deshalb nach einem
zufälligen Fehler aus, nicht nach einem Tarifproblem. Ein von Hand gesetztes `tier = 'pro'`
(Anleitung 1) hilft hier **nicht** dauerhaft: der nächste Sync überschreibt es wieder. Genau
deshalb läuft der Zugang über ein echtes Abo.

**3. Die Prompt-Zusammensetzung im Frontend ändern, ohne das Gateway nachzuziehen.**
Promptomizer speichert *Felder*, nicht den fertigen Prompttext — der entsteht erst im Browser.
`src/editor.py` im Gateway bildet das nach. Wer `handleCopyAndSave()`,
`structuredPromptToText()`, `extractStructuredFields()`, `historyParseStructuredFromText()`,
`isFreePrompt()`, `prefixSearchQuery()` oder die Feldreihenfolge anfasst, muss dort nachziehen.
**Der Bruch ist lautlos:** der Agent bekommt leere Felder oder ein abweichendes Format, ohne
dass irgendwo etwas scheitert. Zwei Stolperstellen dabei: Index 3 des gespeicherten Arrays ist
ein historisches, leeres `style`-Feld — wer es wegkürzt, verschiebt `format`; und im Verlauf
zeigen „VARIANTEN" **und** „FORMAT" auf dasselbe Feld. Ausführlich in `CLAUDE.md` §7a und im
README des Gateways.

---

### Was der Agent ausdrücklich nicht kann

Es gibt keine Konto-, Auth-, Passwort- oder Billing-Werkzeuge und kein allgemeines „führe
beliebiges aus". Der Agent kann seinen eigenen Tarif nicht ändern und keine Zahlungsdaten
sehen. Die Grenze ist nicht die Oberfläche, sondern der Werkzeugkatalog — und der wird in
WorkDESK gepflegt, nicht hier.

---
