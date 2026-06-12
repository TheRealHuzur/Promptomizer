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
- [ ] Registrierung
- [ ] E-Mail-Bestaetigung
- [ ] Login
- [ ] Logout
- [ ] Passwort vergessen
- [ ] Passwort zuruecksetzen
- [ ] Google Login
- [ ] Verhalten mit deaktivierten Cookies / Consent-Szenarien pruefen

**Done-Definition**
Jeder Flow funktioniert auf Desktop und Mobile ohne manuelle Nacharbeit.

### 7. Supabase-RLS und Datenzugriffe auditieren
- [ ] fuer `profiles`, `library`, `prompt_history`, `snippets`, `prompt_categories` alle Policies pruefen
- [ ] sicherstellen, dass Nutzer nur ihre eigenen Daten lesen und schreiben koennen
- [ ] pruefen, ob Updates/Deletes still scheitern
- [ ] Free-Limit-Logik serverseitig belastbar machen
- [ ] Sonderfaelle testen: geloeschte Accounts, doppelte Requests, parallele Tabs

**Warum kritisch**
Ein SaaS mit schwacher Multi-Tenant-Trennung ist geschaeftlich nicht tragbar.

### 8. Service Worker und Caching ueberarbeiten
- [ ] pruefen, ob `sw.js` veraltete Versionen zu aggressiv cached
- [ ] keine kritischen CDN-Abhaengigkeiten blind offline cachen
- [ ] sauber definieren, wann neue Releases ausgeliefert werden
- [ ] Update-Verhalten nach Deployment testen
- [ ] Fallbacks fuer defekte oder stale Caches einbauen

**Warum kritisch**
Veraltete Assets im Browser sind ein haeufiger Grund fuer "bei mir funktioniert's nicht".

### 9. UI auf Vertrauensniveau bringen
- [ ] veraltete Hinweise entfernen, z. B. `Early Access bis 01.04.2026`
- [ ] "bald verfuegbar"-Elemente aus bezahlungsnahen Bereichen entfernen
- [ ] alle toten Buttons und Platzhalterlinks beseitigen
- [ ] konsistente Fehlermeldungen statt `alert()`-Popups einbauen
- [ ] klare Erfolgs- und Fehlerzustaende definieren

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
- [ ] per Suche verifizieren, welche Definition zuletzt im Script steht und damit aktiv ist
- [ ] die toten ersten Definitionen entfernen
- [ ] im Browser pruefen, dass das Klicken auf ein Editor-Feld weiterhin die passende Baustein-Kategorie in der linken Sidebar oeffnet

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

- [ ] Nutzer koennen sich zuverlaessig registrieren und anmelden
- [x] Free und Pro sind technisch korrekt getrennt
- [x] Pro kann tatsaechlich gekauft werden
- [x] Kuendigung / Downgrade funktionieren
- [ ] keine bekannten XSS- oder groben Sicherheitsluecken offen
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
