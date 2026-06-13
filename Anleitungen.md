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
- [ ] Commit-Nachricht beschreibt was und warum (nicht nur "fix")

### Nach dem Push

- [ ] Vercel-Dashboard aufmachen und prüfen, dass der Deploy-Status auf **Ready** wechselt (dauert ~30 Sekunden)
- [ ] `www.promptomizer.de` im Browser aufrufen und kurz die geänderte Stelle prüfen
- [ ] Sentry-Dashboard kurz checken — keine neuen Issues aufgetaucht

### Bei Stripe-relevanten Änderungen zusätzlich

- [ ] Stripe-Dashboard → Webhooks → letzten Event prüfen ob er ankam
- [ ] Einen Test-Checkout im Sandbox-Modus durchklicken

---

## Anleitung 4: CDN-Abhängigkeiten aktualisieren

### Überblick

Die App lädt mehrere Bibliotheken von externen CDN-Servern. Diese sind auf feste Versionen eingefroren, damit eine Aktualisierung beim Anbieter nichts kaputt machen kann.

| Bibliothek | Aktuelle Version | CDN |
|---|---|---|
| driver.js | 1.4.0 | jsdelivr |
| @supabase/supabase-js | 2.108.1 | jsdelivr |
| Font Awesome | 6.4.0 | cdnjs |
| Tailwind CSS | Play CDN (kein Pinning möglich) | tailwindcss.com |
| Google Fonts (Inter) | — (versionlos, stabil) | fonts.googleapis.com |
| Sentry | Hash in URL (effektiv eingefroren) | sentry-cdn.com |

**Tailwind-Sonderfall:** Der Play CDN von `cdn.tailwindcss.com` enthält einen JIT-Compiler, der beim Laden deine HTML-Klassen live scannt und CSS generiert. Eine fixe Version wäre nur mit einem Build-Schritt (Tailwind CLI) möglich, den das Projekt bewusst nicht hat. Das Risiko ist gering — Tailwind Labs ändert den Play CDN selten breaking.

### Wann und wie aktualisieren?

Nur aktualisieren wenn es einen konkreten Grund gibt (Sicherheitslücke, benötigtes Feature). Nicht blind auf "latest" aktualisieren.

1. Neue Version auf [npmjs.com](https://npmjs.com) oder im jeweiligen GitHub-Repo nachschlagen
2. In `index.html` die Versionsnummer in der URL ändern — z.B. `driver.js@1.4.0` → `driver.5.0`
3. Lokal testen (Port 4173, Konsole auf Fehler prüfen)
4. Committen und pushen

---
