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
