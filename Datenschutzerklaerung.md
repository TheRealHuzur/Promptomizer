# Datenschutzerklärung

Stand: 16. Juli 2026

## 1. Datenschutz auf einen Blick

### Allgemeine Hinweise

Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie Promptomizer.de nutzen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.

### Datenerfassung auf dieser Website

**Wer ist verantwortlich?**
Die Datenverarbeitung erfolgt durch den Websitebetreiber. Kontaktdaten siehe Impressum.

**Welche Daten erfassen wir?**
- Daten, die Sie bei der Registrierung und Nutzung aktiv eingeben (E-Mail-Adresse, gespeicherte Prompts)
- Technische Daten, die beim Besuch automatisch erfasst werden (IP-Adresse, Browser, Betriebssystem)

**Wofür nutzen wir Ihre Daten?**
Zur Bereitstellung und Verbesserung des Dienstes, zur Abwicklung von Abonnements sowie zur Kommunikation mit Ihnen.

**Welche Rechte haben Sie?**
Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit, Widerspruch. Details siehe Abschnitt 3.

---

## 2. Hosting

### IONOS

Wir nutzen IONOS für die Domain und DNS-Verwaltung von Promptomizer.de. Anbieter ist die IONOS SE, Elgendorfer Str. 57, 56410 Montabaur. Details: https://www.ionos.de/terms-gtc/terms-privacy

Die Nutzung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an zuverlässigem Betrieb). Ein Auftragsverarbeitungsvertrag (AVV) wurde geschlossen.

### Vercel

Das Frontend von Promptomizer.de wird über Vercel bereitgestellt. Anbieter ist die Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA.

Beim Aufruf der Website erfasst Vercel technische Zugriffsdaten (IP-Adresse, Browsertyp, aufgerufene Seiten, Zeitstempel). Diese Daten werden zur Auslieferung der Anwendung und zur Fehlerbehebung verwendet.

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Vercel verfügt über eine Zertifizierung nach dem EU-US Data Privacy Framework. Ein AVV wurde abgeschlossen. Weitere Informationen: https://vercel.com/legal/privacy-policy

### Supabase

Nutzerdaten (Konten, gespeicherte Prompts, Authentifizierung) werden bei Supabase gespeichert. Anbieter ist die Supabase Inc., 970 Trestle Glen Rd, Oakland, CA 94610, USA. Das konkrete Supabase-Projekt und seine produktive Datenbank sind in **eu-central-1, Frankfurt**, eingerichtet. Supabase kann daneben für Support, Sicherheit, Abrechnung oder technische Administration weitere Daten entsprechend seinen eigenen Vertrags- und Datenschutzbedingungen verarbeiten.

Supabase verarbeitet insbesondere folgende Daten:
- E-Mail-Adresse und Passwort-Hash bei Registrierung
- Nutzer-ID
- Registrierungs- und Bestätigungszeitpunkte
- Sitzungs- und Authentifizierungsdaten
- Onboarding-Status
- Gespeicherte Prompts, Prompt-Verlauf, Bausteine und Kategorien
- Plan-Status (Free/Pro) und Nutzungsmetadaten
- Stripe-Kunden-, Abonnement- und Preiskennungen
- Abrechnungsintervall und Abonnementstatus

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO. Ein AVV wurde abgeschlossen. Weitere Informationen: https://supabase.com/privacy

### Sentry (Fehler-Tracking)

Zur Erkennung und Behebung technischer Fehler setzen wir Sentry ein. Anbieter ist Functional Software, Inc. (Sentry), 45 Fremont Street, 8th Floor, San Francisco, CA 94105, USA. Die Event-Datenregion ist auf EU eingestellt, die Datenübermittlung erfolgt an die europäische Ingestion-Region (`ingest.de.sentry.io`).

Zum Schutz Ihrer Daten sind mehrere Maßnahmen kombiniert:
- Ein clientseitiger `beforeSend`-Filter entfernt beziehungsweise bereinigt Felder wie E-Mail-Adresse, Authorization, Passwort, Prompt und Content, bevor ein Fehler-Event überhaupt gesendet wird.
- Zusätzlich ist im Sentry-Dashboard Data Scrubbing aktiviert.
- Die Speicherung von IP-Adressen ist deaktiviert.
- Die Aufbewahrungsdauer beträgt aktuell 30 Tage.
- Es wird kein Session Replay eingesetzt.

Trotz dieser Maßnahmen kann Sentry technisch bedingt kurzfristig Verbindungsdaten verarbeiten (z. B. im Rahmen der Zustellung eines Events); eine Übermittlung einer IP-Adresse an den Anbieter kann daher nicht absolut ausgeschlossen werden. Sentry dient ausschließlich der technischen Fehleranalyse, nicht der Werbung oder dem Nutzertracking.

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem funktionsfähigen, fehlerfreien Dienst). Ein AVV wurde abgeschlossen. Weitere Informationen: https://sentry.io/privacy/

### Cookiebot (Consent-Management)

Zur Einholung und Verwaltung Ihrer Cookie-Einwilligung nutzen wir Cookiebot. Anbieter ist die Usercentrics A/S, Havnegade 39, 1058 Kopenhagen, Dänemark.

Beim Aufruf der Website wird ein technisch notwendiger Cookie (`CookieConsent`) gesetzt, der Ihre Einwilligungsentscheidung für die aktuelle Domain speichert (Speicherdauer: aktuell ein Monat). Dabei können insbesondere folgende Daten verarbeitet werden: Einwilligungsstatus, Consent-ID, Datum und Uhrzeit der Entscheidung, Domain, Browser- und Geräteinformationen sowie technisch erforderliche Verbindungsdaten.

Die technische Verarbeitung erfolgt nach der aktuell eingesetzten Konfiguration innerhalb der Europäischen Union beziehungsweise des Europäischen Wirtschaftsraums, insbesondere in Irland.

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer rechtskonformen Einwilligungsverwaltung) bzw. Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Pflicht zur Einholung wirksamer Einwilligungen). Ein AVV wurde abgeschlossen. Weitere Informationen: https://www.cookiebot.com/de/privacy-policy/

---

## 3. Allgemeine Hinweise und Pflichtinformationen

### Verantwortliche Stelle

Patrick Roßkothen
Mercatorstraße 108
47051 Duisburg
E-Mail: info@promptomizer.de
Telefon: 0177 / 35 22 745

### Speicherdauer

Ihre Daten werden gespeichert, solange Ihr Konto aktiv ist oder solange es für die Vertragserfüllung erforderlich ist.

Bei erfolgreicher Kontolöschung werden die aktiven, unmittelbar mit dem Konto verbundenen Nutzerdaten aus dem Produktivsystem gelöscht. Technisch notwendige Sicherungskopien (Backups) können bis zu ihrer planmäßigen Überschreibung fortbestehen; die aktuelle Backup-Konfiguration sieht eine automatische Überschreibung nach 7 Tagen vor.

Gesetzlich aufzubewahrende Rechnungs- und Geschäftsdaten werden von der Löschung ausgenommen, gesperrt und erst nach Ablauf der gesetzlichen Fristen gelöscht. Rechnungen und andere Buchungsbelege werden grundsätzlich acht Jahre aufbewahrt; für andere steuerlich oder handelsrechtlich relevante Unterlagen können abweichende gesetzliche Aufbewahrungsfristen gelten.

### Rechtsgrundlagen

Wir verarbeiten Ihre Daten auf folgenden Rechtsgrundlagen:
- **Art. 6 Abs. 1 lit. a DSGVO** – Einwilligung (z. B. Cookie-Consent)
- **Art. 6 Abs. 1 lit. b DSGVO** – Vertragserfüllung (Konto, Abo)
- **Art. 6 Abs. 1 lit. c DSGVO** – Rechtliche Verpflichtung (Rechnungsaufbewahrung)
- **Art. 6 Abs. 1 lit. f DSGVO** – Berechtigtes Interesse (Betrieb und Sicherheit der Plattform)

### Ihre Rechte

Sie haben jederzeit das Recht auf:
- **Auskunft** über Ihre gespeicherten Daten (Art. 15 DSGVO)
- **Berichtigung** unrichtiger Daten (Art. 16 DSGVO)
- **Löschung** Ihrer Daten (Art. 17 DSGVO)
- **Einschränkung** der Verarbeitung (Art. 18 DSGVO)
- **Datenübertragbarkeit** (Art. 20 DSGVO)
- **Widerspruch** gegen die Verarbeitung (Art. 21 DSGVO)

Zur Ausübung dieser Rechte wenden Sie sich an: info@promptomizer.de

Sie haben außerdem das Recht, sich bei der zuständigen Datenschutzaufsichtsbehörde zu beschweren. In Nordrhein-Westfalen ist dies die Landesbeauftragte für Datenschutz und Informationsfreiheit NRW (https://www.ldi.nrw.de).

### SSL-/TLS-Verschlüsselung

Promptomizer.de nutzt aus Sicherheitsgründen eine SSL-/TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennen Sie am „https://" in der Adresszeile sowie am Schloss-Symbol Ihres Browsers.

### Widerruf Ihrer Einwilligung

Soweit eine Verarbeitung auf Ihrer Einwilligung beruht, können Sie diese Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen (z. B. über die Cookie-Einstellungen oder per E-Mail an info@promptomizer.de). Die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung bleibt unberührt.

---

## 4. Datenerfassung auf Promptomizer.de

### Cookies und Browserspeicher

Cookiebot setzt den technisch notwendigen `CookieConsent`-Cookie zur Speicherung Ihrer Einwilligungsentscheidung (siehe Abschnitt 2).

Darüber hinaus nutzt die Anwendung Local Storage beziehungsweise Session Storage für technisch erforderliche Funktionen. Dazu gehören je nach Nutzung:
- Authentifizierungs- und Sitzungstokens
- die Einstellung „Angemeldet bleiben"
- der Onboarding-Status
- temporäre Gast-Historie
- technische UI- und Warnzustände

Session-Storage-Daten werden grundsätzlich mit dem Ende der Browsersitzung gelöscht. Local-Storage-Daten bleiben bis zur Löschung durch die Anwendung oder den Nutzer gespeichert.

Rechtsgrundlage für zwingend erforderliche Zugriffe ist § 25 Abs. 2 TDDDG in Verbindung mit Art. 6 Abs. 1 lit. b beziehungsweise lit. f DSGVO. Nicht notwendige Speicherungen erfolgen nur nach Einwilligung.

Sie können Ihre Cookie-Einstellungen jederzeit über den Link „Cookie-Einstellungen" in der App anpassen.

### Registrierung und Nutzerkonto

Für die dauerhafte cloudbasierte Speicherung und die Nutzung eines persönlichen Kontos ist eine Registrierung erforderlich; Teile des Editors können auch ohne Registrierung als Gast genutzt werden.

Bei der Registrierung erheben wir:
- E-Mail-Adresse
- Passwort (gespeichert als sicherer Hash, nicht im Klartext)
- Zeitpunkt der Registrierung
- Plan-Status (Free oder Pro)

Bestätigungs- und Passwort-Reset-Mails werden über Supabase Auth abgewickelt. Zusätzlich erfolgt eine einmalige Willkommensmail über Brevo (siehe eigener Abschnitt unten). Alternativ zur Registrierung mit E-Mail-Adresse und Passwort ist optional eine Anmeldung mit Google möglich (siehe eigener Abschnitt unten).

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO zur Vertragserfüllung. Diese Daten werden an Supabase als Auftragsverarbeiter übermittelt.

### Gespeicherte Prompts und Inhalte

Prompts, Kategorien und Bausteine, die Sie in der App erstellen und speichern, werden in unserer Datenbank (Supabase) gespeichert. Diese Inhalte gehören Ihnen. Wir verwenden sie ausschließlich zur Erbringung des Dienstes und nicht für eigene Zwecke. Insbesondere werden Ihre Inhalte nicht zum Training eigener oder fremder KI-Modelle verwendet; die Anwendung übermittelt gespeicherte Prompts nicht automatisch an OpenAI, Anthropic, Google Gemini oder andere generative KI-Dienste.

Sie können Ihre Inhalte jederzeit selbst löschen. Das Konto kann in den Kontoeinstellungen selbst gelöscht werden; bei aktivem Pro-Abonnement wird die Kontolöschung technisch blockiert, das Abonnement muss zunächst gekündigt und beendet werden. Anschließend kann das auf Free zurückgestufte Konto gelöscht werden. Rechteanfragen können zusätzlich weiterhin an info@promptomizer.de gerichtet werden.

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO.

### Zahlungsabwicklung (Stripe)

Für die Abwicklung von Abonnements setzen wir Stripe für den Bestellvorgang, die Zahlungsabwicklung, die Abonnementverwaltung und die Bereitstellung der Rechnungen ein. Anbieter ist die Stripe Inc., 510 Townsend Street, San Francisco, CA 94103, USA (für EU-Nutzer: Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, Irland).

Stripe verarbeitet dabei insbesondere:
- Zahlungsdaten (je nach Verfügbarkeit Kreditkarte, Apple Pay, Google Pay, Amazon Pay, PayPal, Klarna, SEPA-Lastschrift)
- Rechnungsanschrift
- gegebenenfalls freiwillig beziehungsweise für die Abrechnung angegebene Umsatzsteuer-ID
- Stripe-Kundennummer
- Tarif und Abrechnungsintervall
- Preis-ID
- Abonnementstatus
- Rechnungsdaten
- Zahlungsstatus
- technische Betrugs- und Sicherheitsdaten

Wir speichern selbst keine vollständigen Zahlungsdaten. Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO. Ein AVV wurde mit Stripe abgeschlossen. Weitere Informationen: https://stripe.com/de/privacy

### Anmeldung mit Google

Die Anmeldung mit Google ist freiwillig. Alternativ bleibt die Anmeldung mit E-Mail-Adresse und Passwort möglich.

Beim Google-Login können Name, E-Mail-Adresse, Profilbild, Google-Nutzerkennung sowie technische Login-Daten verarbeitet werden. Es werden keine weitergehenden Google-Daten angefordert. Ihr Google-Passwort wird dabei nicht an Promptomizer übermittelt.

Anbieter für Nutzer im Europäischen Wirtschaftsraum ist grundsätzlich Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland.

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO. Weitere Informationen erhalten Sie in den Datenschutzinformationen von Google: https://policies.google.com/privacy

### Versand von Willkommens- und Servicemails über Brevo

Für den Mailversand setzen wir Brevo ein. Anbieter ist die Brevo SAS, 106 Boulevard Haussmann, 75008 Paris, Frankreich.

Brevo wird für die einmalige Willkommensmail nach der Registrierung und gegebenenfalls für technische Servicemails eingesetzt. Verarbeitet werden insbesondere E-Mail-Adresse, interne Nutzer-ID, verwendete Vorlage, Versandzeitpunkt, Zustellstatus und technische Fehlerdaten.

Es findet darüber kein Newsletter- oder Werbeversand statt, sofern keine separate Einwilligung eingeholt wird.

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO, ergänzend gegebenenfalls Art. 6 Abs. 1 lit. f DSGVO. Ein AVV wurde abgeschlossen.

### Kontaktaufnahme per E-Mail

Wenn Sie uns per E-Mail kontaktieren, werden Ihre Angaben (Name, E-Mail-Adresse, Nachrichteninhalt) zur Bearbeitung Ihrer Anfrage gespeichert. Eine Weitergabe erfolgt nur, soweit dies zur Bearbeitung der Anfrage erforderlich ist, ein beauftragter technischer Dienstleister eingesetzt wird oder eine gesetzliche Verpflichtung besteht.

Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an effektiver Bearbeitung von Anfragen) bzw. Art. 6 Abs. 1 lit. b DSGVO bei vertragsbezogenen Anfragen.

---

## 5. Analyse-Tools

Promptomizer.de setzt keine Web-Analyse-, Werbe- oder Marketingtracking-Tools ein. Das unter Abschnitt 2 genannte Sentry ist technisches Fehlertracking, Cookiebot ist Consent-Management — beide dienen nicht der Marketinganalyse. Sollte sich dies in Zukunft ändern, wird diese Datenschutzerklärung entsprechend aktualisiert und eine erneute Einwilligung eingeholt, sofern erforderlich.
