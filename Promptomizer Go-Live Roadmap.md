# Promptomizer Go-Live Roadmap

## Ziel
Promptomizer in einen Zustand bringen, in dem:
- Nutzer sicher registrieren und arbeiten koennen
- ein bezahlter Plan technisch wirklich kaufbar ist
- rechtliche Aussagen mit dem tatsaechlichen Produkt uebereinstimmen
- das Produkt bei echtem Traffic stabil und vertrauenswuerdig wirkt

## Status
Zahlungsfluss fuer den Pro-Plan ist live getestet und funktioniert. Weitere Launch-Themen ausserhalb des Billing-Flows bleiben offen.

---

## Phase 1: Harte Launch-Blocker
Diese Punkte muessen vor einem bezahlten Start erledigt sein.

### 1. Zahlungsfluss wirklich fertigstellen
- [x] Stripe Checkout oder Stripe Customer Portal technisch integrieren
- [x] Upgrade-Button im Produkt an echten Kaufprozess anbinden
- [x] erfolgreichem Kauf ein verlaessliches `tier = pro` zuweisen
- [x] Kuendigung, Downgrade und Rueckfall auf `free` technisch abbilden
- [x] Testkaeufe vollstaendig durchspielen
- [x] pruefen, ob Rechnungen, Steuern und Kundendaten korrekt verarbeitet werden

**Warum kritisch**
Der Pro-Plan wird beworben, ist aber aktuell nicht kaufbar. Damit kannst du keinen serioesen SaaS monetarisieren.

### 2. Planstatus im UI korrigieren
- [x] Sidebar-Logik korrigieren, damit eingeloggte Nutzer nicht automatisch als `Pro Plan` angezeigt werden
- [x] ueberall denselben Tier-Status verwenden
- [x] Free-/Pro-Grenzen konsistent im gesamten Produkt darstellen
- [x] Upgrade-Hinweise nur dann zeigen, wenn sie fachlich korrekt sind

**Warum kritisch**
Falsche Plananzeigen zerstoeren Vertrauen und fuehren zu Supportfaellen und Streit bei zahlenden Kunden.

### 3. Frontend-XSS und unsichere DOM-Injektionen beheben
- [x] alle `innerHTML`-Stellen pruefen, die Nutzerdaten rendern
- [x] Prompt-Namen, Snippet-Namen, Kategorien und Favoriten nur escaped oder per `textContent` rendern
- [x] ein einheitliches Sanitizing-Konzept einfuehren (`escapeHtml` fuer Markup, `jsArg` fuer Inline-Handler-Argumente)
- [x] Regressionstest fuer gespeicherte Inhalte mit Sonderzeichen und HTML-Payloads machen (manuell im Browser gegen alle Render-Pfade gefahren)

**Warum kritisch**
Das ist ein echtes Sicherheitsproblem. Nutzerinhalte duerfen nicht unkontrolliert als HTML zurueck ins DOM geschrieben werden.

### 4. Edge Functions und Backend-Flaechen absichern
- [x] pruefen, ob die Welcome-Mail-Function oeffentlich missbraucht werden kann (war sie: anon-Key genuegte, beliebige Empfaenger moeglich)
- [x] Authentifizierung oder Signaturpruefung fuer Function-Aufrufe einbauen (Shared Secret `WELCOME_EMAIL_SECRET` + User-Existenz-Check)
- [x] Rate Limiting / Abuse-Schutz fuer Mail-Versand definieren (Einmal-Versand pro Account via `profiles.welcome_email_sent_at`)
- [x] Secrets, Trigger und Zugriffsregeln in Supabase sauber dokumentieren (`supabase/functions/send-welcome-email/README.md`)
- [x] Logging fuer Fehler und Missbrauch aktivieren (abgelehnte Aufrufe und Fehler landen in den Edge-Function-Logs)

**Deployment erledigt (12.06.2026):** Secret gesetzt, Migration angewendet, Function deployed, `x-welcome-secret`-Header im Webhook ergaenzt, doppelter Webhook geloescht. End-to-End verifiziert: ohne Secret 401, unbekannter User 403, echter Signup loest genau eine Mail aus, Wiederholungsaufrufe werden uebersprungen.

**Warum kritisch**
Sobald E-Mail-Versand offen angreifbar ist, riskierst du Spam, Kosten und Reputationsschaeden.

### 5. Rechtstexte mit realem Produkt abgleichen
- [ ] AGB, Datenschutz und Widerruf mit tatsaechlichem Produktverhalten abgleichen
- [ ] nur Zahlungsanbieter nennen, die wirklich live sind
- [ ] nur Kuendigungswege nennen, die technisch existieren
- [ ] Aussagen zu Rechnungen, Vertragsabschluss und Pro-Features auf Realitaet reduzieren
- [ ] final juristisch pruefen lassen, wenn du zahlende Privatkunden bedienen willst

**Warum kritisch**
Die Texte beschreiben heute schon Ablaeufe, die das Produkt technisch noch nicht erfuellt.

---

## Phase 2: Produktreife vor Launch
Diese Punkte sind nicht optional, wenn du naechste Woche echte Nutzer gewinnen willst.

### 6. Auth- und Account-Flows komplett testen
- [x] Registrierung (Formular-Validierung getestet: Submit erst nach AGB-Haken aktiv; E2E mit echtem Mail-Empfang -> manueller Resttest, s.u.)
- [x] E-Mail-Bestaetigung (Verify-Link bestaetigt Account, Session wird per URL-Fragment uebernommen, UI zeigt User + korrekt FREE PLAN)
- [x] Login (per Formular-Button und per API getestet)
- [x] Logout (Session aus Storage entfernt, UI zurueck auf Gast)
- [x] Passwort zuruecksetzen (Recovery-Link -> `modal-password-new` erscheint -> Speichern; neues Passwort akzeptiert, altes wird abgelehnt)
- [ ] Passwort vergessen: Anfrage-Formular bewusst nicht abgesendet (haette echte Mail an Testadresse ausgeloest); die kritische Link-Verarbeitung ist getestet. Manuell: einmal mit echter Adresse anfordern und Mail-Empfang pruefen
- [ ] Google Login: manuell testen (OAuth-Consent laesst sich nicht automatisieren)
- [ ] Verhalten mit deaktivierten Cookies / Consent-Szenarien: manuell auf der Live-Domain pruefen (Cookiebot laeuft auf localhost nicht — "domain not authorized")

**Getestet am 12.06.2026 (lokale Preview gegen Live-Supabase, Testuser danach geloescht). Zwei Fixes dabei:**
1. `site_url` in der Supabase-Auth-Config war kaputt (` promptomizer.vercel.app` — fuehrendes Leerzeichen, kein `https://`, falsche Domain). Bestaetigungs-Mails haetten Nutzer auf eine kaputte/falsche URL geleitet. Jetzt: `https://www.promptomizer.de`.
2. `registerUser` gibt jetzt `emailRedirectTo: window.location.origin` mit (wie `resetPasswordForEmail`), damit der Bestaetigungslink zur Domain zurueckfuehrt, auf der registriert wurde.

**Done-Definition**
Jeder Flow funktioniert auf Desktop und Mobile ohne manuelle Nacharbeit. (Mobile-Durchgang gehoert zu Punkt 10.)

### 7. Supabase-RLS und Datenzugriffe auditieren
- [x] fuer `profiles`, `library`, `prompt_history`, `snippets`, `prompt_categories` alle Policies pruefen (RLS auf allen 5 Tabellen aktiv, Owner-Checks via `auth.uid()` vorhanden)
- [x] sicherstellen, dass Nutzer nur ihre eigenen Daten lesen und schreiben koennen (kritischer Fund behoben: Clients konnten eigene `profiles`-Spalten wie `tier` und `stripe_customer_id` frei updaten -> Self-Upgrade auf Pro und Zugriff auf fremde Stripe-Portale moeglich; jetzt per Spalten-Grants auf `onboarding_completed` beschraenkt, anon komplett ohne Tabellenzugriff)
- [x] pruefen, ob Updates/Deletes still scheitern (db.js prueft bei kritischen Pfaden bereits `select()`-Rueckgaben; RLS-Verhalten verifiziert)
- [x] Free-Limit-Logik serverseitig belastbar machen (Trigger gehaertet: `SET search_path`, Advisory Lock gegen Race bei parallelen Inserts; Limit + `FREE_LIMIT_REACHED` end-to-end mit Testuser verifiziert)
- [x] Sonderfaelle testen: geloeschte Accounts (FK `ON DELETE CASCADE` auf allen Tabellen, Kaskade verifiziert), doppelte Requests / parallele Tabs (Unique-Index `prompt_categories(user_id, name)`, Advisory Lock im Limit-Trigger)

**Audit durchgefuehrt und deployed (12.06.2026):** Migration `20260612130000_harden_rls_and_free_limit.sql`. End-to-End-Tests mit echtem Testuser gegen die Live-DB: `tier`-Update 403, `stripe_customer_id`-Update 403, `onboarding_completed`-Update 200, anon-Lesezugriff 401, Insert mit fremder `user_id` 403, 11. Library-Insert blockiert mit `FREE_LIMIT_REACHED`, Cross-Tenant-Lese-Leck negativ, Account-Loeschung kaskadiert sauber. Zusaetzlich `profiles_tier_check` (nur `free`/`pro`), `NOT NULL` auf `library.user_id` / `prompt_history.user_id`, `.gitignore` fuer `supabase/.temp/` (enthaelt Secrets).

**Warum kritisch**
Ein SaaS mit schwacher Multi-Tenant-Trennung ist geschaeftlich nicht tragbar.

### 8. Service Worker und Caching ueberarbeiten
- [x] pruefen, ob `sw.js` veraltete Versionen zu aggressiv cached (tat er: Cache-first fuer alles inkl. `index.html` und Tailwind-CDN — Releases haetten Bestandsnutzer nie erreicht)
- [x] keine kritischen CDN-Abhaengigkeiten blind offline cachen (kein Caching mehr)
- [x] sauber definieren, wann neue Releases ausgeliefert werden (ohne Service Worker: sofort beim naechsten Seitenaufruf, direkt vom Server/Vercel-CDN)
- [x] Update-Verhalten nach Deployment testen (Kill-Switch in Preview verifiziert: alter Cache geloescht, Registrierung entfernt, Tab neu geladen, App laeuft)
- [x] Fallbacks fuer defekte oder stale Caches einbauen (Kill-Switch raeumt alle Caches ab)

**Entscheidung (12.06.2026):** Der Worker wurde im aktuellen Code gar nicht mehr registriert — aber vom 04.01. bis 16.01.2026 war eine Registrierung live. Clients aus dem Fenster haengen auf dem alten Cache-first-Worker fest. `sw.js` ist jetzt ein Kill-Switch: ersetzt beim naechsten Besuch den Alt-Worker (Browser prueft sw.js bei Navigation/24h), loescht alle Caches, deregistriert sich, laedt offene Tabs neu. Danach laeuft die App ohne Service Worker — solange alles Wesentliche eine Supabase-Verbindung braucht, bringt ein Offline-Cache nur Staleness-Risiken. `sw.js` muss mit deployt werden und darf nicht geloescht werden, solange Alt-Clients existieren koennen.

**Warum kritisch**
Veraltete Assets im Browser sind ein haeufiger Grund fuer "bei mir funktioniert's nicht".

### 9. UI auf Vertrauensniveau bringen
- [x] veraltete Hinweise entfernen: `Early Access bis 01.04.2026` aus dem Header entfernt (Datum lag in der Vergangenheit)
- [x] "bald verfuegbar"-Elemente beseitigt: der deaktivierte Platzhalter-Button "Konto löschen — demnächst verfügbar" ist jetzt ein funktionierender "Konto-Löschung beantragen"-Button (mailto an info@promptomizer.de mit vorausgefülltem Betreff/Text), der dem in Datenschutz/AGB dokumentierten Löschweg entspricht
- [x] alle toten Buttons und Platzhalterlinks beseitigt: tote Funktion `handlePromptCategoryPlaceholder` ("Kategorie-Funktion folgt im nächsten Schritt") entfernt (hatte keinen Aufrufer); keine weiteren toten Buttons/`href="#"` gefunden
- [x] konsistente Fehlermeldungen statt `alert()`-Popups: einheitliche, nicht-blockierende `showToast(message, type)`-Komponente (error/info/success) eingefuehrt; alle 24 `alert()`-Aufrufe in `index.html` und `db.js` ersetzt; entwickler-orientierte Texte (RLS-Policy-Hinweis, Supabase-Function-Secrets) wandern in `console.error` statt vor den Nutzer
- [x] klare Erfolgs- und Fehlerzustaende: Toast-Typen visuell unterschieden (Rand-Farbe), `role="alert"` fuer Fehler / `role="status"` fuer Rest, Auto-Ausblenden nach 4s (6s bei Billing-Fehlern)

**Erledigt (13.06.2026), im Browser verifiziert** (Toasts rendern korrekt, echter Validierungspfad `handleCopyAndSave` feuert Toast statt `alert`, keine Konsolen-Fehler, Header sauber, Lösch-Button ist echter mailto-Link).

**Bewusst nicht geaendert:** Die Hinweise "Stripe-Testabo verfügbar" / "Wechsel in den Stripe-Testcheckout" im Konto-Bereich. Stripe laeuft aktuell im Sandbox-/Testmodus (`metadata[env]=sandbox` in `_shared/stripe.ts`) — die "Test"-Formulierung ist also ehrlich. Beim Umstellen auf den Stripe-Live-Modus muessen diese Texte (und Punkt 5, Rechtstexte) angepasst werden.

**Warum kritisch**
Menschen zahlen nicht fuer etwas, das unfertig wirkt.

### 10. Mobile und Cross-Browser testen
- [ ] Chrome Desktop
- [ ] Safari iPhone
- [ ] Chrome Android
- [ ] Firefox Desktop
- [ ] Edge Desktop
- [ ] Fokus auf Editor, Login, Bibliothek, Speichern, Upgrade-Flow

**Done-Definition**
Keine Layout-Brueche, keine blockierenden UX-Bugs, keine unbedienbaren Modals.

### 10b. Tote Duplikat-Funktionen in index.html entfernen
Nebenbefund aus dem XSS-Audit (12.06.2026): `loadSnippetsForField` und `loadSnippetsForFieldDemo` sind in `index.html` doppelt definiert (erste Definitionen ca. Zeile 4014-4095, zweite ca. Zeile 4774-4780). Die spaeteren Definitionen ueberschreiben die frueheren — die ersten Versionen (mit eigenem Rendering in `#library-snippets`) sind toter Code.
- [x] per Suche verifizieren, welche Definition zuletzt im Script steht und damit aktiv ist (Befund: beide Definitions-Paare hatten keinerlei Aufrufer mehr — auch die spaeteren waren tot)
- [x] die toten Definitionen entfernen (beide Paare plus das nur von dort referenzierte `insertSnippet`; `insertSnippetText`/`insertSnippetEncoded` bleiben, die nutzt das lebende Accordion)
- [x] im Browser pruefen (Accordion oeffnet/laedt Kategorien korrekt, Feld-Fokus setzt `activeFieldId`, keine Konsolen-Fehler)

**Erledigt (12.06.2026), ein Hinweis:** Das frueher angedachte Verhalten "Klick auf ein Editor-Feld oeffnet automatisch die passende Baustein-Kategorie" existiert im Live-Code nicht (und existierte auch vor dem Aufraeumen nicht — es starb, als die Accordion-Sidebar die alte Render-Logik abloeste). Feld-Fokus markiert nur das aktive Feld; Kategorien oeffnet man im Accordion. Falls das Auto-Oeffnen gewuenscht ist, waere das ein kleines Feature (Fokus-Handler -> `openSnippetCategory(fieldId)`), kein Cleanup.

**Warum sinnvoll**
Kein Bug, aber toter Code taeuscht beim Lesen falsches Verhalten vor (das XSS-Audit waere fast daran haengen geblieben) und vergroessert die Angriffsflaeche bei kuenftigen Aenderungen.

---

## Phase 3: Betriebsfaehigkeit
Damit du nach dem Launch nicht blind bist.

### 11. Monitoring und Fehlertracking einbauen
- [ ] Frontend-Error-Tracking einrichten
- [ ] Supabase-Logs aktiv beobachten
- [ ] Edge-Function-Fehler sichtbar machen
- [ ] kritische Metriken definieren:
  - [ ] Registrierungen
  - [ ] Verifikationen
  - [ ] aktive Nutzer
  - [ ] gespeicherte Prompts
  - [ ] Upgrade-Klicks
  - [ ] bezahlte Conversions
  - [ ] Kuendigungen
- [ ] Alerting fuer Ausfaelle oder Mailfehler einrichten

### 12. Support- und Recovery-Prozesse vorbereiten
- [ ] klaren Support-Kanal festlegen
- [ ] Passwort-/Account-Probleme manuell loesen koennen
- [ ] Nutzer manuell auf `pro/free` setzen koennen, falls Stripe/Supabase ausfaellt
- [ ] Backup- und Restore-Strategie klaeren
- [ ] Loeschanfragen und Datenexport-Prozess definieren

### 13. Deployment und Release-Prozess absichern
- [ ] feste Deployment-Umgebung definieren
- [ ] keine unkontrollierten CDN-`latest`-Abhaengigkeiten im Produkt lassen
- [ ] Rollback-Plan erstellen
- [ ] Pre-Launch-Checkliste fuer jedes Deployment schreiben
- [ ] Staging oder Testumgebung fuer letzte Freigaben aufbauen

---

## Phase 4: Conversion und Geschaeft
Nicht technisch blockerhaft, aber wichtig fuer Umsatz.

### 14. Preisversprechen validieren
- [ ] pruefen, ob `3,99 EUR / Monat` wirtschaftlich tragfaehig ist
- [ ] Support-, Zahlungs-, Mail- und Infrastrukturkosten gegenrechnen
- [ ] Free-Plan so gestalten, dass Upgrade-Druck real entsteht
- [ ] klar definieren, warum jemand zahlen soll

### 15. Upgrade-Wert klarer machen
- [ ] Pro-Value-Proposition schaerfen
- [ ] Benefits nicht nur nennen, sondern im UI sichtbar machen
- [ ] Upgrade-Trigger an sinnvollen Stellen platzieren
- [ ] Testen, ob Free-Limit wirklich zu Upgrades fuehrt oder nur frustriert

### 16. Datenschutz- und Vertrauenssignale verbessern
- [ ] Impressum, Datenschutz, AGB leicht auffindbar halten
- [ ] klare Aussage zu Datenspeicherung und KI-Nutzung machen
- [ ] Consent-Flow sauber testen
- [ ] falls noetig AV-Vertraege / Drittanbieteruebersicht vorbereiten

---

## Empfohlene Reihenfolge
1. Zahlungsfluss
2. Planstatus im UI
3. XSS / DOM-Sicherheit
4. Backend- und Function-Sicherheit
5. Rechtstexte an Realitaet anpassen
6. Auth- und RLS-Tests
7. Service Worker / Caching
8. UI-Vertrauensprobleme entfernen
9. Monitoring / Support / Deployment
10. Conversion-Optimierung

---

## Minimaler Launch-Standard
Nur wenn alle Punkte erfuellt sind:

- [x] Nutzer koennen sich zuverlaessig registrieren und anmelden (Kern-Flows getestet; Restpunkte: manueller Mail-Empfang-Check + Google-OAuth, s. Punkt 6)
- [x] Free und Pro sind technisch korrekt getrennt
- [x] Pro kann tatsaechlich gekauft werden
- [x] Kuendigung / Downgrade funktionieren
- [x] keine bekannten XSS- oder groben Sicherheitsluecken offen (Punkte 3, 4 und 7 erledigt)
- [ ] Rechtstexte passen zum echten Produkt
- [x] keine offensichtlichen Platzhalter oder Fake-CTAs mehr im Produkt
- [ ] Fehlertracking und Basis-Monitoring sind aktiv
- [ ] Mobile und Desktop wurden einmal sauber durchgetestet

---

## Meine Einschaetzung
Wenn du naechste Woche wirklich Umsatz machen willst, wuerde ich den Scope brutal reduzieren:
- zuerst saubere Auth
- dann stabiler Prompt-Speicher
- dann echter Stripe-Upgrade-Flow
- dann nur ein kleiner, aber ehrlicher Free/Pro-Funnel

Alles, was "spaeter" ist, darf sichtbar unfertig sein.
Nichts, was Geld, Sicherheit oder Vertrauen betrifft, darf unfertig sein.
