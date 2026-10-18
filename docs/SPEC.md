# SPEC – TIPPLAB (Neubau) · v1.0

> **Vorrang: [`docs/BRANDING.md`](BRANDING.md).** Seit 18.10.2026 heißt die App **BenchBet** (`https://bet.logge.top`, Repo `LoggeL/benchbet`), und die gesamte Oberfläche ist **englisch** (Mikrotexte, Fehler, Push, Manifest, OG, README). Routen sind englisch (`/bet/:id`, `/bet/:id/resolve`, `/bet/:id/edit`, `/new`, `/results`, `/leaderboard`, `/leaderboard/:name`, `/me`, `/how-it-works`); alte deutsche Pfade und `/#spiel-<id>` leiten um. Die deutschen Texte und Pfade in dieser SPEC beschreiben die Absicht; wo sie BRANDING.md widersprechen, gilt BRANDING.md.

Stand 18.10.2026 · Verbindliche Bauvorlage für `LoggeL/tipplab` → `https://tipplab.logge.top`
Quellen: `docs/internal/LEGACY_SPEC.md` (**L§**), `docs/internal/UX_AUDIT.md` (**A§**), Konzepte `docs/internal/concepts/speed.md`, `social.md`, `clarity.md`.
Wer dieses Dokument umsetzt, braucht keine der Quellen. Bei Widersprüchen gilt diese SPEC.

> **Achtung, öffentliches Repo.** `legacy/snapshot.json`, `legacy/live-api-logge.json`, `docs/audit/` (Screenshots als Logge) **und** die Textdokumente `docs/LEGACY_SPEC.md`, `docs/UX_AUDIT.md`, `docs/concepts/*.md` zitieren verdeckte Tippwerte offener Wetten. Vor dem ersten Commit wandern sie nach `docs/internal/` bzw. bleiben in `legacy/`. Beide Ordner stehen in `.gitignore` (§7.5). In dieser SPEC kommen nur Werte aus aufgelösten (öffentlichen) Wetten oder erfundene Beispiele vor (Spiel-ID ≥ 1063).

---

## 0. Konzeptbewertung und Synthese

### 0.1 Bewertung (1 = schwach, 5 = stark)

| Konzept | Tempo | Spaß | Klarheit | Umsetzbarkeit | Vollständigkeit | Kurzurteil |
|---|---|---|---|---|---|---|
| **Speed** („Tempo & Fokus“) | **5** | 3 | 4 | 4 | 5 | Bester Kern-Flow: Inbox, Wert im Button, Undo statt Dialog, Namenswahl inline, Anlegen auf einem Screen. Die Slider-Lupe und die Referenzmarken sind Aufwand mit wenig Nutzen. |
| **Social** („Sozial & Spannung“) | 3 | **5** | 3 | 2 | 5 | Die besten Momente: Siegel brechen, Verteilung nach dem Tipp, Reveal, Bündeln neuer Wetten. Dazu viel Ballast (Geräte-Token als Rechte, Kopplungscodes, dynamisches iOS-Manifest, Punktesystem neben der alten Rangliste, Duelle, Serien). Zwei Ranglisten verwirren. |
| **Clarity** („Klarheit & Vertrauen“) | 3 | 2 | **5** | 4 | 5 | Bestes Vertrauensmodell ohne Auth: Papierkorb, Verlauf, Korrektur, Wieder öffnen, `closedAt` getrennt von `closesAt`, Sichtbarkeit explizit. Bestätigungs-Sheet und Namens-Bestätigung kosten Taps. |

### 0.2 Was übernommen wird

- **Gerüst und Flows aus Speed:** Inbox `/` nach Handlungsbedarf, Detailroute als Push-Ziel, Tipp-Button mit Wert („61,5 Punkte tippen“), 5-s-Undo mit verzögertem Aufdecken, Namenswahl inline per Chips, Tipp-Serie („Weiter tippen“), Anlegen über Vorlagen auf einem Screen, Tippschluss-Chips.
- **Vertrauen aus Clarity:** kein Login und keine Geräte-Rechte. Absicherung über Papierkorb, öffentlichen Verlauf mit Gerätekennung, Ergebnis-Korrektur, Wieder öffnen, getrenntes `closedAt`, Regel-Kurzfassung, Lebenszyklus-Satz, Server als einzige Quelle der Phase.
- **Spannung aus Social:** Siegel-Chips, die nach dem Tipp aufklappen, Zahlenstrahl mit Verteilung und Insight-Zeile, Reveal beim ersten Ansehen eines Ergebnisses, Bündeln neuer Wetten, „Noch nicht dabei: …“, Tags pro Wette in der Mitteilungszentrale.
- **Bewusst verworfen (v1):** Punktesystem 3/2/1, Duelle, Serien, Titel, Reaktionen, Spruch zum Tipp, Anstupsen, Kopplungscodes, Geräte-Token als Rechteprüfung, Slider-Lupe, Referenzmarken, Spielerfarben-Wahl, Nachtruhe. Siehe §9.

---

## 1. Produkt

### 1.1 Leitprinzipien

1. **Der nächste Tipp ist einen Tap entfernt.** Push, Inbox-Zeile und geteilter Link führen direkt auf `/spiel/:id`, wo die Eingabe schon offen ist.
2. **Zwei Signale:** Die Phase der Wette (Offen · Endet bald · Geschlossen · Aufgelöst) und dein eigener Stand (Dein Tipp fehlt · Dein Tipp: 61 Punkte · Gewonnen) werden immer getrennt angezeigt.
3. **Wer du bist, steht immer oben** (Namens-Chip mit Initialen und Namen).
4. **Undo statt Dialog.** Bestätigungs-Sheets gibt es nur beim Löschen. Alles andere lässt sich rückgängig machen oder korrigieren.
5. **Live ohne Nachladen:** SSE, kein Refresh-Button, kein Skeleton-Flackern.
6. **Daten bleiben 1:1.** 14 Wetten, 46 Tipps, IDs, Ergebnisse und Rangliste werden exakt übernommen.
7. **Begriff:** In der UI heißt ein Spiel **„Wette“**. „Spiel“ taucht nur noch im Code auf (`game`).

### 1.2 Routen

| Route | Screen | Zugriff |
|---|---|---|
| `/` | **Offen** (Inbox) | alle |
| `/spiel/:id` | **Wette** (Detail) | alle |
| `/spiel/:id/aufloesen` | **Ergebnis eintragen** (Vollbild) | Verwalter (§2.4), sonst Redirect auf `/spiel/:id` |
| `/spiel/:id/bearbeiten` | **Wette bearbeiten** (Vollbild) | Verwalter |
| `/neu` | **Neue Wette** (Vorlage → Formular) | alle, Name wird bei Bedarf erfragt |
| `/ergebnisse` | **Ergebnisse** („Diese Woche“ + „Archiv“) | alle |
| `/rangliste` | **Rangliste** (Deine Bilanz + alle) | alle |
| `/rangliste/:name` | **Spieler** (Bilanz, Form, Historie) | alle |
| `/ich` | **Ich** (Name, Push, App, Design, Papierkorb, Admin) | alle |
| `/so-gehts` | **So geht's** (Regeln, Lebenszyklus, Push/iOS-Hilfe) | alle |
| `/*` sonst | **404** „Hier ist nichts. [Zu den offenen Wetten]“ | alle |

**Legacy-Deep-Links:** Beim Start prüft der Client `location.hash` auf `^#spiel-(\d+)$` und ersetzt die URL per `history.replaceState` durch `/spiel/<id>`. Die IDs bleiben beim Import erhalten.
**Query-Parameter:** `?von=push` (nur Statistik, kein Verhalten). Die Eingabe ist auf `/spiel/:id` ohnehin immer offen, wenn getippt werden kann.
**Router:** eigener Mini-Router (History API, ~80 Zeilen, `client/src/router.ts`), keine Router-Bibliothek. Zurück-Taste und Wischgeste funktionieren, die Scrollposition wird pro Route in `sessionStorage` gemerkt.

### 1.3 Shell und Navigation

```
┌──────────────────────────────────────────┐
│ KI/TIPPLAB.                ●  (NÖ) Nöl   │ Kopfzeile sticky 52 px · ● Live-Punkt · Namens-Chip → /ich
├──────────────────────────────────────────┤
│                 Inhalt                   │ max. 640 px breit, Ränder 16 px
├──────────────────────────────────────────┤
│  Offen ²   Ergebnisse •   (＋)   Rangliste│ Bottom-Bar sticky 64 px + safe-area-inset-bottom
└──────────────────────────────────────────┘
```

- **Wortmarke** `KI/TIPPLAB.` als Inline-SVG, Slash violett (`--result`), Punkt lime (`--accent`), wie in der alten App. Link auf `/`, `aria-label="TIPPLAB – offene Wetten"`.
- **Live-Punkt** (8 px): grün bei verbundenem SSE, grau bei getrennter Verbindung. `title="Live"` bzw. `"Keine Live-Verbindung"`.
- **Namens-Chip:** Kreis mit Initialen (Spielerfarbe, §1.10) und Name (max. 12 Zeichen, sonst mit „…“ gekürzt). `aria-label="Du bist Nöl – Einstellungen"`. Ohne Namen steht dort „Wer bist du?“, ein Tap öffnet den NamePicker als Sheet.
- **Bottom-Bar:** `Offen` mit Badge = Anzahl „Dein Tipp fehlt“ (gleiche Zahl wie das App-Icon-Badge) · `Ergebnisse` mit Punkt bei ungesehenen Ergebnissen · `＋` (56 px, lime, `aria-label="Neue Wette"`) · `Rangliste`. Aktiver Tab mit `aria-current="page"`.
- **Desktop ≥ 900 px:** Die Bottom-Bar wird zur Segmentleiste in der Kopfzeile, „+ Neue Wette“ steht als Button rechts. Inhalt max. 720 px, zentriert. Kein Zweispalter in v1.
- **Skip-Link** „Zum Inhalt“ (erstes fokussierbares Element).
- **Banner-Zone** unter der Kopfzeile, höchstens ein Banner, Priorität: Offline > Ladefehler > Neue Version > Speicher blockiert > Willkommen.
- **Toasts** unten mittig über der Bottom-Bar, höchstens einer gleichzeitig, 4 s (Undo-Toasts 8 s mit Fortschrittsbalken), `role="status"`.

### 1.4 Screens

#### 1.4.1 Offen (`/`)

```
1 Wette wartet auf dich.                         ← Statuszeile (aria-live=polite)
[🔔 Nichts verpassen? Push an ›]                 ← PushCard (nur unter Bedingungen §5.6)

FÜR DICH ZU TUN · 1                              ← nur Verwalter
▸ Tippschluss vorbei: Kimi K4 – AA-Index    Ergebnis eintragen ›

DEIN TIPP FEHLT · 1
┌──────────────────────────────────────────┐
│ [◔ Endet bald · noch 5 Std]   AA-Index   │
│ Kimi K4 – AA-Index                        │
│ 🔒🔒🔒 3 Tipps verdeckt          Tippen › │
└──────────────────────────────────────────┘

NEU AUFGELÖST · 1
▸ Le Chaton Fat AA Index     38 Punkte · Du: Platz 2

GETIPPT · LÄUFT · 4
▸ Qwen 4 Max – AA-Index      Dein Tipp: 58 · 4 Tipps
  noch 2 Tage

GESCHLOSSEN · OHNE DICH · 1
▸ …                          Tippabgabe zu
```

- **Sektionen** in fester Reihenfolge, leere werden nicht gezeigt:
  1. **Für dich zu tun** (nur Verwalter): (a) Phase `closed`, nicht aufgelöst → „Tippschluss vorbei: {prompt}“ mit Link „Ergebnis eintragen“ auf `/spiel/:id/aufloesen`. (b) Phase `open`, kein `closesAt`, älter als 14 Tage → „Läuft seit {n} Tagen ohne Tippschluss“ mit Link „Zumachen oder Datum setzen“ auf `/spiel/:id`.
  2. **Dein Tipp fehlt**: `open`, kein eigener Tipp. Große Karten (≈ 112 px, die ganze Karte ist der Link). Sortierung: `closesAt` aufsteigend, danach ohne `closesAt` nach `createdAt` absteigend.
  3. **Neu aufgelöst**: Phase `resolved`, für diesen Namen noch nicht gesehen (§2.2 `result_seen`). Zeilen mit Ergebnis und eigenem Ausgang („Du: 🏆“, „Du: Platz 2“, „nicht getippt“).
  4. **Getippt · läuft**: `open` oder `closed` mit eigenem Tipp. Zeilen (64 px), zweite Zeile mit Countdown oder „wartet aufs Ergebnis“.
  5. **Geschlossen · ohne dich**: `closed` ohne eigenen Tipp, ausgegraut.
  6. Fußlink „Alle Ergebnisse →“.
- **Ohne Namen** gibt es nur zwei Sektionen, „Offene Wetten“ (open) und „Wartet auf Ergebnis“ (closed). Die Karten zeigen „{n} Tipps verdeckt“ und den CTA „Mittippen ›“.
- **Live:** Neue Wetten gleiten oben in ihre Sektion ein (Lime-Puls 600 ms). Liegt die Einfügestelle oberhalb des Viewports, erscheint stattdessen die Pille „1 neue Wette ↑“. Fremde Tipps erhöhen nur still die Zähler.
- **Pull-to-refresh** löst `GET /api/state` aus.

#### 1.4.2 Wette (`/spiel/:id`)

Aufbau von oben nach unten: oben wird gelesen, unten gehandelt.

```
‹ Zurück                       ⤴ Teilen   ⋯     ⋯ nur für Verwalter
[● Offen]  AA-Index
Kimi K4 – AA-Index                               H1, bricht um, wird nie abgeschnitten
von Logge · vor 2 Tagen
Tippen bis Fr 24.10., 18:00. Danach trägt Logge das Ergebnis ein.   ← Lebenszyklus-Satz
Nächster dran gewinnt · 0–100 Punkte · Schritte 0,1                ← Regel-Kurzfassung
Regeln & Quelle ⌄                                                    ← eingeklappt

VERDECKT · 3
🔒 Logge   🔒 LZH   🔒 Nikjay
Dein Tipp deckt sie auf. · Noch nicht dabei: Nöl
──────────────────────────────────────────
                61,5                              ← Tipp-Panel (Daumenzone)
               Punkte
  ├────────────●──────────────────────┤
  0                                  100
   [−1]  [−0,1]        [+0,1]  [+1]
  Ein Tipp pro Wette. Nach 5 Sekunden ist er fix.
 [         61,5 Punkte tippen          ]          ← sticky über der Bottom-Bar
──────────────────────────────────────────
Verlauf · 2 ⌄
```

**Kopf:** Zurück (`history.back()`, ohne Vorgeschichte `/`), Teilen (`navigator.share({title: prompt, url})`, Fallback Zwischenablage mit Toast „Link kopiert.“, sonst Toast „Kopieren ging nicht. Der Link steht jetzt oben in der Adresszeile.“ und `replaceState`), `⋯` öffnet das Verwalter-Menü (§1.4.2.3).

**Thema-Chip:** `benchmark`, Fallback „Freie Antwort“ (text) / „Mehrere Werte“ (> 1 Feld) / „Zahlentipp“.

**Lebenszyklus-Satz** (genau einer):

| Zustand | Rolle | Satz |
|---|---|---|
| open, mit `closesAt` | alle | „Tippen bis **{Fr 24.10., 18:00}**. Danach trägt {creator} das Ergebnis ein.“ |
| open, ohne `closesAt` | alle | „Kein fester Tippschluss – {creator} macht zu, wenn's ernst wird.“ |
| open, ohne `closesAt`, > 14 Tage | Verwalter | „Läuft seit {n} Tagen ohne Tippschluss. Zumachen oder Datum setzen?“ |
| closed | alle | „Tippabgabe zu seit {Fr 24.10., 18:00}. Wartet auf das Ergebnis von {creator}.“ |
| closed | Verwalter | „Zu. Sobald das Ergebnis feststeht: **Ergebnis eintragen**.“ (Link) |
| resolved/archived | alle | „Aufgelöst am {07.10.2026, 21:39} von {resolvedBy}.“ |
| + korrigiert | alle | zusätzlich „Ergebnis am {08.10.} korrigiert – Details im Verlauf.“ |
| closed früher als geplant | alle | zusätzlich „(geplant war {Fr 18:00})“ |

**Regeln & Quelle** (eingeklappt, Tap-Höhe ≥ 44 px): `description` oder Fallback „Es zählt das vom Ersteller veröffentlichte Ergebnis.“. Darunter der automatische Regelsatz: text → „Gewertet wird die richtige Antwort. {creator} entscheidet beim Auflösen, welche Schreibweisen zählen.“ (Legacy-Textwetten ohne manuelle Wahl: „Gewertet wird die gleiche Antwort, unabhängig von Groß-/Kleinschreibung und zusätzlichen Leerzeichen.“) · mehrere Felder → „Die kleinste Summe der absoluten Abweichungen gewinnt. Bei gleicher Abweichung gibt es mehrere Gewinner.“ · ein Feld → „Die kleinste absolute Abweichung gewinnt. Bei gleicher Abweichung gibt es mehrere Gewinner.“ Danach „Quelle öffnen ↗“ (`target=_blank rel="noopener noreferrer"`), „von {creator} · erstellt {17.10.2026}“ und gegebenenfalls „bearbeitet {18.10., 14:02}“.

##### 1.4.2.1 Aktionsbereich: genau ein Zustand

| # | Bedingung | Inhalt |
|---|---|---|
| A | open, kein eigener Tipp | Siegel-Chips (VERDECKT · n) + Tipp-Panel. Ohne Namen sitzt der NamePicker inline über dem Button (§1.4.2.2). Leer: „Noch keine Tipps. Mach den Anfang.“ |
| A′ | eigener Tipp im Undo-Fenster | Button wird zu „✓ Getippt · Rückgängig (5)“ mit Countdown. Die Werte der anderen bleiben verdeckt. |
| B | open/closed, eigener Tipp, Undo vorbei | Box „✓ Dein Tipp steht: **61,5 Punkte**“ + „Abgegeben Mo 20.10., 21:14 · nicht mehr änderbar“ (bei Legacy-Tipps ohne Zeit: „aus der alten App übernommen“). Darunter die **Verteilung** (Zahlenstrahl ohne Ergebnislinie, Median als dünner Strich, eigener Punkt mit Ring + „du“), die **Insight-Zeile** (§1.7.4) und die Liste Name · Wert. Bei text: Antwort-Cluster („2× Nova-2“). Bei closed zusätzlich „Warten aufs Ergebnis von {creator}“. |
| C | closed, kein eigener Tipp | „🔒 Tippabgabe zu. Du hast hier nicht getippt. Die Tipps bleiben verdeckt, bis {creator} das Ergebnis einträgt.“ + Siegel-Chips |
| D | resolved/archived | ResultBox + RankedChart (§1.4.2.4). Beim **ersten** Ansehen als dieser Name läuft der Reveal (§1.4.2.5). |
| + | Verwalter und Phase closed | Zusätzlich oben im Aktionsbereich der Primärbutton **„Ergebnis eintragen“** |

Siegel-Chips: `🔒 {Name}` pro Tipp, `aria-label="Tipp von LZH, verdeckt"`. Nach Ende des Undo-Fensters drehen sie sich nacheinander um (Stagger 120 ms, Flip 250 ms) und zeigen die Werte, danach baut sich die Verteilung auf. Bei `prefers-reduced-motion` erscheint sofort der Endzustand.

„Noch nicht dabei“: aktive Spieler (nicht versteckt, mindestens ein Tipp in den letzten 60 Tagen), die hier noch nicht getippt haben, ohne dich selbst. Höchstens 4 Namen, dann „+{n}“. Nur in Phase open.

##### 1.4.2.2 Tipp-Panel

**Zahl, ein Feld (`NumberTip`):**
- **ValueDisplay** 56 px, `tabular-nums`, Einheit darunter. Anfangszustand **leer**: „–“ und Hinweis „Zieh oder tipp eine Zahl“. Es gibt keinen Startwert, damit niemand am Mittelwert ankert. Ein Tap auf die Zahl macht daraus ein Textfeld (`inputmode="decimal"`, Inhalt markiert, `enterkeyhint="done"`).
- **Slider** über `min…max`, Touch-Höhe 48 px, Daumen 32 px, rastet auf `step` ein. Die erste Berührung setzt den Wert an die Fingerposition. Ist `(max−min) > 1000` und `min ≥ 0`, läuft der Slider **logarithmisch** über `log10(v+1)`, gerundet auf `step` (Vorlagen Preis und API-Preis). `role="slider"`, `aria-valuetext="61,5 Punkte"`, Pfeiltasten ±step, Bild-Tasten ±10·step.
- **Stepper** −10·step, −step, +step, +10·step (je 48×48 px, Beschriftung mit Komma, z. B. „−0,1“). Langes Drücken wiederholt nach 400 ms alle 80 ms. Bei leerem Wert setzt der erste Tap auf die Bereichsmitte, gerundet auf step.
- **Inline-Korrektur** nach Direkteingabe: außerhalb des Bereichs → „Max. 100. **[100 nehmen]**“ bzw. „Min. 0. **[0 nehmen]**“. Neben dem Raster → „Nur Schritte von 0,1. **[61,6 nehmen]**“ (nächster gültiger Wert). Der Tipp-Button ist deaktiviert, solange der Wert ungültig ist.
- Der Hint unter dem Slider ist die Regel-Kurzfassung des Felds: „0–100 Punkte · Schritte 0,1“.

**Zahl, mehrere Felder:** Pro Feld eine kompakte Zeile (Label · Wert · Einheit). Tippt man auf eine Zeile, wird sie aktiv und zeigt Slider und Stepper. Darunter steht „Gewertet wird die Summe der Abweichungen.“. Der Button wird erst aktiv, wenn alle Felder gültig sind.

**Text (`TextTip`):** einzeiliges Feld, max. 160 Zeichen, Zähler ab 140, `enterkeyhint="send"`, `autocomplete="off"`, `autocapitalize="off"`, `spellcheck="false"`, keine Vorschläge (sonst würden andere Tipps verraten). Autofokus nur auf Desktop und Android (iOS öffnet die Tastatur ohne Geste nicht).

**Tipp-Button:** „{Wert} tippen“, zum Beispiel „61,5 Punkte tippen“, „1,25 / 10 $ / 1 Mio. Token tippen“, „„Nova-2“ tippen“ (Text auf 24 Zeichen gekürzt). Ohne Wert: deaktiviert, Label „Tippen“. Während des Speicherns: „Speichert …“ (sperrt nur **diese** Wette).

**NamePicker inline** (ohne Namen, direkt über dem Button):
```
Du bist …  [Logge] [Nöl] [Nikjay] [LZH] [+ Neu]
```
- Chips: alle nicht versteckten Spieler, sortiert nach Anzahl Tipps absteigend, höchstens 8, danach „Mehr …“.
- „+ Neu“ klappt an derselben Stelle ein Feld auf (max. 40 Zeichen, `autocomplete="nickname"`, Placeholder „Dein Name“) mit Button „Passt“.
- Ähnlichkeitsprüfung (clientseitig, `shared/names.ts`): Ist der Faltschlüssel gleich einem bekannten Spieler (Umlaute falten: ö→oe, ä→ae, ü→ue, ß→ss, Diakritika und Nicht-Alphanumerisches entfernen) oder liegt die Levenshtein-Distanz der Faltschlüssel bei ≤ 1 (Namen ≥ 4 Zeichen), erscheint „Meinst du **Nöl**? Ein anderer Name ist eine andere Person.“ mit [Ich bin Nöl] [Nein, ich bin {Eingabe}]. Exakt gleicher Normalschlüssel (§2.1) heißt: derselbe Spieler, ohne Rückfrage.
- Nach der Wahl steht über dem Button „Du tippst als **Nöl** · ändern“. Der Name wird gespeichert (§2.1), Toast „Du tippst als Nöl.“. Es gibt **keinen** zusätzlichen Bestätigungsschritt. Mit dem Namen ist der Button aktiv, der eingegebene Wert bleibt erhalten.

**Nach dem Tipp** (Flow §1.5.2): A′ → B → (einmalig) PushCard → Karte „Noch {n} Wette(n) offen → **Weiter tippen**“ (springt zur nächsten Wette aus „Dein Tipp fehlt“) bzw. „Alles getippt. Gönn dir.“

##### 1.4.2.3 Verwalter-Menü `⋯` (Bottom-Sheet, Aktionen nach Risiko geordnet)

Kopfzeile: „Du verwaltest diese Wette als {Name}.“ (bei Admin, der nicht Ersteller ist: „Du verwaltest diese Wette als Admin.“)

1. **Ergebnis eintragen** (phase open/closed) bzw. **Ergebnis korrigieren** (resolved; bei archived nur Admin) → `/spiel/:id/aufloesen`
2. **Tippabgabe schließen** (open) → sofort ausgeführt, Undo-Toast „Tippabgabe zu. [Rückgängig]“ (8 s, Rückgängig = reopen mit dem bisherigen `closesAt`, falls das in der Zukunft liegt, sonst ohne)
3. **Wieder öffnen** (closed, nicht aufgelöst) → Sheet mit Tippschluss-Chips (§1.4.4), Button „Wieder öffnen“, Toast „Wette ist wieder offen.“
4. **Bearbeiten** → `/spiel/:id/bearbeiten`
5. **Tipps verwalten** (phase open/closed, mindestens ein Tipp; Admin auch bei resolved) → Liste der Tipps mit „Entfernen“ (§1.5.6)
6. Trennlinie, 24 px Abstand
7. **Wette löschen** (rot) → DangerSheet (§1.5.6)

##### 1.4.2.4 Ergebnisansicht (resolved/archived)

```
ERGEBNIS                         aufgelöst 06.10.2026, 13:34
38 Punkte
Du: 45 · 7 Punkte daneben · Platz 2 von 3

So lagen alle
 🏆 LZH          ●──┤                35   3 Punkte daneben
 2. Nöl (du)        ├──────◉         45   7 Punkte daneben
 3. Logge           ├────────●       47   9 Punkte daneben
              35    │38     45   50
                  Ergebnis
```
- **ResultBox:** Label „ERGEBNIS“ (Mono-Versalien), Ergebnis 40 px, persönliche Zeile:
  - gewonnen allein: „🏆 Gewonnen · {d} daneben“ (bei 0: „🏆 Volltreffer!“)
  - geteilter Sieg: „🏆 Geteilter Sieg · {d} daneben“
  - sonst: „Du: {Wert} · {d} daneben · Platz {r} von {n}“
  - text, Treffer: „🏆 Gewonnen · deine Antwort zählt“. Text, kein Treffer: „Du: „{Antwort}“ · zählt nicht“.
  - nicht getippt: „Du hast hier nicht getippt.“
- **RankedChart** (Zahl): **eine** Darstellung statt der alten drei. Pro Zeile Platz (🏆 für Gewinner, sonst „{rank}.“), Name (+ „(du)“), Lollipop-Spur mit Ergebnislinie (violett), Wert und Abweichung. Die Achse nutzt „schöne“ Ticks (Schrittweite aus {1, 2, 2,5, 5} × 10ⁿ, 3–5 Ticks), der Bereich ist `[min(result, tips) − pad, max(…) + pad]`, auf Tick-Vielfache gerundet und auf `[field.min, field.max]` begrenzt (pad = 10 % der Spanne, mindestens 2·step). Gewinner: Lime + Pokal-Icon. Eigener Tipp: Ring + „(du)“. Nichts ist nur über Farbe kodiert. Mehrere Felder: eine Spur pro Feld untereinander in jeder Zeile, rechts die Gesamtabweichung „insgesamt {d} daneben“. Das SVG ist `aria-hidden`, die Zeilen selbst sind eine `<ol>` mit vollständigem Text.
- **Abweichung:** „{d} {unit} daneben“ (formatiert, §2.9), bei 0 „Volltreffer“. Bei leerer Einheit „{d} daneben“.
- **Text:** Ergebnis groß, darunter die Antwort-Cluster (normalisierte Gleichheit) mit ✓ (zählt) bzw. ✗, Namen je Cluster. Fußzeile „Gewertet von {resolvedBy}“ bzw. bei Legacy-Auto-Wertung „Automatisch gewertet (gleiche Schreibweise)“. Ohne Gewinner: „Niemand lag richtig.“
- Unter dem Chart: „Damit stehst du in der Rangliste auf **Platz {r}** →“ (Link `/rangliste`, nur mit Namen und Rang).
- **Verlauf · n ⌄** (eingeklappt): Einträge aus `events` (§2.10), z. B. „17.10., 11:40 · Logge hat die Wette angelegt · Gerät a3f9c1“, „Aus der alten App übernommen“.

##### 1.4.2.5 Reveal (erstes Ansehen eines Ergebnisses)

Er läuft, wenn die Wette resolved/archived ist, ein Name gesetzt ist und `viewer.resultSeen === false`. Dauer ≤ 1,5 s, startet automatisch, ein Tap überspringt:
1. 0–500 ms: Die Ergebnislinie fällt auf die Spuren, die Ergebniszahl zählt hoch (ease-out).
2. 500–1000 ms: Abweichungsbalken wachsen vom Ergebnis zu jedem Punkt.
3. 1000–1500 ms: Gewinner werden lime, das Pokal-Icon springt drauf. Beim eigenen Sieg kommt 800 ms Konfetti (Canvas, 60 Partikel).
Danach schickt der Client `POST /api/games/:id/seen`. Bei `prefers-reduced-motion` gibt es nur einen Fade (150 ms). Screenreader bekommen über `aria-live="polite"` „Ergebnis 38 Punkte. Gewinner LZH mit 3 daneben. Du: Platz 2.“

#### 1.4.3 Ergebnis eintragen (`/spiel/:id/aufloesen`)

Vollbild, Titel „Ergebnis eintragen“, darunter die Frage. Rechts oben „Quelle öffnen ↗“. Sticky Footer mit Primärbutton.

- **Wenn die Wette noch open ist:** Zuerst Karte „Die Wette ist noch offen. Zum Auflösen wird sie geschlossen. {Noch nicht dabei: LZH, Nikjay.}“ mit Button **„Tippabgabe schließen und weiter“** (ruft `POST /close`). Erst danach erscheint die Eingabe. Begründung: Der Verwalter sieht in diesem Screen alle Werte (§2.5). Das ist nur fair, wenn niemand mehr tippen kann.
- **Zahl:** gleiche Eingabe wie beim Tipp (ValueDisplay, Slider, Stepper), aber **ohne Schrittprüfung**, nur mit Bereichsprüfung (L§3.3). Hint: „Das Ergebnis darf feiner sein als die Tipp-Schritte.“ Auf dem Slider sind alle Tipps als kleine Punkte markiert.
- **Live-Vorschau** unter der Eingabe (`dryRun`, debounce 250 ms): „Damit gewinnt **LZH** (3 Punkte daneben) · 2. Nöl (7) · 3. Logge (9)“ bzw. „Geteilter Sieg: LZH und Nöl.“. Diese Vorschau ersetzt einen Bestätigungsdialog.
- **Text:** Feld „Richtige Antwort“ (1–160). Darunter **„Welche Antworten zählen?“**: alle Tipps, gruppiert nach normalisierter Antwort, als Checkbox-Zeilen (Antwort · Namen).
  - automatisch angehakt: normalisierte Gleichheit mit der eingegebenen Antwort
  - Badge „ähnlich“, **nicht** angehakt: Gleichheit nach Entfernen aller Nicht-Alphanumerischen, oder die richtige Antwort ist Präfix bzw. Teilstring des Tipps (oder umgekehrt), jeweils auf dem Faltschlüssel
  - letzte Zeile: Radio „Niemand lag richtig“ (entfernt alle Haken)
  - Zusammenfassung: „2 Gewinner: Logge und LZH → Geteilter Sieg“ / „1 Gewinner: Nöl“ / „Niemand gewinnt.“
- Hinweis über dem Button: „Das Ergebnis deckt alle Tipps auf. Alle mit Push kriegen es sofort.“
- Button **„Ergebnis veröffentlichen“** (beim Speichern „Wird veröffentlicht …“). Bei Erfolg geht es auf `/spiel/:id` mit Reveal, Toast „Ergebnis ist raus.“
- **Korrigieren** (resolved): gleicher Screen, vorbefüllt mit Ergebnis und Haken, Titel „Ergebnis korrigieren“. Zusätzlich das Feld „Was war falsch?“ (optional, max. 200, Chips „Tippfehler“, „Offizieller Wert geändert“). Button „Korrektur veröffentlichen“, Toast „Ergebnis korrigiert.“

#### 1.4.4 Neue Wette (`/neu`)

**Ohne Namen** öffnet sich zuerst der NamePicker als Sheet, danach geht es **automatisch** mit `/neu` weiter.

**Stufe 1 – Vorlage** (Kacheln, 2 Spalten, je ≥ 96 px hoch, Icon + Name + Beispiel):

| Key | Kachel | Typ | Felder (label / unit / min / max / step) | benchmark | Pflicht-Hilfsfeld → Frage | Regeltext (description) | infoUrl |
|---|---|---|---|---|---|---|---|
| `aa` | **AA-Index** | number | Score / Punkte / 0 / 100 / 0,1 | `AA-Index` | „Welches Modell?“ → `{x} – AA-Index` | „Es zählt der erste von Artificial Analysis veröffentlichte Intelligence-Index-Wert für genau dieses Modell, auf der höchsten getesteten Reasoning-Stufe. Schätzungen, Leaks und spätere Neuberechnungen zählen nicht.“ | `https://artificialanalysis.ai/leaderboards/models` |
| `api` | **API-Preis** | number | Input, Output / `$ / 1 Mio. Token` / 0 / 1000 / 0,01 | `API-Preis` | „Welches Modell?“ → `{x} – API-Preis (Input/Output)` | „Offizieller Listenpreis zum Launch, Standard-Tier, ohne Rabatte.“ | – |
| `codename` | **Codename-Rätsel** | text | – | `Codename` | „Welcher Codename?“ → `Welches Modell steckt hinter {x}?` | „Gewertet wird der offizielle Modellname. Beim Auflösen entscheidet der Ersteller, welche Schreibweisen zählen.“ | – |
| `price` | **Preis / Abo** | number | Preis / $ / 0 / 10000 / 0,01 | `Preis` | – | – | – |
| `percent` | **Wahrscheinlichkeit** | number | Wahrscheinlichkeit / % / 0 / 100 / 1 | `Wahrscheinlichkeit` | – | – | – |
| `multi` | **Mehrere Scores** | number | Modell 1, Modell 2 / Punkte / 0 / 100 / 0,1 (bis 4) | `AA-Index` | – | „Die kleinste Summe der Abweichungen gewinnt.“ | – |
| `number` | **Eigene Zahl** | number | Wert / (leer) / 0 / 100 / 1, Feinjustierung aufgeklappt | – | – | – | – |
| `text` | **Freie Antwort** | text | – | – | – | – | – |

Die alten fünf Vorlagen (L§5) sind enthalten: `score`→`aa`, `price`→`price`, `api`→`api`, `text`→`text`, `multi`→`multi`. „Freie Antwort“ steht bewusst ganz hinten.

**Stufe 2 – Formular** (ein Screen, sticky Footer):
1. **Hilfsfeld** der Vorlage (Autofokus), falls vorhanden. Die Frage wird live daraus gebaut, solange der Nutzer sie nicht selbst geändert hat.
2. **Frage** (Pflicht, 1–160, Placeholder blass „z. B. GLM 6 – AA-Index“). Leer und bereits berührt → „Ohne Frage keine Wette.“. Bei Text-Vorlagen erscheint, wenn die Frage `/preis|kosten|cost|\$|€|prozent|%|wie hoch|wie viel/i` matcht, der Hinweis „Klingt nach Zahl. Mit ‚Preis‘ oder ‚Eigene Zahl‘ gibt's eine faire Wertung nach Abstand. [Vorlage wechseln]“.
3. **Tippschluss** als Chips: `Heute 23:59` (nur vor 22:00) · `Morgen 20:00` · `In 3 Tagen` · `In 1 Woche` · `Datum …` · `Ohne`. **Vorauswahl „In 3 Tagen“** = heute + 3 Tage, 20:00 Uhr Ortszeit. „Datum …“ öffnet `datetime-local` (min = jetzt + 10 min). Darunter steht ein Satz: mit Datum „Tippen bis {Fr 24.10., 20:00}. 2 Std vorher erinnern wir alle, die noch nicht getippt haben.“, ohne Datum „Ohne Datum machst du selbst zu.“
4. **Regeln, Quelle, Thema** (eingeklappt): Regeltext (vorbelegt, max. 2000, 4 Zeilen), Quelle (`type=url`, nur http/https, max. 2000; ungültig → „Das sieht nicht nach einem Link aus.“), Thema (max. 80, `<datalist>` mit allen bisherigen `benchmark`-Werten).
5. **Feinjustierung** (eingeklappt, nur bei number; bei `number` aufgeklappt): pro Feld Bezeichnung (Pflicht, ≤ 60), Einheit (≤ 30, Placeholder „z. B. Punkte, %, $“), Minimum, Maximum, Schrittweite (Komma und Punkt erlaubt, Anzeige mit Komma). Bei `multi` gibt es „+ Weiterer Wert“ (bis 4, neues Feld „Modell {n}“) und „Wert {n} entfernen“ (ab 3 Feldern). Validierung inline am Feld mit den alten Texten (§2.6.3).
6. **Vorschau-Zeile:** „So sieht der Tipp aus: 0–100 Punkte · Schritte 0,1“ (bei text: „Freie Antwort, max. 160 Zeichen“).
7. **Sticky Footer:** über dem Button eine Zeile „Push geht an {n} Leute.“ (`GET /api/push/config` liefert `audience` = Anzahl Abos anderer Namen), bei Fehlern stattdessen das erste Problem („Frage fehlt“, „Max muss größer als Min sein“). Button **„Wette veröffentlichen“** (beim Speichern „Wird veröffentlicht …“).

**Erfolg:** Weiterleitung auf `/spiel/:id`, wo das Tipp-Panel des Erstellers offen ist. Toast „Wette ist raus. Du kannst selbst mittippen.“. Teilen-Button für 5 s hervorgehoben (Puls). Das Formular wird komplett zurückgesetzt. Ein **Entwurf** liegt in `localStorage['tipplab.draft']` und wird nach Erfolg gelöscht. Beim Verlassen mit Eingaben fragt ein Sheet „Entwurf behalten?“ [Behalten] [Verwerfen].

#### 1.4.5 Wette bearbeiten (`/spiel/:id/bearbeiten`)

Gleiches Formular wie Stufe 2, ohne Vorlagenwahl.
- **Ohne Tipps anderer** (Tipps des Erstellers zählen nicht): alles änderbar, auch Typ und Felder. Gibt es einen Tipp des Erstellers und ändern sich Felder oder Typ, wird dieser Tipp gelöscht (Hinweis: „Dein eigener Tipp wird dabei zurückgesetzt.“).
- **Mit Tipps anderer:** Frage, Regeln, Quelle, Thema und Tippschluss sind änderbar. Typ und Felder sind gesperrt, mit der Begründung „Gesperrt, weil schon {n} Leute getippt haben – sonst wären ihre Tipps unfair.“
- Tippschluss in einer offenen Wette: verlängern geht immer. Verkürzen geht nur auf ≥ jetzt + 10 min (Hinweis: „Wer noch nicht getippt hat, bekommt sofort Bescheid.“, löst den Push `reminder` aus, §5.4). „Ohne“ ist erlaubt.
- Bei aufgelösten Wetten sind nur Regeln, Quelle und Thema änderbar.
- Speichern: Toast „Gespeichert.“. Jede Änderung landet im Verlauf (mit altem und neuem Wert). Hat sich nach dem ersten Tipp anderer die Frage geändert, steht am Titel „bearbeitet“.

#### 1.4.6 Ergebnisse (`/ergebnisse`)

- Suchfeld (sticky, erst ab 6 aufgelösten Wetten sichtbar, Placeholder „Wette suchen …“): Substring in `prompt + benchmark + createdBy`, de-DE lowercase, wie früher. Daneben der Chip **„Mit meinem Tipp“** (Toggle, `aria-pressed`, ohne Häkchen im Ruhezustand). Beides wird in `localStorage` gemerkt.
- **Diese Woche**: Phase resolved (≤ 7 Tage seit Auflösung). Mittlere Karten mit Ergebnis, eigenem Ausgang, Gewinner(n) und „Im Archiv ab {13.10.}“.
- **Archiv**: Phase archived, gruppiert nach Monat der Auflösung („Oktober 2026“). Kompakte Zeilen: Titel · Ergebnis · 🏆 Gewinnername(n) · eigener Ausgang.
- Sortierung jeweils `resolvedAt` absteigend. Ungesehene Ergebnisse tragen einen Punkt.
- Leer: siehe §1.8.

#### 1.4.7 Rangliste (`/rangliste`)

```
DEINE BILANZ · Nöl                     🏆 Platz 2
┌────────┬────────┬────────┬────────┐
│ 13     │ 2      │ 0      │ 28,6 % │
│ Tipps  │ Siege  │ Exakt  │ Quote  │
│7 gewer.│geteilte│Ergebnis│Siege / │
│        │zählen  │genau   │gewertet│
└────────┴────────┴────────┴────────┘   (2×2 unter 360 px)

RANGLISTE
14 Wetten · 7 aufgelöst · 5 Leute · 46 Tipps
1  (LO) Logge        3 Siege · 42,9 %     ▪🏆▪▪🏆
       14 Tipps · 7 gewertet · 1× exakt
2  (LZ) LZH          2 Siege · 28,6 %
2  (NÖ) Nöl  du      2 Siege · 28,6 %
4  (NI) Nikjay       1 Sieg · 50 %
–  (BI) BigDick69    0 Siege · –
Reihenfolge: erst Siege, dann Quote. Gleichstand = gleicher Platz.
Die Quote zählt nur Tipps in aufgelösten Wetten. „Tipps“ zählt auch laufende Wetten.
```
- **Deine Bilanz**: vier Kacheln mit den Original-Untertiteln: „{settled} davon gewertet“ · „Geteilte Siege zählen mit“ · „Ergebnis genau getroffen“ · „Siege / gewertete Tipps“. Die Quote steht in de-DE mit max. 1 Nachkommastelle, `–` bei null.
- **Zeilen statt Tabelle**, alle sechs alten Kennzahlen sind sichtbar, nichts ist abgeschnitten. Die Formkurve zeigt die letzten 5 gewerteten Wetten als Mini-Chips (🏆 / Platzziffer / ✗ = Text ohne Treffer), älteste links, mit `aria-label`.
- Die eigene Zeile ist hervorgehoben und trägt „du“. Liegt sie außerhalb des Viewports, hängt sie als sticky Zeile über der Bottom-Bar.
- Ein Tap auf eine Zeile führt zu `/rangliste/:name` (URL-kodierter Anzeigename).
- Rangfolge **exakt** nach §2.8.

#### 1.4.8 Spieler (`/rangliste/:name`)

Kopf: Avatar, Name, „Platz {r}“, die Bilanz-Kacheln, Formkurve (letzte 10). **Historie**: alle Tipps dieses Spielers, neueste Wette zuerst: Wette · eigener Wert · Ergebnis · Platz. Werte offener Wetten werden nur gezeigt, wenn sie für den Betrachter sichtbar sind (§2.5), sonst „🔒 getippt“. Unbekannter Name → 404-Zustand „Unter diesem Namen gibt's noch keine Tipps.“

#### 1.4.9 Ich (`/ich`)

Gruppen in dieser Reihenfolge:
1. **Du**: großer Avatar + Name, Button „Name wechseln“ (öffnet den NamePicker mit dem Hinweis „Deine Tipps als Nöl bleiben bei Nöl. Push geht danach an den neuen Namen.“). Ohne Namen: „Wer bist du?“ + NamePicker. Darunter klein: „Dein Name ist dein Zugang – kein Passwort. Gleicher Name = gleiche Person, auf jedem Gerät. Gerätekennung: a3f9c1“.
2. **Benachrichtigungen** (gilt nur für dieses Gerät): Status in Klartext (§5.6), Hauptschalter, darunter die Schalter „Neue Wette“, „Ergebnis da“, „Erinnerung vor Tippschluss“ (mit Auswahl `1 Std · 2 Std · 6 Std · 24 Std`, Default 2 Std), „Meine Wetten (Tippschluss, Ergebnis fällig)“. Button „Test-Push schicken“.
3. **App**: „Als App installieren“ (Android/Desktop: `beforeinstallprompt`; iOS: InstallSheet). Ausgeblendet, wenn `display-mode: standalone`.
4. **Darstellung**: Segment „System · Hell · Dunkel“ (`localStorage['tipplab.theme']`).
5. **Papierkorb** (nur wenn eigene gelöschte Wetten existieren; Admin sieht alle): Zeilen „{prompt} · noch {n} Tage“ + „Wiederherstellen“.
6. **Admin** (nur für ADMIN_NAMES): Spielerliste mit Schalter „Im NamePicker zeigen“ (setzt `hidden`) und „Anzeigename“ (Schreibweise ändern, gleicher Schlüssel).
7. Links „So geht's“, Fußzeile „TIPPLAB {version}“.

#### 1.4.10 So geht's (`/so-gehts`)

Statische Seite, Abschnitte: **Die drei Regeln** („Ein Tipp pro Person und Wette.“ · „Erst tippen, dann siehst du die anderen.“ · „Nächster dran gewinnt, Gleichstand wird geteilt.“) · **Ablauf einer Wette** (Offen → Geschlossen → Aufgelöst → nach 7 Tagen im Archiv) · **Wertung** (Zahl, mehrere Werte, Text, Rangliste) · **Dein Name** (ohne Login, warum Namen sichtbar sind, Verlauf, Papierkorb; ehrlicher Satz: „Wer will, kann sich als jemand anderes ausgeben. Das sieht man im Verlauf – wir sind Freunde, also lass es.“) · **Push & iPhone** (Installationsanleitung, Freischalten bei Blockade).

### 1.5 Flows

#### 1.5.1 Erstbesuch über WhatsApp-Link (kein Name, nicht installiert)
1. `tipplab.logge.top/spiel/1063` lädt (Shell aus dem Netz oder dem SW-Cache). Banner einmalig: „**Hier wird auf KI-Modelle gewettet.** Tipp abgeben, dann siehst du, was die anderen glauben. [So geht's] ✕“ (wird nach ✕ oder dem ersten Tipp in `localStorage` gemerkt).
2. Zustand A. Der Nutzer stellt den Wert ein (**E**).
3. NamePicker inline: Tap auf „Nöl“ (**T1**).
4. Tap auf „61,5 Punkte tippen“ (**T2**). Es folgen 5 s Undo (A′), dann das Aufdecken (B).
5. PushCard erscheint unter der Verteilung (§5.6). Auf iOS-Safari kommt stattdessen die InstallCard.
**Bilanz:** 2 Taps + 1 Eingabe (alt: 4 Taps + 2 Eingaben).

#### 1.5.2 Push → Tipp (Stammnutzer)
1. Notification „Neue Wette von Logge“ / „Kimi K4 – AA-Index · Tippschluss Fr 24.10., 20:00“. Tap (**T1**). Der SW fokussiert ein offenes Fenster und navigiert es, sonst `openWindow('/spiel/1063?von=push')`.
2. Zustand A, Wert (**E**), Tippen (**T2**). Der Server schließt die offenen Notifications zu dieser Wette (Client: `registration.getNotifications({tag:'game-1063'})` → `close()`), das Badge zählt runter.
3. Zurück führt zu `/` (nicht aus der App heraus). Ohne Vorgeschichte ersetzt der Client die History beim Öffnen per Push mit `[/, /spiel/:id]`.
4. Ist die Wette inzwischen zu: Zustand C mit dem Satz „Zu spät – die Tippabgabe ist seit {18:00} zu.“. Ist sie gelöscht: Seite „Diese Wette gibt's nicht mehr.“ mit [Zu den offenen Wetten].

#### 1.5.3 Undo
Tap auf „Rückgängig“ im Undo-Fenster → `DELETE /api/tips/:id`. Das Panel kehrt mit dem alten Wert zurück, Toast „Tipp zurückgenommen.“. Ist das Fenster serverseitig schon zu → Toast „Zu spät zum Zurücknehmen – dein Tipp steht.“ und Zustand B. Das Fenster beträgt `TIP_UNDO_SECONDS` (Default 5). Der Client nimmt `undoUntil` aus der Server-Antwort plus Uhr-Offset.

#### 1.5.4 Wette anlegen
＋ (**T1**) → Vorlage (**T2**) → Hilfsfeld (z. B. Modellname) → Tippschluss passt per Default → „Wette veröffentlichen“ (**T3**). Neue Wetten pusht der Server mit 60 s Verzögerung und gebündelt pro Ersteller (§5.4). So bleibt Zeit, eine Fehlanlage zu löschen, ohne dass alle gepingt werden.

#### 1.5.5 Auflösen
Push „Tippschluss: …“ (Aktion „Ergebnis eintragen“) oder Inbox „Für dich zu tun“ oder der Button im Detail → `/spiel/:id/aufloesen` → (falls offen: „Tippabgabe schließen und weiter“) → Ergebnis → Vorschau prüfen → „Ergebnis veröffentlichen“. Server: berechnet die Wertung, schreibt Audit, SSE `game.updated`, Push „Ergebnis“ an alle Abos außer dem Auflöser.

#### 1.5.6 Verwalten
- **Schließen:** sofort, mit Undo-Toast (siehe Menü).
- **Wieder öffnen:** nur aus closed. Ein neuer Tippschluss muss gewählt werden („Ohne“ ist erlaubt). Fair, weil Nicht-Tipper in closed nichts gesehen haben.
- **Löschen:** DangerSheet „Wette löschen?“ · „„{prompt}“ verschwindet für alle. {n} Tipps fallen weg.“ + bei aufgelösten Wetten „Die Rangliste ändert sich ({Nöl verliert 1 Sieg}).“ · „Wiederherstellen geht 30 Tage lang unter Ich → Papierkorb.“ · [Wette löschen] (rot) [Abbrechen]. Danach Soft-Delete, Toast „Wette gelöscht. [Rückgängig]“ (8 s). Nach 30 Tagen löscht der Scheduler endgültig.
- **Tipp entfernen** (Moderation, z. B. Troll oder Doppel-Account): Sheet „Tipp von {Name} entfernen?“ · Grund-Chips (Pflicht) „Doppelt“ · „Troll“ · „Auf Wunsch“ · [Entfernen] → Toast „Tipp von {Name} entfernt. [Rückgängig]“. Der Eintrag erscheint im Verlauf mit Grund. Bis zur Auflösung darf das der Verwalter, danach nur ein Admin.

#### 1.5.7 Name wechseln
`/ich` → „Name wechseln“ → NamePicker → `localStorage['tipplab.name']` wird gesetzt. Die Liste bleibt stehen, `GET /api/state` lädt im Hintergrund neu (kein Leeren). Ein Push-Abo dieses Geräts wird per `PATCH /api/push/subscription` auf den neuen Namen umgehängt. Angefangene Tipp-Entwürfe werden verworfen, Hinweis „1 angefangener Tipp wird verworfen.“, falls vorhanden. Toast „Du tippst jetzt als {Name}.“

#### 1.5.8 Push aktivieren, Installieren (siehe §4.5, §5.6)

#### 1.5.9 Neue Version
Der SW meldet einen wartenden Worker → Banner „Neue Version da. [Neu laden]“. Ein Tap schickt `postMessage({type:'SKIP_WAITING'})`, bei `controllerchange` folgt `location.reload()`. Es gibt nie ein automatisches Neuladen, solange ein Formular ungespeicherte Eingaben hat (dann bleibt das Banner stehen).

### 1.6 Komponenten (Client)

`AppShell` · `Header` · `NameChip` · `LiveDot` · `BottomBar` · `Banner` · `Toast`/`UndoToast` · `Sheet` (Bottom-Sheet, Fokusfalle, Esc, `aria-modal`) · `DangerSheet` · `StatusLine` · `InboxSection` · `GameCard` · `GameRow` · `PhasePill` · `MyStatus` · `Countdown` · `LifecycleLine` · `RuleSummary` · `RulesDisclosure` · `SealChips` · `TipPanel` · `NumberTip` · `MultiNumberTip` · `TextTip` · `NamePicker` · `SubmitTipButton` · `Distribution` (Zahlenstrahl vor dem Ergebnis) · `AnswerClusters` · `InsightLine` · `ResultBox` · `RankedChart` · `Reveal` · `ActivityLog` · `CreatorMenu` · `ResolveForm` · `WinnerPicker` · `TemplatePicker` · `GameForm` · `FieldEditor` · `DeadlineChips` · `LeaderRow` · `StatTiles` · `FormStrip` · `PushCard` · `InstallCard`/`InstallSheet` · `PushSettings` · `EmptyState` · `Skeleton` · `Icon` (≈ 22 Inline-SVGs: check, lock, trophy, clock, share, more, back, plus, bell, bell-off, trash, edit, undo, search, chevron, external, user, sun, moon, wifi-off, flame-free, download).

Formulare halten Entwürfe pro Wette im Store **und** in `sessionStorage['tipplab.tipdraft.{id}']` (übersteht ein Neuladen), alles in `try/catch`.

### 1.7 Mikrotexte

#### 1.7.1 Status
| Ort | Text |
|---|---|
| Statuszeile ohne Name | „Tipp zuerst. Dann siehst du, was die anderen glauben.“ |
| n ≥ 1 fehlend | „1 Wette wartet auf dich.“ / „{n} Wetten warten auf dich.“ + bei Tippschluss < 2 h: „ Eine läuft in {40 Min} ab.“ |
| alles getippt | „Deine Tipps stehen. Jetzt heißt's abwarten.“ |
| closed vorhanden | zusätzlich „ {n} Ergebnis(se) steht/stehen noch aus.“ |
| nichts offen | Leerzustand §1.8 |
| PhasePill | „Offen“ · „Endet bald“ (< 24 h, Amber) · „Geschlossen“ · „Aufgelöst“ |
| MyStatus | „Dein Tipp fehlt“ · „Dein Tipp: 61 Punkte“ · „Nicht getippt“ · „🏆 Gewonnen“ · „🏆 Geteilter Sieg“ · „Platz 2 · 3 Punkte daneben“ · „Volltreffer“ |
| Countdown | > 48 h „noch {n} Tage“ · 24–48 h „noch 1 Tag {h} Std“ · < 24 h „noch {h} Std {m} Min“ · < 1 h „noch {m} Min“ · < 5 min „noch {m}:{ss}“ · danach „Tippschluss“ |
| Verdeckt | „VERDECKT · {n}“ · „Dein Tipp deckt sie auf.“ · „Noch nicht dabei: {Namen}“ |

#### 1.7.2 Tippen
| Ort | Text |
|---|---|
| Leer | „Zieh oder tipp eine Zahl“ |
| Hinweis unter Panel | „Ein Tipp pro Wette. Nach {5} Sekunden ist er fix.“ |
| Button | „{Wert} tippen“ · „Tippen“ (deaktiviert) · „Speichert …“ |
| Undo | „✓ Getippt · Rückgängig ({s})“ · Toast „Tipp zurückgenommen.“ · „Zu spät zum Zurücknehmen – dein Tipp steht.“ |
| Nach Reveal | „✓ Dein Tipp steht: **{Wert}**“ · Toast „Tipp steht. Die anderen sind aufgedeckt.“ |
| Tipp-Serie | „Noch {n} Wette(n) offen → **Weiter tippen**“ · „Alles getippt. Gönn dir.“ |
| Inline-Korrektur | „Max. {max}. **[{max} nehmen]**“ · „Min. {min}. **[{min} nehmen]**“ · „Nur Schritte von {step}. **[{v} nehmen]**“ |

#### 1.7.3 Name
„Du bist …“ · „+ Neu“ · „Dein Name“ · „Passt“ · „Meinst du **{Name}**? Ein anderer Name ist eine andere Person.“ · „Ich bin {Name}“ · „Nein, ich bin {Eingabe}“ · „Du tippst als **{Name}** · ändern“ · Toast „Du tippst als {Name}.“ / „Du tippst jetzt als {Name}.“ · Fehler „Name bitte 1 bis 40 Zeichen, mit mindestens einem Buchstaben oder einer Ziffer.“

#### 1.7.4 Insight-Zeile (nur number mit einem Feld, ≥ 3 sichtbare Tipps inkl. eigenem, erste zutreffende Regel)
1. Gleicher Wert wie andere: „Du liegst genau bei {Name}.“ / „{n} haben dasselbe getippt wie du.“
2. Höchster Wert: „Du tippst am höchsten.“
3. Niedrigster Wert: „Du tippst am niedrigsten.“
4. Abstand zum Median ≤ 5 % der Spanne der Tipps: „Du liegst ziemlich in der Mitte.“
5. sonst: „{n} tippen höher, {m} tiefer.“
Text-Wetten: „{n} haben dasselbe geantwortet wie du.“ bzw. „Deine Antwort hat sonst keiner.“

#### 1.7.5 Ergebnis
„ERGEBNIS“ · „🏆 Gewonnen · {d} daneben“ · „🏆 Volltreffer!“ · „🏆 Geteilter Sieg · {d} daneben“ · „Du: {Wert} · {d} daneben · Platz {r} von {n}“ · „Du hast hier nicht getippt.“ · „So lagen alle“ · „{d} {unit} daneben“ · „Volltreffer“ · „insgesamt {d} daneben“ · „Niemand lag richtig.“ · „Gewertet von {Name}“ · „Automatisch gewertet (gleiche Schreibweise)“ · „Damit stehst du in der Rangliste auf Platz {r} →“

#### 1.7.6 Anlegen und Verwalten
„Neue Wette“ · „Worauf wird gewettet?“ · „Welches Modell?“ · „Welcher Codename?“ · „Deine Frage“ · „Tippschluss“ · „Regeln, Quelle, Thema“ · „Feinjustierung“ · „So sieht der Tipp aus: …“ · „Push geht an {n} Leute.“ · „Wette veröffentlichen“ · „Wird veröffentlicht …“ · „Wette ist raus. Du kannst selbst mittippen.“ · „Ohne Frage keine Wette.“ · „Tippschluss muss mindestens 10 Minuten in der Zukunft liegen.“ · „Das sieht nicht nach einem Link aus.“ · „Entwurf behalten?“
Verwalten: „Du verwaltest diese Wette als {Name}.“ · „Ergebnis eintragen“ · „Ergebnis korrigieren“ · „Tippabgabe schließen“ · „Tippabgabe zu. [Rückgängig]“ · „Wieder öffnen“ · „Wette ist wieder offen.“ · „Bearbeiten“ · „Gespeichert.“ · „Tipps verwalten“ · „Wette löschen“ · „Wette gelöscht. [Rückgängig]“ · „Wiederhergestellt.“ · „Gesperrt, weil schon {n} Leute getippt haben – sonst wären ihre Tipps unfair.“
Auflösen: „Die Wette ist noch offen. Zum Auflösen wird sie geschlossen.“ · „Tippabgabe schließen und weiter“ · „Richtige Antwort“ · „Welche Antworten zählen?“ · „ähnlich“ · „Niemand lag richtig“ · „Damit gewinnt **{Name}** ({d} daneben)“ · „Geteilter Sieg: {A} und {B}.“ · „Das Ergebnis darf feiner sein als die Tipp-Schritte.“ · „Das Ergebnis deckt alle Tipps auf. Alle mit Push kriegen es sofort.“ · „Ergebnis veröffentlichen“ · „Ergebnis ist raus.“ · „Was war falsch?“ · „Korrektur veröffentlichen“ · „Ergebnis korrigiert.“

#### 1.7.7 Push-Opt-in und App
„🔔 Soll's bimmeln, wenn eine neue Wette kommt oder ein Ergebnis da ist?“ · [Push an] [Später] · „Push läuft. Ab jetzt verpasst du keine Wette.“ · „Push gibt's auf dem iPhone nur, wenn Tipplab auf dem Home-Bildschirm liegt.“ · [Zeig mir wie] · „Push ist im Browser blockiert. So schaltest du's frei:“ · „Push klappt hier nicht (Browser zu alt). Die Seite funktioniert trotzdem.“ · „Du hast's installiert – jetzt noch Push an?“ · „Tipplab als App? [Installieren]“

### 1.8 Leerzustände (jeder mit Aktion)

| Ort | Titel | Text | Aktion |
|---|---|---|---|
| `/` keine offenen Wetten | „Gerade keine offenen Wetten.“ | „Zeit für eine neue? Oder warten, bis Logge wieder was raushaut.“ | [+ Wette anlegen] + falls Push aus: [Bescheid sagen, wenn was kommt] |
| `/` alles getippt (Sektion „Dein Tipp fehlt“ leer) | – (Statuszeile) | „Deine Tipps stehen. Jetzt heißt's abwarten.“ | – |
| Detail: keine Tipps | – | „Noch keine Tipps. Mach den Anfang.“ | Tipp-Panel |
| `/ergebnisse` leer | „Noch nichts aufgelöst.“ | „Sobald ein Ergebnis eingetragen ist, landet es hier – mit Gewinner.“ | [Zu den offenen Wetten] |
| `/ergebnisse` Archiv leer (Diese Woche hat Einträge) | – | Abschnitt fehlt | – |
| `/ergebnisse` Suche/Filter ohne Treffer | „Nix gefunden.“ | „Anderer Suchbegriff?“ | [Filter zurücksetzen] |
| `/rangliste` keine Tipps | „Noch keine Tipps.“ | „Mit der ersten Teilnahme beginnt die Rangliste.“ | [Zu den offenen Wetten] |
| `/rangliste` nichts aufgelöst | – | „Es gibt noch keine Ergebnisse. Bis zur ersten Auflösung werden nur die Teilnahmen gezählt.“ | – |
| Bilanz ohne Name | – | „Sag uns, wer du bist, dann gibt's hier deine Bilanz.“ | [Name wählen] |
| Bilanz: Tipps, nichts gewertet | – | „Deine Bilanz entsteht, sobald eine Wette mit deinem Tipp aufgelöst wird.“ | – |
| Bilanz: keine Tipps | – | „Du hast unter diesem Namen noch keine Tipps abgegeben.“ | [Zu den offenen Wetten] |
| Papierkorb leer | – | Gruppe wird nicht gezeigt | – |
| Erstladen ohne Cache | – | Skeleton: 3 Zeilen-Skelette | – |

### 1.9 Fehlerzustände

| Fall | Darstellung | Text |
|---|---|---|
| Offline (`navigator.onLine === false` oder Fetch-Netzfehler) | Banner, Schreibaktionen deaktiviert (Buttons mit `aria-disabled` + Tooltip) | „Offline – du siehst den Stand von {14:32}. Tippen geht erst wieder mit Netz.“ |
| Ladefehler mit vorhandenen Daten | Banner | „{Fehlertext} Der zuletzt geladene Stand bleibt sichtbar. [Erneut versuchen]“ |
| Ladefehler ohne Daten | Vollfläche | „Das hat nicht geklappt. [Erneut versuchen]“ |
| Antwort kein JSON | Text | „Die Verbindung wurde unterbrochen. Bitte erneut versuchen.“ |
| HTTP-Fehler mit `error.message` | Inline am Formular (`role="alert"`) oder Toast | Servertext (§3.5) |
| HTTP-Fehler ohne Text | dto. | „Die Anfrage konnte nicht verarbeitet werden.“ |
| Sonstiges | dto. | „Etwas ist schiefgelaufen. Bitte erneut versuchen.“ |
| Wette unbekannt/gelöscht | Seite | „Diese Wette gibt's nicht mehr.“ [Zu den offenen Wetten] |
| Kein Recht (Verwalter-Route) | Redirect + Toast | „Das darf nur {creator}.“ |
| `localStorage` nicht nutzbar | Banner | „Dein Browser merkt sich den Namen nicht (privater Modus?). Mitspielen geht trotzdem – du wählst ihn beim nächsten Mal einfach neu. [Neu laden]“ |
| SSE getrennt | Live-Punkt grau, sonst nichts | – |
| Push-Subscribe fehlgeschlagen | Toast | „Push ließ sich nicht einschalten. Später nochmal in Ich probieren.“ |
| Rate-Limit | Toast | „Langsam! Kurz durchatmen und nochmal.“ |

### 1.10 Visuelles

**Charakter:** dunkles Grün-Schwarz mit Neon-Lime (Aktion/Gewinn), Violett exklusiv fürs Ergebnis, Amber exklusiv für Zeitdruck, dazu ein gleichwertiges Hell-Theme.

**Tokens** (`client/src/styles/tokens.css`). Dunkel gilt für `:root[data-theme="dark"]` und für `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`, hell ist der Default.

| Token | Hell | Dunkel | Einsatz |
|---|---|---|---|
| `--bg` | `#f6f7f2` | `#101211` | Seite (`body` explizit) |
| `--surface` | `#ffffff` | `#1b1e1b` | Karten, Sheets |
| `--surface-2` | `#eef0e8` | `#232722` | Eingaben, Siegel-Chips |
| `--ink` | `#151814` | `#f3f5ee` | Text |
| `--ink-2` | `#5b6357` | `#adb5a8` | Sekundärtext |
| `--line` | `#d7dbcf` | `#394036` | Linien |
| `--accent` | `#d8fc70` | `#d8fc70` | Primärfläche, Gewinner |
| `--on-accent` | `#152000` | `#152000` | Text auf Lime |
| `--accent-ink` | `#4a6a00` | `#d8fc70` | Lime als Text/Icon |
| `--result` | `#6a4fc2` | `#c1a5fb` | Ergebnis, Slash der Wortmarke |
| `--warn` | `#9a5b00` | `#ffc56b` | Endet bald |
| `--closed` | `#6b7464` | `#929e83` | Geschlossen |
| `--danger` | `#b3261e` | `#ffab9c` | Löschen, Fehler |
| `--focus` | `#4a6a00` | `#d8fc70` | Fokusring 2 px + 2 px Offset |
| `--radius` | 14px | 14px | Karten (Inputs 10 px, Pills 999 px) |

Spielerfarben (Avatare, Punkte im Zahlenstrahl), 8 Stück, Index wird beim Anlegen des Spielers fest vergeben (`players.color = Anzahl Spieler mod 8`): hell `#1f6fb2 #c2410c #a16207 #be185d #0f766e #4f46e5 #b45309 #15803d`, dunkel `#6cc4ff #ff8a65 #ffc94d #ff7ab8 #4fd1b5 #8c9eff #ffa24c #9be29b`. Farbe steht nie allein, immer mit Initialen.

`<meta name="theme-color" content="#f6f7f2" media="(prefers-color-scheme: light)">` und `content="#101211" media="(prefers-color-scheme: dark)">`. Beim manuellen Override setzt der Client ein einzelnes `theme-color` passend. `color-scheme: light dark` auf `:root`.

**Typografie:** keine Webfonts. Stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Mono für Labels: `ui-monospace, "SF Mono", Menlo, Consolas, monospace` (11–12 px, Versalien, `letter-spacing: .06em`). `font-variant-numeric: tabular-nums` für alle Zahlen. Skala: 13 / 15 / 16 (Body, verhindert iOS-Zoom) / 17 (Zeilentitel) / 22 (H1) / 40 (Ergebnis) / 56 (ValueDisplay).

**Layout:** 8-px-Raster, Ränder 16 px, Kartenabstand 12 px, Touch-Ziele ≥ 44×44 px, Primärbuttons 56 px hoch. Kein horizontales Scrollen bei 320 px Breite. Ziel 390×844: in der Inbox sind 2 große Karten + 3 Zeilen ohne Scrollen sichtbar, ein aufgelöstes Detail braucht ≤ 2 Screens.

**Bewegung:** 150–250 ms ease-out. Ausnahmen: Siegel-Flip, Reveal (≤ 1,5 s), Konfetti. Alles hinter `@media (prefers-reduced-motion: reduce)`.

**A11y:** `lang="de"`, alle Icon-Buttons mit deutschem `aria-label`, Sheets mit Fokusfalle und Rückgabe des Fokus, Fehler `role="alert"`, Zähler-Änderungen `aria-live="polite"`, Kontrast ≥ 4,5:1 für Text und ≥ 3:1 für UI-Grafik in beiden Themes.

**Budget:** JS ≤ 80 KB gzip gesamt (React 19 + App), CSS ≤ 15 KB gzip, Erstanzeige aus dem SW-Cache < 300 ms auf einem Mittelklasse-Handy.

---

## 2. Domäne

### 2.1 Identität ohne Auth

- **Name = Person.** Es gibt keinen Login, kein Passwort, keinen Geräte-Zwang und keine Kopplung. Der Client speichert den Namen in `localStorage['tipplab.name']` und schickt ihn bei jedem Request mit (§3.1).
- **Spielerschlüssel** (`shared/names.ts`):
  ```ts
  export const nameKey = (name: string) =>
    name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
  export const cleanName = (name: string) => name.normalize('NFC').trim().replace(/\s+/g, ' ');
  // gültig: 1–40 Zeichen nach cleanName, mind. ein \p{L} oder \p{N}, keine \p{Cc}
  ```
  Das entspricht dem alten Vergleich (case-insensitiv, getrimmt, „NÖL“ == „Nöl“). „Nöl“ und „Noel“ bleiben zwei Personen. Der NamePicker warnt über den Faltschlüssel (§1.4.2.2).
- **Kanonischer Anzeigename** = `players.name`. Er wird beim ersten Auftreten gesetzt (Import: häufigste Schreibweise, bei Gleichstand die früheste). Rangliste und Tipplisten zeigen diesen Namen, nicht mehr die zuerst gefundene Schreibweise (L§7.3). `tips.player_name` behält die Originalschreibweise für den Verlauf.
- **Gerätekennung** `deviceId`: eine UUIDv4, die beim ersten Start in `localStorage['tipplab.device']` erzeugt wird (falls der Speicher blockiert ist: pro Seitenaufruf neu). Sie geht als Header `X-Device-Id` mit. Verwendung: (1) Audit („Gerät a3f9c1“ = erste 6 Hex von `sha256(deviceId)`), (2) Zuordnung von Push-Abos, (3) **ein Tipp pro Gerät und Wette** (Anti-Peek, abschaltbar per `ONE_TIP_PER_DEVICE=false`). Sie ist **keine** Rechteprüfung.
- **Admins:** `ADMIN_NAMES` (Komma-Liste, Default `Logge`), verglichen über `nameKey`.

**Warum kein Geräte-Token als Recht?** Der User will „weiterhin ohne Auth“. Kopplungscodes wären Auth in Verkleidung, und die getrennten Speicher von iOS-PWA und Safari würden jeden Erststart in der App zur Hürde machen. Schutz entsteht stattdessen durch Umkehrbarkeit (Papierkorb, Korrektur, Wieder öffnen, Undo), Sichtbarkeit (öffentlicher Verlauf mit Gerätekennung, Label „neu“ für Erst-Tipper) und Moderation (Tipp entfernen). Das Restrisiko (jemand gibt sich als Logge aus) ist für eine Freundesgruppe akzeptabel und wird auf „So geht's“ ehrlich benannt.

### 2.2 Datenmodell (SQLite über `node:sqlite` `DatabaseSync`)

Datei `${DATA_DIR}/tipplab.db`. Pragmas beim Öffnen: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`. Migrationen liegen als `server/db/migrations/NNN_name.sql`, Stand in `PRAGMA user_version`, jede Migration läuft in einer Transaktion. Alle Zeitstempel sind ISO-8601-UTC-Strings mit `Z` und Millisekunden (`2026-10-17T11:40:57.000Z`), erzeugt mit `new Date().toISOString()`. JSON-Spalten enden auf `_json`.

```sql
-- 001_init.sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);  -- vapid_public_key, imported_at, imported_source

CREATE TABLE players (
  key         TEXT PRIMARY KEY,                 -- nameKey()
  name        TEXT NOT NULL,                    -- kanonischer Anzeigename
  color       INTEGER NOT NULL CHECK (color BETWEEN 0 AND 7),
  hidden      INTEGER NOT NULL DEFAULT 0,       -- 1 = nicht im NamePicker (Admin)
  created_at  TEXT NOT NULL
);

CREATE TABLE games (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,  -- Legacy-IDs bleiben erhalten
  prompt               TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 160),
  description          TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  info_url             TEXT CHECK (info_url IS NULL OR length(info_url) <= 2000),
  benchmark            TEXT NOT NULL DEFAULT '' CHECK (length(benchmark) <= 80),
  template             TEXT NOT NULL DEFAULT 'number',     -- aa|api|codename|price|percent|multi|number|text|legacy
  answer_type          TEXT NOT NULL CHECK (answer_type IN ('number','text')),
  fields_json          TEXT NOT NULL DEFAULT '[]',          -- [{label,unit,min,max,step}] (Zahlen), text: []
  created_by_key       TEXT NOT NULL REFERENCES players(key),
  created_by_name      TEXT NOT NULL,                       -- Schreibweise bei Anlage
  created_at           TEXT NOT NULL,
  closes_at            TEXT,                                -- geplanter Tippschluss
  closed_at            TEXT,                                -- tatsächlicher Schluss (manuell, automatisch oder beim Auflösen)
  closed_by            TEXT,                                -- Name, NULL = automatisch
  resolved_at          TEXT,
  resolved_by          TEXT,
  result_json          TEXT,                                -- number[] | string
  winner_tip_ids_json  TEXT,                                -- nur text: int[] = manuelle Wahl; NULL = automatisch (normalisierte Gleichheit)
  corrected_at         TEXT,
  edited_at            TEXT,                                -- letzte Bearbeitung nach dem ersten fremden Tipp
  deleted_at           TEXT,
  deleted_by           TEXT,
  push_new_sent_at     TEXT,                                -- Push „Neue Wette“ verschickt (Import: Importzeit)
  creator_due_sent_at  TEXT,                                -- Push „Tippschluss erreicht“ an Ersteller
  creator_overdue_sent_at TEXT                              -- Push „wartet seit 7 Tagen aufs Ergebnis“
);
CREATE INDEX games_open ON games(resolved_at, closed_at, closes_at) WHERE deleted_at IS NULL;

CREATE TABLE tips (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,         -- Legacy-IDs bleiben erhalten
  game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_key      TEXT NOT NULL REFERENCES players(key),
  player_name     TEXT NOT NULL,                             -- Schreibweise bei Abgabe
  values_json     TEXT NOT NULL,                             -- number[] | string
  created_at      TEXT,                                      -- NULL bei Legacy-Tipps
  device_id       TEXT,                                      -- NULL bei Legacy-Tipps
  removed_at      TEXT,                                      -- Moderation (soft)
  removed_by      TEXT,
  removed_reason  TEXT CHECK (removed_reason IS NULL OR removed_reason IN ('duplicate','troll','request'))
);
CREATE UNIQUE INDEX tips_one_per_player ON tips(game_id, player_key) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX tips_one_per_device ON tips(game_id, device_id) WHERE removed_at IS NULL AND device_id IS NOT NULL;
CREATE INDEX tips_player ON tips(player_key);

CREATE TABLE result_seen (
  player_key  TEXT NOT NULL REFERENCES players(key),
  game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seen_at     TEXT NOT NULL,
  PRIMARY KEY (player_key, game_id)
);

CREATE TABLE push_subscriptions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint         TEXT NOT NULL UNIQUE,
  p256dh           TEXT NOT NULL,
  auth             TEXT NOT NULL,
  player_key       TEXT NOT NULL REFERENCES players(key),
  device_id        TEXT NOT NULL,
  prefs_json       TEXT NOT NULL,     -- {"newGame":true,"result":true,"reminder":true,"reminderHours":2,"creator":true}
  user_agent       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  last_success_at  TEXT,
  last_error_at    TEXT,
  last_error       TEXT,
  fail_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX push_by_player ON push_subscriptions(player_key);

CREATE TABLE push_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kind             TEXT NOT NULL,     -- new_game|reminder|result|correction|creator_due|creator_overdue|test
  game_id          INTEGER,
  subscription_id  INTEGER,
  dedupe_key       TEXT UNIQUE,       -- "{kind}:{gameId}:{subscriptionId}" (test: NULL)
  status           INTEGER,           -- HTTP-Status des Push-Dienstes
  created_at       TEXT NOT NULL
);

CREATE TABLE events (                 -- Audit/Verlauf + Quelle für SSE
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  type        TEXT NOT NULL,          -- siehe §2.10
  game_id     INTEGER,
  tip_id      INTEGER,
  actor_key   TEXT,
  actor_name  TEXT,                   -- NULL = System
  device_tag  TEXT,                   -- 6 Hex
  data_json   TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX events_game ON events(game_id, id);
```

**Entscheidung Felder als JSON statt `game_fields`-Tabelle:** Es sind 1–4 Felder, sie werden immer gemeinsam gelesen und sind nach dem ersten fremden Tipp unveränderlich. Eine eigene Tabelle brächte nur Joins.
**ID-Folge nach Import:** `UPDATE sqlite_sequence SET seq = max(id)` für `games` und `tips`. Neue Wetten bekommen also ≥ 1063, neue Tipps ≥ 69.
**Backups:** Der Scheduler schreibt täglich um 04:00 UTC `VACUUM INTO '${DATA_DIR}/backups/tipplab-YYYY-MM-DD.db'` und behält 14 Dateien.

### 2.3 Lebenszyklus

**Phase** (einzige Funktion, `shared/phase.ts`, Server und Client nutzen dieselbe):
```ts
export const ARCHIVE_MS = 7 * 24 * 3600 * 1000;
export function phaseOf(g: {resolvedAt: string|null; closedAt: string|null; closesAt: string|null}, now: number):
  'open' | 'closed' | 'resolved' | 'archived' {
  if (g.resolvedAt) return now >= Date.parse(g.resolvedAt) + ARCHIVE_MS ? 'archived' : 'resolved';
  if (g.closedAt || (g.closesAt && now >= Date.parse(g.closesAt))) return 'closed';
  return 'open';
}
export const closingSoon = (g, now) => phaseOf(g, now) === 'open' && !!g.closesAt
  && Date.parse(g.closesAt) - now < 24 * 3600 * 1000;
export const archiveAt = (g) => g.resolvedAt ? new Date(Date.parse(g.resolvedAt) + ARCHIVE_MS).toISOString() : null;
```
Der Server liefert `phase` in jeder Antwort mit. Der Client rechnet nur für Countdown und den sekundengenauen Wechsel open→closed bzw. resolved→archived mit `now = Date.now() + serverOffset` nach (`serverOffset = Date.parse(serverTime) − Date.now()` aus `/api/state` und SSE `hello`). Weil es derselbe Code ist, gibt es keine divergierende Logik mehr (L§7.4).

**Übergänge:**

| Aktion | Von | Nach | Wer | Effekte |
|---|---|---|---|---|
| Anlegen | – | open | jeder mit Name | `closes_at` = null oder ≥ jetzt + 10 min. Audit `game.created`, SSE, Push `new_game` nach `NEW_GAME_PUSH_DELAY_SECONDS` |
| Automatischer Tippschluss | open | closed | System | sobald `closes_at ≤ now`: `closed_at = closes_at`, `closed_by = NULL`. Audit `game.closed` (`data.auto=true`), SSE, Push `creator_due` (falls ≥ 1 Tipp) |
| Schließen | open | closed | Verwalter | `closed_at = now`, `closed_by = name`, `closes_at` bleibt (Anzeige „geplant war …“) |
| Wieder öffnen | closed (nicht aufgelöst) | open | Verwalter | `closed_at = NULL`, `closes_at` = neuer Wert (null oder ≥ jetzt + 10 min), `creator_due_sent_at = NULL`. Reminder-Dedupe-Einträge dieser Wette werden gelöscht |
| Auflösen | open, closed | resolved | Verwalter | `closed_at ??= now`, `resolved_at = now`, `resolved_by`, `result_json`, `winner_tip_ids_json` (text). Audit `game.resolved`, SSE, Push `result` |
| Korrigieren | resolved (Admin: auch archived) | resolved | Verwalter | `result_json`/`winner_tip_ids_json` neu, `corrected_at = now`, `resolved_at` bleibt (die Archivuhr läuft weiter). Audit `game.corrected` mit `{before, after, reason}`, Push `correction` |
| Archivierung | resolved | archived | Zeit | rein abgeleitet (`resolved_at + 7 d`). Kein Schreibvorgang. Wirkung: Korrektur nur noch durch Admin, Anzeige im Abschnitt „Archiv“ |
| Bearbeiten | jede außer gelöscht | gleich | Verwalter | Regeln §1.4.5. Audit `game.edited` mit Diff |
| Löschen | jede | gelöscht | Verwalter | `deleted_at`, `deleted_by`. Wette verschwindet aus allen Listen und der Statistik. Audit, SSE `game.deleted` |
| Wiederherstellen | gelöscht (≤ 30 d) | vorherige Phase | Verwalter | `deleted_at = NULL`. Audit, SSE |
| Endgültig löschen | gelöscht > 30 d | – | System | `DELETE FROM games` (Kaskade auf tips, result_seen). Audit `game.purged` bleibt erhalten |

**Scheduler** (`server/services/scheduler.ts`): Ein Intervall läuft alle 15 s, zusätzlich hängt ein `setTimeout` auf den nächsten fälligen `closes_at` (max. 2³¹−1 ms, sonst neu planen). So schließen Wetten sekundengenau. Jeder Lauf ist idempotent und verarbeitet in dieser Reihenfolge:
1. Automatischer Tippschluss aller fälligen Wetten (`resolved_at IS NULL AND closed_at IS NULL AND closes_at <= now AND deleted_at IS NULL`).
2. Push `creator_due` für closed-Wetten mit ≥ 1 Tipp und `creator_due_sent_at IS NULL` (setzt das Feld auch bei 0 Abos).
3. Push `new_game` (fällig: `push_new_sent_at IS NULL AND created_at <= now − delay AND deleted_at IS NULL`, gebündelt pro Ersteller).
4. Push `reminder` (§5.4).
5. Push `creator_overdue`: closed seit ≥ 7 Tagen, nicht aufgelöst, `creator_overdue_sent_at IS NULL`.
6. Einmal pro Stunde: Papierkorb > 30 Tage endgültig löschen, Abos mit `fail_count ≥ 10` entfernen.
7. Täglich 04:00 UTC: Backup.
Nach einem Neustart holt der erste Lauf alles Fällige nach. Pushes, deren Anlass älter als 6 h ist (außer `result`), werden dabei verworfen und nur protokolliert.

### 2.4 Rechte

`canManage(game, viewerKey) = viewerKey === game.created_by_key || ADMIN_KEYS.has(viewerKey)` („Verwalter“).

| Aktion | Wer | Bedingungen |
|---|---|---|
| Lesen (Wetten, Rangliste, Verlauf) | alle, auch ohne Name | gelöschte nur im Papierkorb des Verwalters |
| Tippen | jeder mit gültigem Namen | Phase open; kein aktiver Tipp dieses Namens; bei `ONE_TIP_PER_DEVICE` kein aktiver Tipp dieses Geräts. Der Ersteller darf mittippen |
| Eigenen Tipp zurücknehmen | derselbe Name | innerhalb `undoUntil` |
| Wette anlegen | jeder mit Name | – |
| Bearbeiten | Verwalter | §1.4.5 |
| Schließen | Verwalter | open |
| Wieder öffnen | Verwalter | closed, nicht aufgelöst |
| Auflösen | Verwalter | open oder closed (open wird dabei geschlossen) |
| Korrigieren | Verwalter; Admin auch archived | resolved |
| Tipp entfernen / wiederherstellen | Verwalter bis zur Auflösung, danach nur Admin | – |
| Löschen / Wiederherstellen | Verwalter | jederzeit (Wiederherstellen ≤ 30 d) |
| Spieler verstecken, Anzeigename ändern | Admin | – |
| Import, Export | Header `x-admin-token` = `ADMIN_TOKEN` | ohne gesetztes `ADMIN_TOKEN` antworten die Routen mit 404 |

### 2.5 Sichtbarkeit der Tippwerte

**Regel (serverseitig erzwungen, verdeckte Werte verlassen den Server nie):**
```ts
revealedFor(game, viewer, now) =
     game.resolvedAt != null
  || (ownTip != null && (ownTip.createdAt == null || now >= Date.parse(ownTip.createdAt) + UNDO_MS))
```
- **Namen** der Tippenden sind immer sichtbar (Siegel-Chips), **Werte** erst nach dem eigenen Tipp (nach Ablauf des Undo-Fensters) oder nach der Auflösung. `distance/rank/isWinner` gibt es nur nach der Auflösung.
- **Geschlossen ohne eigenen Tipp bleibt verdeckt** bis zur Auflösung. Begründung: (1) „Wieder öffnen“ und „Tippschluss verlängern“ bleiben fair, weil niemand, der noch tippen könnte, Werte gesehen hat. (2) Die Auflösung bleibt der Moment des Aufdeckens für alle. (3) Das entspricht dem Altverhalten. Ein Aufdecken bei Schluss hätte nur den Nutzen, beim Warten etwas anzuschauen. Das wiegt die beiden Punkte nicht auf.
- **Verwalter-Ausnahme:** Im Screen „Ergebnis eintragen“ einer **closed**-Wette bekommt der Verwalter über `POST /resolve` mit `dryRun` alle Werte, weil er Text-Gewinner wählen und die Vorschau prüfen muss. Bei open ist das nicht möglich (409 `GAME_OPEN`), der Screen schließt deshalb zuerst. Seine normale Detailansicht folgt der allgemeinen Regel.
- **Undo-Fenster:** Während `undoUntil` sieht der Tippende noch keine fremden Werte. Sonst könnte man spicken und zurücknehmen.
- **Entfernte Tipps** erscheinen in keiner Liste und keiner Statistik, nur im Verlauf („Tipp von X entfernt · Troll“), ohne Wert.
- **SSE und Push** enthalten nie Tippwerte, Push-Texte nur Ergebnisse aufgelöster Wetten.

### 2.6 Eingaben: Parsing und Validierung (`shared/parse.ts`, Client und Server identisch)

#### 2.6.1 Zahl
```ts
const NUM = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;
export function parseNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim(); if (!NUM.test(s)) return NaN;
  return Number(s.replace(',', '.'));
}
const onStep = (v, min, step) => Math.abs((v - min) / step - Math.round((v - min) / step)) <= 1e-6;
```
Die API akzeptiert in `values` und `result` nur echte JSON-Zahlen. Strings parst nur der Client.

#### 2.6.2 Tipp und Ergebnis
| Prüfung | Tipp | Ergebnis | Fehlertext (Code `VALIDATION`) |
|---|---|---|---|
| number: Array-Länge = Anzahl Felder, alle endlich | ✓ | ✓ | „Bitte fülle alle Tippfelder aus.“ |
| number: `min ≤ v ≤ max` | ✓ | ✓ | „{label}: Bitte eine Zahl zwischen {min} und {max} eingeben.“ (Zahlen de-DE) |
| number: auf dem Raster von `step` | ✓ | – | „{label}: Bitte Schritte von {step} verwenden.“ |
| text: `trim()`, 1–160 Zeichen | ✓ | ✓ | „Die Antwort muss 1 bis 160 Zeichen lang sein.“ |
Gespeichert wird bei text der getrimmte String. Zahlen werden gespeichert wie empfangen, gerundet auf 10 Nachkommastellen gegen Float-Rauschen.

#### 2.6.3 Wette anlegen/bearbeiten
| Feld | Regel | Fehlertext |
|---|---|---|
| prompt | trim, 1–160 | „Ohne Frage keine Wette.“ / „Die Frage darf höchstens 160 Zeichen haben.“ |
| description | ≤ 2000 | „Die Regeln dürfen höchstens 2000 Zeichen haben.“ |
| infoUrl | leer → null; sonst `new URL()` mit Protokoll http/https, ≤ 2000 | „Das sieht nicht nach einem Link aus.“ |
| benchmark | trim, ≤ 80 | „Das Thema darf höchstens 80 Zeichen haben.“ |
| template | eine der Keys aus §1.4.4 | `VALIDATION` |
| answerType | number/text | – |
| fields (number) | 1–4 Felder | „Bitte ein bis vier Zahlenfelder anlegen.“ |
| je Feld | label 1–60, unit ≤ 30, min/max/step endliche Zahlen, `min < max`, `step > 0`, `step ≤ max − min` | „Jedes Zahlenfeld braucht eine Bezeichnung, einen gültigen Bereich und eine positive Schrittweite.“ |
| Einheiten | alle gleich (bei > 1 Feld) | „Für die gemeinsame Wertung müssen alle Zahlen dieselbe Einheit haben.“ |
| fields (text) | muss `[]` sein | – |
| closesAt | null oder ISO-Zeit ≥ jetzt + 10 min (60 s Toleranz) | „Tippschluss muss mindestens 10 Minuten in der Zukunft liegen.“ |

### 2.7 Wertung (`shared/scoring.ts`, identisch zur alten App + manuelle Text-Gewinner)

```ts
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
export const normText = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');

export function scoreGame(game: Game, tips: Tip[]): ScoredTip[] {      // tips = aktive (nicht entfernte)
  const blank = (t: Tip) => ({ ...t, distance: null, rank: null, isWinner: false });
  if (!game.resolvedAt || game.result == null || tips.length === 0) return sortTips(tips.map(blank));
  if (game.answerType === 'number') {
    const r = game.result as number[];
    const d = tips.map(t => round6((t.values as number[]).reduce((s, v, i) => s + Math.abs(v - r[i]), 0)));
    const min = Math.min(...d);
    return sortTips(tips.map((t, i) => ({ ...t, distance: d[i],
      rank: 1 + d.filter(x => x < d[i]).length,        // Competition-Ranking 1-2-2-4
      isWinner: d[i] === min })));
  }
  const winners = new Set<number>(game.winnerTipIds
    ?? tips.filter(t => normText(t.values as string) === normText(game.result as string)).map(t => t.id));
  return sortTips(tips.map(t => ({ ...t, distance: null,
    rank: winners.has(t.id) ? 1 : null, isWinner: winners.has(t.id) })));
}
// Sortierung: rank aufsteigend (null zuletzt), dann id aufsteigend
```
- **Zahl:** Summe der absoluten Abweichungen über alle Felder, auf 6 Nachkommastellen gerundet (57,6 − 55 → 2,6). Alle mit minimaler Abweichung gewinnen. Rang = 1 + Anzahl kleinerer Abweichungen. „Exakt“ = `distance === 0`.
- **Text:** `winnerTipIds` gesetzt → genau diese Tipps gewinnen (Rang 1, alle anderen `null`). `winnerTipIds` NULL (alle Legacy-Wetten und Auflösungen ohne Wahl über die API) → normalisierte Gleichheit wie früher. `[]` = „Niemand lag richtig“. Text-Treffer zählen nicht als „Exakt“ (Altverhalten).
- Gewertet wird beim Lesen, nicht gespeichert. Die Menge ist klein, und jede Korrektur oder Tippentfernung wirkt so automatisch.
- **Verifikation:** Für alle 6 aufgelösten Legacy-Zahlenwetten und die Textwette 747 müssen `distance/rank/isWinner` exakt den Werten der alten API entsprechen (Fixture §6.6). Beispiel 1059 (Ergebnis 38): LZH 35 → 3, Rang 1, Sieg · Nöl 45 → 7, Rang 2 · Logge 47 → 9, Rang 3. Beispiel 1055 (Ergebnis 43): Ränge 1, 2, 2, 4.

### 2.8 Statistik / Rangliste (`shared/stats.ts`, alte Formel 1:1)

Die alte Formel bleibt die **einzige** Rangliste. Begründung: Die Bestandszahlen müssen stimmen, und zwei konkurrierende Ranglisten (Konzept Social) würden verwirren. Die Kritik „belohnt Vieltipper“ (A§8) ist für eine Freundesrunde sogar erwünscht, weil sie zum Tippen motiviert. Verbesserungen, die keine Zahl verändern: kanonischer Anzeigename, Zeilenlayout, Formkurve, Klartext-Fußnote.

```ts
export function computeStats(games: ScoredGame[], players: Map<string, {name: string}>) {
  // games: alle NICHT gelöschten Wetten (jede Phase), tips: aktive, bereits gewertet (scoreGame)
  const m = new Map(); let tipCount = 0, resolvedCount = 0;
  for (const g of games) {
    const settled = !!g.resolvedAt && g.result !== null;
    if (settled) resolvedCount++;
    for (const t of g.tips) {
      const key = nameKey(t.playerName);
      const p = m.get(key) ?? m.set(key, { key, name: players.get(key)?.name ?? t.playerName,
        tips: 0, settled: 0, wins: 0, exact: 0, winRate: null, rank: null, form: [] }).get(key);
      p.tips++; tipCount++;
      if (settled) {
        p.settled++; if (t.isWinner) p.wins++; if (t.distance === 0) p.exact++;
        p.form.push({ gameId: g.id, resolvedAt: g.resolvedAt, rank: t.rank, isWinner: t.isWinner });
      }
    }
  }
  const list = [...m.values()];
  list.forEach(p => { p.winRate = p.settled ? p.wins / p.settled : null;
                      p.form = p.form.sort(byResolvedAtDesc).slice(0, 10); });
  const cmp = (a, b) => (Number(b.settled > 0) - Number(a.settled > 0)) || (b.wins - a.wins)
                      || ((b.winRate ?? 0) - (a.winRate ?? 0));
  list.sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name, 'de'));
  list.forEach((p, i) => { if (p.settled) p.rank = (i > 0 && cmp(list[i-1], p) === 0) ? list[i-1].rank : i + 1; });
  return { gameCount: games.length, resolvedCount, playerCount: list.length, tipCount, players: list };
}
```
- Text-Wetten ohne Treffer zählen als „gewertet“ (senken die Quote aller), wie früher. In der Fußnote steht es im Klartext.
- `form` dient nur der Anzeige (Formkurve) und beeinflusst nichts.
- **Pflicht-Fixture** (Stand Import 18.10.2026): `14 Wetten · 7 aufgelöst · 5 Leute · 46 Tipps`

| Platz | Name | Tipps | Gewertet | Siege | Exakt | Quote |
|---|---|---|---|---|---|---|
| 1 | Logge | 14 | 7 | 3 | 1 | 42,9 % |
| 2 | LZH | 11 | 7 | 2 | 0 | 28,6 % |
| 2 | Nöl | 13 | 7 | 2 | 0 | 28,6 % |
| 4 | Nikjay | 7 | 2 | 1 | 1 | 50 % |
| – | BigDick69 | 1 | 0 | 0 | 0 | – |

### 2.9 Formatierung (`shared/format.ts`)

- `formatNumber(v) = v.toLocaleString('de-DE', {maximumFractionDigits: 6})`. In Eingabe-Kontexten (ValueDisplay, Tipp-Button) mit fester Nachkommazahl = Nachkommastellen von `step` (0,1 → „61,5“).
- `formatValue(v, unit) = formatNumber(v) + (unit ? ' ' + unit : '')`.
- `formatAnswer(game, values)`: null → „–“. Bei string wörtlich, bei Array mit einem Feld `formatValue`, bei mehreren `"{label}: {formatValue}"`, verbunden mit „ · “.
- `formatDistance(d, unit)`: 0 → „Volltreffer“, sonst `"{formatNumber(d)}{unit ? ' ' + unit : ''} daneben"`.
- Datum absolut: `Intl.DateTimeFormat('de-DE', {weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})` → „Fr 24.10., 18:00“. Bei Datum außerhalb des aktuellen Jahres zusätzlich `year:'numeric'` und ohne Wochentag → „07.10.2025, 21:39“. Im Archiv immer mit Jahr.
- Relativ: „gerade eben“, „vor {n} Min“, „vor {n} Std“, „gestern“, „vor {n} Tagen“ (≤ 14), danach absolut.
- Client: Browser-Zeitzone. Server (Push-Texte, OG-Tags): `DISPLAY_TZ` (Default `Europe/Berlin`).
- Gewinnerliste: „Nöl“ · „Nöl und LZH“ · „Nöl, LZH und Logge“.
- Regel-Kurzfassung `ruleSummary(game)`: ein Feld → „Nächster dran gewinnt · {min}–{max} {unit} · Schritte {step}“ · mehrere → „Kleinste Gesamtabweichung gewinnt · {n} Werte · {min}–{max} {unit}“ · text → „Richtige Antwort gewinnt · {creator} entscheidet, was zählt“ (Legacy-Auto: „Richtige Antwort gewinnt · gleiche Schreibweise zählt“).

### 2.10 Audit-Events (`events.type`)

`game.created` · `game.edited` (`data: {changes: {feld: [alt, neu]}}`) · `game.closed` (`{auto: bool, plannedClosesAt}`) · `game.reopened` (`{closesAt}`) · `game.resolved` (`{result, winnerTipIds}`) · `game.corrected` (`{before, after, reason}`) · `game.deleted` · `game.restored` · `game.purged` · `game.imported` (`{source, fetchedAt}`) · `tip.created` (`{playerName}`, **ohne Wert**) · `tip.undone` · `tip.removed` (`{playerName, reason}`) · `tip.restored` · `player.updated` (`{hidden?, name?}`) · `import.completed` (`{games, tips, mode}`).
Für jedes Event schreibt **eine** Funktion `recordEvent()` den Audit-Eintrag und sendet das SSE-Event (§3.4). Der Verlauf einer Wette (`GET /api/games/:id/activity`) zeigt alle Events außer `tip.created`/`tip.undone` (die Namen der Tippenden stehen ohnehin in der Liste), jeweils mit `actorName` und `deviceTag`.

---

## 3. API-Vertrag

### 3.1 Konventionen

- Basis `https://tipplab.logge.top`. Alle Antworten sind JSON (`application/json; charset=utf-8`), außer SSE und Static. Requests mit Body brauchen `Content-Type: application/json` und dürfen höchstens 64 KB groß sein (Import: 5 MB).
- **Identität:** Lesende Routen nehmen `?name=<Name>` (optional), schreibende `"name"` im Body (Pflicht, sonst 400 `NAME_REQUIRED`). Jeder Request schickt den Header `X-Device-Id: <uuid>`. Pflicht ist er für `POST /api/tips` und `POST /api/push/*` (sonst 400 `DEVICE_REQUIRED`).
- Sendet ein Request einen Namen, den es noch nicht gibt, legt der Server den Spieler bei der ersten **schreibenden** Aktion an (Tipp, Wette, Push-Abo). Lesen legt nichts an.
- **Zeit:** ISO-8601 UTC mit `Z`. Jede Antwort enthält den Header `X-Server-Time`, `/api/state` zusätzlich `serverTime`.
- **Fehler:** HTTP-Status + `{"error": {"code": "TIP_EXISTS", "message": "Du hast hier schon getippt.", "field": "values"}}`. `message` ist immer anzeigefertiges Deutsch, `field` ist optional. Codes siehe §3.5.
- **Validierung** per Fastify-JSON-Schema (Typen/Längen), fachlich per `shared/parse.ts`.
- Keine Pagination in v1. `/api/state` liefert alle nicht gelöschten Wetten. Bei 14 Wetten sind das ≈ 20 KB, ab 300 Wetten wird nachgerüstet (§9).
- Caching: `Cache-Control: no-store` für `/api/*`.

### 3.2 DTOs

```ts
type Phase = 'open' | 'closed' | 'resolved' | 'archived';
type Field = { label: string; unit: string; min: number; max: number; step: number };

type TipDTO = {
  id: number; playerName: string;            // kanonischer Anzeigename
  playerKey: string; isOwn: boolean;
  isNew: boolean;                            // erster Tipp dieses Spielers überhaupt UND Spieler < 14 Tage alt
  values: number[] | string | null;          // null = verdeckt
  distance: number | null; rank: number | null; isWinner: boolean;
  createdAt: string | null;
};

type GameDTO = {
  id: number; prompt: string; description: string; infoUrl: string | null; benchmark: string;
  template: string; answerType: 'number' | 'text'; fields: Field[];
  phase: Phase; closingSoon: boolean;
  createdBy: string; createdByKey: string; createdAt: string;
  closesAt: string | null; closedAt: string | null; closedBy: string | null;
  resolvedAt: string | null; resolvedBy: string | null; archiveAt: string | null;
  editedAt: string | null; correctedAt: string | null;
  result: number[] | string | null;
  winnerMode: 'auto' | 'manual' | null;     // nur text + aufgelöst
  ruleSummary: string;
  tipCount: number;
  canManage: boolean;
  answersRevealed: boolean;                  // = revealedFor(viewer)
  viewer: { hasTipped: boolean; tipId: number | null; undoUntil: string | null; resultSeen: boolean };
  tips: TipDTO[];                            // sortiert nach scoreGame-Ordnung
  notYetTipped: string[];                    // nur open: aktive Spieler ohne Tipp (ohne Betrachter)
  deletedAt?: string;                        // nur in /api/trash
};

type PlayerDTO = { key: string; name: string; color: number; tipCount: number; lastTipAt: string | null; hidden?: boolean };
type StatsDTO = { gameCount: number; resolvedCount: number; playerCount: number; tipCount: number;
  players: { key: string; name: string; tips: number; settled: number; wins: number; exact: number;
             winRate: number | null; rank: number | null;
             form: { gameId: number; rank: number | null; isWinner: boolean }[] }[] };
type PushPrefs = { newGame: boolean; result: boolean; reminder: boolean; reminderHours: 1 | 2 | 6 | 24; creator: boolean };
```

### 3.3 Routen

#### `GET /healthz`
→ `200 {"ok":true,"version":"1.0.0+3f2a1c9","db":"ok","uptimeS":1234}`. Liefert 503, wenn `SELECT 1` fehlschlägt. Kein Rate-Limit, kein Log.

#### `GET /api/state?name=Nöl`
Alles, was die App braucht, in einem Request.
```json
{
  "serverTime": "2026-10-20T19:14:03.120Z",
  "version": "1.0.0+3f2a1c9",
  "me": { "name": "Nöl", "key": "nöl", "isAdmin": false, "known": true },
  "games": [ { "id": 1063, "...": "GameDTO" }, { "id": 1059, "...": "GameDTO" } ],
  "players": [ { "key": "logge", "name": "Logge", "color": 0, "tipCount": 14, "lastTipAt": "2026-10-20T08:01:00.000Z" } ],
  "stats": { "gameCount": 15, "resolvedCount": 7, "playerCount": 5, "tipCount": 47, "players": [] },
  "config": { "undoSeconds": 5, "vapidPublicKey": "BOr…", "newGamePushDelaySeconds": 60 }
}
```
`me` ist `null` ohne `name`. `known: false` bedeutet: Name ist gültig, aber noch nicht in `players`. Ungültiger Name → 400 `NAME_INVALID`. Versteckte Spieler fehlen in `players` (für Admins mit `hidden: true` enthalten), ihre Tipps und Ranglisten-Zeilen bleiben sichtbar.

#### `GET /api/games/:id?name=Nöl`
→ `200 {"game": GameDTO, "serverTime": "…"}` · 404 `GAME_NOT_FOUND` (auch bei gelöschten).
Beispiel (aufgelöst, öffentlich):
```json
{ "game": {
  "id": 1059, "prompt": "Le Chaton Fat AA Index",
  "description": "Gemeint ist Mistral Large 4 Preview. …", "infoUrl": "https://artificialanalysis.ai/models/mistral-large-4",
  "benchmark": "Artificial Analysis", "template": "legacy", "answerType": "number",
  "fields": [ { "label": "Score", "unit": "Punkte", "min": 0, "max": 100, "step": 0.1 } ],
  "phase": "archived", "closingSoon": false,
  "createdBy": "Logge", "createdByKey": "logge", "createdAt": "2026-10-06T13:25:28.000Z",
  "closesAt": null, "closedAt": "2026-10-06T13:34:27.000Z", "closedBy": null,
  "resolvedAt": "2026-10-06T13:34:27.000Z", "resolvedBy": "Logge", "archiveAt": "2026-10-13T13:34:27.000Z",
  "editedAt": null, "correctedAt": null, "result": [38], "winnerMode": null,
  "ruleSummary": "Nächster dran gewinnt · 0–100 Punkte · Schritte 0,1",
  "tipCount": 3, "canManage": false, "answersRevealed": true,
  "viewer": { "hasTipped": true, "tipId": 57, "undoUntil": null, "resultSeen": true },
  "tips": [
    { "id": 56, "playerName": "LZH", "playerKey": "lzh", "isOwn": false, "isNew": false, "values": [35], "distance": 3, "rank": 1, "isWinner": true, "createdAt": null },
    { "id": 57, "playerName": "Nöl", "playerKey": "nöl", "isOwn": true, "isNew": false, "values": [45], "distance": 7, "rank": 2, "isWinner": false, "createdAt": null },
    { "id": 54, "playerName": "Logge", "playerKey": "logge", "isOwn": false, "isNew": false, "values": [47], "distance": 9, "rank": 3, "isWinner": false, "createdAt": null }
  ],
  "notYetTipped": []
}, "serverTime": "2026-10-20T19:14:03.120Z" }
```

#### `POST /api/games`
```json
{ "name": "Logge",
  "template": "aa", "prompt": "Kimi K4 – AA-Index",
  "description": "Es zählt der erste von Artificial Analysis veröffentlichte …",
  "infoUrl": "https://artificialanalysis.ai/leaderboards/models", "benchmark": "AA-Index",
  "answerType": "number", "fields": [ { "label": "Score", "unit": "Punkte", "min": 0, "max": 100, "step": 0.1 } ],
  "closesAt": "2026-10-23T18:00:00.000Z" }
```
→ `201 {"game": GameDTO}` (id 1063, phase open). Fehler: 400 `VALIDATION`, 400 `NAME_REQUIRED`/`NAME_INVALID`, 429.

#### `PATCH /api/games/:id`
Body: `{"name":"Logge", "patch": {"prompt"?, "description"?, "infoUrl"?, "benchmark"?, "closesAt"?, "template"?, "answerType"?, "fields"?}}`. Nur mitgeschickte Schlüssel werden geändert.
→ `200 {"game": GameDTO}` · 403 `FORBIDDEN` · 404 · 409 `FIELDS_LOCKED` (Typ/Felder trotz fremder Tipps) · 409 `GAME_RESOLVED` (closesAt/prompt bei aufgelösten Wetten) · 400 `VALIDATION`.

#### `POST /api/games/:id/close`
`{"name":"Logge"}` → `200 {"game": GameDTO}` · 409 `GAME_NOT_OPEN` · 403 · 404.

#### `POST /api/games/:id/reopen`
`{"name":"Logge","closesAt":"2026-10-25T18:00:00.000Z"}` (`closesAt: null` = ohne) → `200 {"game"}` · 409 `GAME_NOT_CLOSED` (open oder aufgelöst) · 400 `VALIDATION` · 403 · 404.

#### `POST /api/games/:id/resolve`
```json
{ "name": "Logge", "result": [38], "dryRun": false }
{ "name": "Logge", "result": "Nova-2", "winnerTipIds": [12, 15], "dryRun": false }
```
- `winnerTipIds` nur bei text: weggelassen → automatisch (normalisierte Gleichheit, `winnerMode:"auto"`), Array → manuell (`[]` = niemand). IDs müssen aktive Tipps dieser Wette sein, sonst 400 `VALIDATION`.
- `dryRun: true`: nichts wird gespeichert. Erlaubt nur bei Phase closed (bei open → 409 `GAME_OPEN` mit „Schließ zuerst die Tippabgabe.“). Bei text ist `result` dann optional.
  ```json
  { "preview": {
      "tips": [ { "id": 56, "playerName": "LZH", "values": [35], "distance": 3, "rank": 1, "isWinner": true } ],
      "winners": ["LZH"],
      "suggestions": { "checked": [12], "similar": [15] } } }
  ```
  (`suggestions` nur bei text: `checked` = normalisierte Gleichheit, `similar` = Ähnlichkeitsregel §1.4.3.)
- Echt: open → wird geschlossen (`closed_at = now`) und aufgelöst. → `200 {"game": GameDTO}` · 409 `GAME_RESOLVED` · 400 `VALIDATION` · 403 · 404.

#### `POST /api/games/:id/correct`
`{"name":"Logge","result":[39],"winnerTipIds"?:[…],"reason":"Offizieller Wert geändert","dryRun":false}` → `200 {"game"}` · 409 `GAME_NOT_RESOLVED` · 409 `GAME_ARCHIVED` (Nicht-Admin nach 7 Tagen) · 400 · 403 · 404. `dryRun` liefert wie oben eine `preview`.

#### `POST /api/games/:id/seen`
`{"name":"Nöl"}` → `204`. Idempotent. Nur für aufgelöste Wetten, sonst 409 `GAME_NOT_RESOLVED`. Legt den Spieler nicht an (unbekannter Name → 204 ohne Wirkung).

#### `DELETE /api/games/:id`
Body `{"name":"Logge"}` → `200 {"deletedAt":"…","restoreUntil":"…"}` · 403 · 404.

#### `POST /api/games/:id/restore`
`{"name":"Logge"}` → `200 {"game"}` · 404 (unbekannt oder endgültig gelöscht) · 409 `NOT_DELETED` · 403.

#### `GET /api/trash?name=Logge`
→ `200 {"games": [GameDTO & {deletedAt, restoreUntil}]}`. Enthält eigene gelöschte Wetten, für Admins alle.

#### `GET /api/games/:id/activity`
→ `200 {"events": [{"id": 311, "at": "2026-10-20T19:02:11.000Z", "type": "game.closed", "actorName": "Logge", "deviceTag": "a3f9c1", "data": {"auto": false, "plannedClosesAt": "2026-10-23T18:00:00.000Z"}, "text": "Logge hat die Tippabgabe geschlossen (geplant war Do 23.10., 20:00)."}]}`. Der Server rendert `text` auf Deutsch (`server/services/activityText.ts`).

#### `POST /api/tips`
```json
{ "name": "Nöl", "gameId": 1063, "values": [61.5] }
{ "name": "Nöl", "gameId": 1064, "values": "GLM-6" }
```
→ `201`
```json
{ "tip": { "id": 69, "playerName": "Nöl", "playerKey": "nöl", "isOwn": true, "isNew": false, "values": [61.5],
           "distance": null, "rank": null, "isWinner": false, "createdAt": "2026-10-20T19:14:03.120Z" },
  "undoUntil": "2026-10-20T19:14:08.120Z",
  "game": { "…": "GameDTO, answersRevealed=false bis undoUntil" } }
```
Fehler: 404 `GAME_NOT_FOUND` · 409 `GAME_CLOSED` · 409 `GAME_RESOLVED` · 409 `TIP_EXISTS` · 409 `DEVICE_TIPPED` · 400 `VALIDATION` (mit `field`) · 400 `NAME_REQUIRED`/`NAME_INVALID`/`DEVICE_REQUIRED` · 429.
Nebeneffekte: Spieler anlegen falls neu, Audit `tip.created`, SSE.

#### `DELETE /api/tips/:id`
- **Undo** (eigener Tipp): Body `{"name":"Nöl"}` → `204`. Der Tipp wird hart gelöscht, Audit `tip.undone`. Nach `undoUntil` → 409 `UNDO_EXPIRED`. Fremder Tipp ohne Verwalterrecht → 403.
- **Moderation**: Body `{"name":"Logge","reason":"troll"}` (`duplicate|troll|request`) → `200 {"tip": {"id": 12, "removedAt": "…"}}`. Soft-Delete, Audit `tip.removed`. Nach der Auflösung nur durch Admin, sonst 403 `FORBIDDEN`.
Unterscheidung: Mit `reason` ist es Moderation, ohne `reason` Undo.

#### `POST /api/tips/:id/restore`
`{"name":"Logge"}` → `200 {"tip"}` (Moderation rückgängig). 409 `TIP_EXISTS`, falls der Spieler inzwischen neu getippt hat.

#### `PATCH /api/players/:key` (Admin)
`{"name":"Logge","patch":{"hidden":true}}` oder `{"patch":{"displayName":"Nöl"}}` (nur gleicher `nameKey`, sonst 400) → `200 {"player": PlayerDTO}` · 403.

#### Push
- `GET /api/push/config?name=Logge` → `200 {"publicKey":"BOr…","audience":4}` (`audience` = Anzahl Abos mit `newGame` von **anderen** Namen).
- `POST /api/push/subscribe` – Upsert über `endpoint`:
  ```json
  { "name": "Nöl",
    "subscription": { "endpoint": "https://fcm.googleapis.com/fcm/send/…", "keys": { "p256dh": "B…", "auth": "…" } },
    "prefs": { "newGame": true, "result": true, "reminder": true, "reminderHours": 2, "creator": true } }
  ```
  → `201 {"subscriptionId": 7, "prefs": {…}}`. `prefs` optional (Default wie oben). Ungültige Subscription → 400 `VALIDATION`. Legt den Spieler an.
- `POST /api/push/lookup` `{"endpoint":"…"}` → `200 {"subscriptionId":7,"name":"Nöl","prefs":{…}}` · 404 `SUBSCRIPTION_NOT_FOUND`. POST, damit der Endpoint nicht in Access-Logs landet.
- `PATCH /api/push/subscription` `{"endpoint":"…","name"?:"Nikjay","prefs"?:{…}}` → `200 {"prefs":{…}}` · 404.
- `DELETE /api/push/subscription` `{"endpoint":"…"}` → `204` (idempotent).
- `POST /api/push/resubscribe` `{"oldEndpoint":"…","subscription":{…}}` (aus dem SW bei `pushsubscriptionchange`) → `200`. Übernimmt Name und Prefs des alten Eintrags. Ohne alten Eintrag → 404.
- `POST /api/push/test` `{"endpoint":"…"}` → `202 {"status":201}` (Status des Push-Dienstes) · 404 · 502 `PUSH_FAILED` mit Meldung.

#### Admin
- `POST /api/admin/import?mode=empty|replace&dryRun=true|false&force=false` · Header `x-admin-token`. Body = Snapshot (§6.2). → `200` Report (§6.4) · 401 `ADMIN_TOKEN` · 409 `IMPORT_NOT_EMPTY` (`mode=empty` bei vorhandenen Wetten) · 422 `IMPORT_INVALID` (Struktur, mit Liste) · 422 `IMPORT_MISMATCH` (Wertungsabweichung ohne `force`).
- `GET /api/admin/export` · Header `x-admin-token` → `200` vollständiger JSON-Dump aller Tabellen außer `push_subscriptions.keys` (Backup, Format `tipplab-export@1`).

#### Static und SPA
- `/assets/*` (gehasht): `Cache-Control: public, max-age=31536000, immutable`.
- `/sw.js`, `/index.html`, `/manifest.webmanifest`: `Cache-Control: no-cache`. `sw.js` zusätzlich mit `Service-Worker-Allowed: /`.
- Alle übrigen `GET`-Pfade ohne Dateiendung und außerhalb von `/api` liefern `index.html` (SPA-Fallback). Für `/spiel/:id` injiziert der Server OG-Tags in den `<head>`: `og:title` = prompt, `og:description` = „{n} Tipps · Tippschluss {Fr 24.10., 18:00}“ / „Ergebnis: {formatAnswer}“ / „Wette auf KI-Modelle“, `og:image` = `/icons/og.png`, `og:url`. Gelöschte oder unbekannte IDs bekommen die Standard-Tags, Status 200 (der Client zeigt den Leerzustand).

### 3.4 SSE: `GET /api/events?name=Nöl`

- Header: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Keine Kompression für diese Route.
- Beim Verbinden: `retry: 3000` und
  ```
  event: hello
  data: {"serverTime":"2026-10-20T19:14:03.120Z","version":"1.0.0+3f2a1c9"}
  ```
- Heartbeat alle 25 s: `: ping`.
- Events (aus `recordEvent`, `id:` = `events.id`):
  ```
  id: 312
  event: change
  data: {"type":"tip.created","gameId":1063,"at":"2026-10-20T19:14:03.120Z","actor":"Nöl","tipCount":4}
  ```
  `type` ∈ `game.created|game.edited|game.closed|game.reopened|game.resolved|game.corrected|game.deleted|game.restored|tip.created|tip.undone|tip.removed|tip.restored|player.updated|import.completed`. Die Payload enthält nie Tippwerte und nie Ergebnisse (Clients holen beides mit ihrem Namen nach).
- **Client-Reaktion:** Ein `change` löst einen gebündelten Refetch von `GET /api/state` aus (Debounce 300 ms). Bei `tip.created` mit `actor ≠ ich` auf einer offenen Detailseite erscheint zusätzlich die Live-Zeile „{actor} hat gerade getippt.“ (4 s, `aria-live="polite"`).
- **Reconnect:** Der Browser verbindet `EventSource` automatisch neu. Nach jedem `open` (außer dem ersten) folgt ein voller Refetch. Ein Replay über `Last-Event-ID` gibt es nicht.
- Fallback: `visibilitychange` → sichtbar und letzter Refetch > 30 s her → Refetch.
- Server: Verbindungen in einem `Set`. Beim Schreiben wird `reply.raw.write` mit Backpressure geprüft (Socket nicht schreibbar → Verbindung schließen). Höchstens 200 parallele Verbindungen (darüber 503).

### 3.5 Fehlercodes

| HTTP | Code | message |
|---|---|---|
| 400 | `VALIDATION` | Texte aus §2.6 |
| 400 | `NAME_REQUIRED` | „Wer bist du? Bitte zuerst einen Namen wählen.“ |
| 400 | `NAME_INVALID` | „Name bitte 1 bis 40 Zeichen, mit mindestens einem Buchstaben oder einer Ziffer.“ |
| 400 | `DEVICE_REQUIRED` | „Gerätekennung fehlt. Bitte die Seite neu laden.“ |
| 401 | `ADMIN_TOKEN` | „Admin-Token fehlt oder stimmt nicht.“ |
| 403 | `FORBIDDEN` | „Das darf nur {creator}.“ |
| 404 | `GAME_NOT_FOUND` | „Diese Wette gibt's nicht mehr.“ |
| 404 | `TIP_NOT_FOUND` | „Diesen Tipp gibt's nicht mehr.“ |
| 404 | `SUBSCRIPTION_NOT_FOUND` | „Für dieses Gerät ist kein Push eingerichtet.“ |
| 404 | `NOT_FOUND` | „Hier ist nichts.“ |
| 409 | `TIP_EXISTS` | „Du hast hier schon getippt.“ |
| 409 | `DEVICE_TIPPED` | „Von diesem Gerät wurde hier schon getippt.“ |
| 409 | `GAME_CLOSED` | „Zu spät – die Tippabgabe ist zu.“ |
| 409 | `GAME_OPEN` | „Schließ zuerst die Tippabgabe.“ |
| 409 | `GAME_NOT_OPEN` | „Die Tippabgabe ist schon zu.“ |
| 409 | `GAME_NOT_CLOSED` | „Wieder öffnen geht nur bei geschlossenen, nicht aufgelösten Wetten.“ |
| 409 | `GAME_RESOLVED` | „Die Wette ist schon aufgelöst.“ |
| 409 | `GAME_NOT_RESOLVED` | „Die Wette ist noch nicht aufgelöst.“ |
| 409 | `GAME_ARCHIVED` | „Archivierte Wetten kann nur ein Admin korrigieren.“ |
| 409 | `FIELDS_LOCKED` | „Gesperrt, weil schon {n} Leute getippt haben – sonst wären ihre Tipps unfair.“ |
| 409 | `UNDO_EXPIRED` | „Zu spät zum Zurücknehmen – dein Tipp steht.“ |
| 409 | `NOT_DELETED` | „Die Wette ist nicht gelöscht.“ |
| 409 | `IMPORT_NOT_EMPTY` | „Die Datenbank enthält schon Wetten. Mit mode=replace überschreiben.“ |
| 413 | `PAYLOAD_TOO_LARGE` | „Das ist zu viel auf einmal.“ |
| 422 | `IMPORT_INVALID` | „Der Snapshot ist ungültig.“ + `details: string[]` |
| 422 | `IMPORT_MISMATCH` | „Neu berechnete Wertung weicht vom Altstand ab.“ + `details` |
| 429 | `RATE_LIMITED` | „Langsam! Kurz durchatmen und nochmal.“ (+ `Retry-After`) |
| 500 | `INTERNAL` | „Etwas ist schiefgelaufen. Bitte erneut versuchen.“ |
| 502 | `PUSH_FAILED` | „Der Push-Dienst hat abgelehnt: {status}.“ |
| 503 | `UNAVAILABLE` | „Gerade überlastet. Gleich nochmal.“ |

### 3.6 Sicherheit und Betrieb

- **Rate-Limit** (eigene Middleware, In-Memory, pro IP nach `trustProxy`): schreibende Routen 30/min, `POST /api/tips` 10/min, lesende 300/min, SSE 10 Verbindungsaufbauten/min. Admin-Routen mit gültigem Token sind ausgenommen.
- **Header** (alle Antworten): `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` · `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **ADMIN_TOKEN** wird zeitkonstant verglichen (`crypto.timingSafeEqual`).
- `trustProxy: true` (Traefik/Dokploy). Logs (pino) ohne Request-Bodies und ohne Push-Endpoints.
- `infoUrl` wird nur als http/https gespeichert und mit `rel="noopener noreferrer"` gerendert. React escaped alle Texte, es gibt kein `dangerouslySetInnerHTML`.

---

## 4. PWA

### 4.1 Manifest (`client/public/manifest.webmanifest`)

```json
{
  "id": "/",
  "name": "KI/TIPPLAB",
  "short_name": "Tipplab",
  "description": "Wetten auf KI-Modelle, Benchmarks und den nächsten Release.",
  "lang": "de",
  "dir": "ltr",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#101211",
  "theme_color": "#101211",
  "categories": ["games", "entertainment"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ],
  "shortcuts": [
    { "name": "Neue Wette", "url": "/neu", "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }] },
    { "name": "Rangliste", "url": "/rangliste", "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }] }
  ]
}
```
`index.html`-Head: `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`, `<meta name="apple-mobile-web-app-title" content="Tipplab">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, beide `theme-color`-Metas (§1.10), `<title>TIPPLAB</title>`, `<meta name="description" content="Wetten auf KI-Modelle, Benchmarks und den nächsten Release.">`. Ein Inline-Script ist wegen der CSP nicht erlaubt. Den Theme-Override setzt deshalb `client/public/theme-init.js` (wird synchron vor dem CSS geladen, liest `localStorage['tipplab.theme']` in try/catch, setzt `data-theme`).

### 4.2 Icons

- Quelle `client/public/icons/icon.svg` (512er-ViewBox, Signatur der Wortmarke):
  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="112" fill="#101211"/>
    <path d="M296 88h72L216 424h-72z" fill="#c1a5fb"/>
    <circle cx="368" cy="388" r="40" fill="#d8fc70"/>
  </svg>
  ```
- `maskable.svg`: gleiches Motiv ohne `rx`, vollflächiger Hintergrund, Motiv auf 80 % skaliert und zentriert (Safe Zone).
- `badge.svg`: Slash + Punkt in Weiß auf transparent (monochrom, für die Android-Statusleiste).
- `og.svg` (1200×630): Hintergrund `#101211`, Wortmarke `KI/TIPPLAB.` als Pfade, Unterzeile „Wetten auf KI-Modelle“.
- **`npm run icons`** (`scripts/gen-icons.mjs`, devDependency `@resvg/resvg-js`) erzeugt: `icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png`, `apple-touch-icon.png` (180, ohne Transparenz, `rx` 0, Hintergrund `#101211`), `badge-96.png`, `og.png`, `favicon.svg` (Kopie von icon.svg). Die PNGs werden **committet**, der Docker-Build braucht resvg nicht.

### 4.3 Service Worker (`client/src/sw/sw.ts` → `/sw.js`, handgeschrieben, klassisches Script ohne Imports)

**Build:** Ein zweiter Vite-Build (`client/vite.sw.config.ts`, `build.lib` mit Format `iife`) liest `dist/client/.vite/manifest.json` des Haupt-Builds und ersetzt per `define`:
- `__SW_VERSION__` = `APP_VERSION` (`{package.version}+{GIT_SHA[0..7]}`)
- `__PRECACHE__` = `['/', '/index.html', '/manifest.webmanifest', '/theme-init.js', '/favicon.svg', '/icons/icon-192.png', '/icons/badge-96.png', ...alle JS/CSS-Assets aus dem Manifest]`

**Caches:** `tipplab-shell-{version}` (Precache), `tipplab-api` (letzte API-Antworten).

**Ereignisse:**
```ts
install:  caches.open(SHELL).addAll(PRECACHE)          // KEIN skipWaiting hier
activate: alte 'tipplab-shell-*' löschen; clients.claim()
message:  {type:'SKIP_WAITING'} → self.skipWaiting()
          {type:'CLOSE_GAME_NOTIFICATIONS', gameId} → getNotifications({tag:`game-${id}`}).forEach(n => n.close())
          {type:'SET_BADGE', count} → navigator.setAppBadge?.(count) / clearAppBadge?.()
fetch:
  nicht GET oder fremde Origin            → durchreichen
  /api/events, /api/admin/*, /api/push/*  → durchreichen (nie cachen)
  /api/state, /api/games/:id[*]          → network-first, Timeout 4 s:
        ok  → Kopie in 'tipplab-api' (Key = volle URL inkl. ?name=), Header 'X-SW-Fetched-At' ergänzen
        Fehler/Timeout → Cache-Treffer mit Header 'X-SW-Cache: 1' + 'X-SW-Fetched-At', sonst Netzfehler
  übrige /api/*                           → durchreichen
  navigate (mode === 'navigate')          → Shell aus Cache ('/index.html'), parallel nichts; Fallback Netz
  /assets/*, /icons/*, Precache-Treffer   → cache-first, Fallback Netz
  sonst                                   → network-first, Fallback Cache
push:              §5.5
notificationclick: §5.5
pushsubscriptionchange: §5.5
```
Navigationen werden cache-first aus der versionierten Shell bedient, damit der Start auch offline sofort klappt. Neue Inhalte kommen über das SW-Update (neuer Build → neue `sw.js`-Bytes → Install → `waiting`).

**Client-Registrierung** (`client/src/pwa.ts`): nur in Produktion. `navigator.serviceWorker.register('/sw.js', {scope: '/'})` nach `load`. Prüft `registration.update()` bei jedem `visibilitychange` → sichtbar (max. alle 30 min) und wenn `state.version ≠ __APP_VERSION__`. Ist `registration.waiting` vorhanden (oder kommt `updatefound` → `installed` mit bestehendem Controller), erscheint das Banner „Neue Version da. [Neu laden]“ (§1.5.9).

**Offline-Erkennung im Client:** Antwortet `/api/state` mit `X-SW-Cache: 1` oder schlägt Fetch fehl, ist `offline = true`. Dann erscheint das Banner mit `X-SW-Fetched-At` als „Stand von“, und Schreibaktionen sind deaktiviert. Es gibt keine Offline-Warteschlange (sonst kämen Tipps nach dem Tippschluss an).

### 4.4 App-Badge

`count` = Anzahl Wetten in „Dein Tipp fehlt“ für den aktuellen Namen (`shared/inbox.ts` `missingCount(games, meKey, now)`, dieselbe Funktion auf dem Server für Push). Die App ruft nach jedem State-Update `navigator.setAppBadge(count)` bzw. `clearAppBadge()` auf (try/catch, nur wenn unterstützt). Jeder Push trägt `badge` mit, der SW setzt es. Ohne Namen gibt es kein Badge.

### 4.5 Installation

| Plattform | Erkennung | Weg |
|---|---|---|
| Android/Chrome, Desktop Chrome/Edge | `beforeinstallprompt` | Event abfangen (`preventDefault`) und merken. Angebot (1) in `/ich` „Als App installieren“, (2) einmalig **nach** erfolgreichem Push-Opt-in als Toast „Tipplab als App? [Installieren]“, (3) einmalig nach dem 3. Besuchstag in der Inbox (dezente Karte, ✕ merkt sich 30 Tage). Push geht dort auch ohne Installation. |
| iOS/iPadOS Safari (nicht installiert) | `/iPad|iPhone|iPod/.test(ua) || (platform==='MacIntel' && maxTouchPoints>1)` und nicht `matchMedia('(display-mode: standalone)').matches` und nicht `navigator.standalone` | Statt PushCard kommt die **InstallCard**: „Push gibt's auf dem iPhone nur, wenn Tipplab auf dem Home-Bildschirm liegt. [Zeig mir wie]“ → InstallSheet (§4.6). |
| iOS installiert (standalone) | `display-mode: standalone` | Erststart ohne Namen: Vollbild-Willkommen „Willkommen in der App! Wer bist du?“ + NamePicker → danach PushCard „Du hast's installiert – jetzt noch Push an?“ (direkt angeboten, weil die Absicht klar ist). Permission nur per Tap (User-Geste). |
| iOS < 16.4 oder Browser ohne `PushManager` | `!('PushManager' in window)` und nicht der iOS-Safari-Fall | Status „Push klappt hier nicht (Browser zu alt). Die Seite funktioniert trotzdem.“ |
| Firefox Desktop/Android | normal | Push wie Chrome, Installieren nur Android (Browser-Menü, Hinweistext in `/ich`). |

### 4.6 InstallSheet iOS (Texte)

Titel „Tipplab auf den Home-Bildschirm“
1. „Tippe in Safari auf **Teilen** [Teilen-Icon]. Je nach Ansicht steckt es hinter **⋯** unten rechts.“
2. „Scroll runter und wähle **Zum Home-Bildschirm**, dann **Hinzufügen**.“
3. „Öffne Tipplab **vom Home-Bildschirm** und tipp dort auf **Push an**.“
Hinweis: „Die App startet frisch – wähl deinen Namen dort einmal neu (ein Tap).“ Button „Verstanden“. Jeder Schritt bekommt ein Inline-SVG-Piktogramm.

---

## 5. Push

### 5.1 VAPID

- Schlüssel kommen aus `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`. Fehlen sie, erzeugt der Server beim ersten Start `webpush.generateVAPIDKeys()` und speichert sie in `${DATA_DIR}/vapid.json` (Modus `0600`). Bei späteren Starts liest er die Datei. `VAPID_SUBJECT` hat den Default `PUBLIC_URL` (`https://tipplab.logge.top`).
- Der aktuelle Public Key steht in `meta.vapid_public_key`. Weicht er beim Start ab (Schlüssel gewechselt), löscht der Server alle Abos, weil sie ungültig sind, und loggt eine Warnung. Clients prüfen beim Start `subscription.options.applicationServerKey` gegen `config.vapidPublicKey`. Bei Abweichung folgt `unsubscribe()` + neues `subscribe()` + `POST /api/push/subscribe` ohne Rückfrage (die Permission besteht ja).

### 5.2 Abo-Lebenszyklus (Client `client/src/push.ts`)

1. **Opt-in nur per Tap** auf „Push an“ (User-Geste): `Notification.requestPermission()` → bei `granted`: `registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey)})` → `POST /api/push/subscribe` mit Name und Default-Prefs → Test-Push vom Server (`kind: test`, Text „Push läuft.“ / „Ab jetzt verpasst du keine Wette.“) → Toast „Push ist an.“
2. **Abgelehnt** (`denied`): Status „Blockiert“ in `/ich` mit Anleitung. Es wird nie erneut automatisch gefragt.
3. **Bei jedem App-Start** mit `permission === 'granted'`: `getSubscription()`. Ist eine vorhanden, folgt höchstens alle 24 h ein `POST /api/push/subscribe` (Upsert, frischt den Namen auf). Ist keine vorhanden, obwohl `localStorage['tipplab.push'] === 'on'`, wird still neu abonniert.
4. **Ausschalten** (Hauptschalter aus): `subscription.unsubscribe()` + `DELETE /api/push/subscription`, `localStorage['tipplab.push'] = 'off'`.
5. **Namenswechsel:** `PATCH /api/push/subscription {endpoint, name}`.
6. **Prefs ändern:** `PATCH /api/push/subscription {endpoint, prefs}`, optimistisch in der UI.
7. **`pushsubscriptionchange`** im SW: `fetch('/api/push/config')` → `pushManager.subscribe(...)` → `POST /api/push/resubscribe {oldEndpoint: event.oldSubscription?.endpoint, subscription}`.

### 5.3 Präferenzen pro Gerät (Defaults)

| Schlüssel | Label in `/ich` | Default |
|---|---|---|
| `newGame` | Neue Wette | an |
| `result` | Ergebnis da (inkl. Korrekturen) | an |
| `reminder` | Erinnerung vor Tippschluss, falls du noch nicht getippt hast | an |
| `reminderHours` | … wie früh: 1 Std · 2 Std · 6 Std · 24 Std | 2 |
| `creator` | Meine Wetten (Tippschluss erreicht, Ergebnis fällig) | an |

### 5.4 Push-Arten und Empfänger

Grundregeln: (1) **Wer eine Aktion auslöst, bekommt dazu keinen Push.** (2) **Der Ersteller bekommt nie `new_game` oder `reminder` zur eigenen Wette.** (3) Jede Art höchstens einmal pro Wette und Abo (`push_log.dedupe_key`). (4) Nur Abos, deren Prefs die Art erlauben. (5) Gelöschte Wetten pushen nichts.

| kind | Auslöser | Empfänger | title | body | url | tag / renotify | TTL / urgency | actions |
|---|---|---|---|---|---|---|---|---|
| `new_game` (eine) | Scheduler, `created_at + delay` | alle Abos mit `newGame`, `player_key ≠ Ersteller` | „Neue Wette von {creator}“ | „{prompt} · Tippschluss {Fr 24.10., 20:00}“ bzw. ohne Schluss „{prompt} · Wer tippt zuerst?“ | `/spiel/{id}?von=push` | `game-{id}` / false | 24 h / normal | `tip`: „Tippen“ |
| `new_game` (gebündelt) | ≥ 2 fällige Wetten desselben Erstellers in einem Lauf | dto. | „{creator} hat {n} neue Wetten aufgemacht“ | Prompts mit „, “ verbunden, auf 120 Zeichen gekürzt | `/?von=push` | `new-games` / false | 24 h / normal | – |
| `reminder` | `now ≥ remindAt`, Wette open, Abo-Spieler ohne aktiven Tipp | Abos mit `reminder` | „Noch {2 Std}: {prompt}“ (Dauer gerundet: „{n} Min“ unter 1 h) | „Du hast noch nicht getippt. {k} andere schon.“ (k = 0: „Sei der Erste.“) | `/spiel/{id}?von=push` | `game-{id}` / true | bis `closes_at` / high | `tip`: „Tippen“ |
| `result` | Auflösung | alle Abos mit `result` außer dem Auflöser | „Ergebnis: {prompt}“ | personalisiert, siehe unten | `/spiel/{id}?von=push` | `game-{id}` / true | 7 d / normal | – |
| `correction` | Korrektur | Abos mit `result` von Spielern **mit Tipp**, außer dem Korrigierenden | „Korrektur: {prompt}“ | „Neues Ergebnis {neu} (vorher {alt}). {Gewinnersatz}“ | `/spiel/{id}?von=push` | `game-{id}` / true | 7 d / normal | – |
| `creator_due` | automatischer oder manueller Schluss mit ≥ 1 Tipp (manuell nur, wenn ein Admin statt des Erstellers schließt) | Abos des Erstellers mit `creator` | „Tippschluss: {prompt}“ | „{n} Tipps drin. Trag das Ergebnis ein, sobald es feststeht.“ | `/spiel/{id}/aufloesen` | `game-{id}` / true | 7 d / normal | `resolve`: „Ergebnis eintragen“ |
| `creator_overdue` | 7 Tage nach `closed_at`, nicht aufgelöst | dto. | „{prompt} wartet aufs Ergebnis“ | „Seit 7 Tagen zu. Alle warten auf die Auflösung.“ | `/spiel/{id}/aufloesen` | `game-{id}` / false | 7 d / normal | `resolve` |
| `test` | `POST /api/push/test` / Opt-in | das eine Abo | „Push läuft.“ | „Ab jetzt verpasst du keine Wette.“ | `/` | `test` / false | 1 h / normal | – |

**Erinnerungszeitpunkt:** `remindAt = max(closes_at − reminderHours·h, created_at + (closes_at − created_at)/2)`. Wird `closes_at` vorverlegt (Bearbeiten), werden die Reminder-Dedupe-Einträge der Wette gelöscht und sofort neu bewertet.

**Ergebnis-Body:**
| Lage | body |
|---|---|
| allein gewonnen | „🏆 Du gewinnst! {Ergebnis} · {d} daneben“ (0: „🏆 Volltreffer! {Ergebnis}“) |
| geteilter Sieg | „🏆 Geteilter Sieg mit {andere Gewinner} · {Ergebnis}“ |
| getippt, nicht gewonnen (Zahl) | „{Ergebnis} · {Gewinner} gewinnt · Du: Platz {r} ({d} daneben)“ |
| getippt, nicht gewonnen (Text) | „{Ergebnis} · {Gewinner} gewinnt · Deine Antwort zählt nicht“ |
| niemand gewinnt | „{Ergebnis} · Diesmal gewinnt niemand.“ |
| nicht getippt | „{Ergebnis} · {Gewinner} gewinnt.“ |
(`{Ergebnis}` = `formatAnswer`, `{Gewinner}` mit Gewinnerliste-Format, bei mehreren „{A} und {B} gewinnen“. Ergebnisse dürfen im Push stehen: Die Spannung kommt aus dem eigenen Platz, und für die Gruppe zählt das Tempo.)

**Payload** (JSON, ≤ 1 KB, nie Tippwerte):
```json
{ "v": 1, "kind": "result", "gameId": 1063, "title": "Ergebnis: Kimi K4 – AA-Index",
  "body": "61,2 Punkte · LZH gewinnt · Du: Platz 2 (0,3 daneben)",
  "url": "/spiel/1063?von=push", "tag": "game-1063", "renotify": true, "badge": 1,
  "actions": [] }
```

**Versand** (`server/services/push.ts`): `webpush.sendNotification(sub, payload, {TTL, urgency, topic: tag.slice(0,32), vapidDetails})`. Höchstens 5 parallel. Sendefunktion injizierbar (Tests). Auswertung der Antwort:
- 2xx → `last_success_at`, `fail_count = 0`, `push_log.status`.
- **404/410** → Abo sofort löschen (Log `push.gone`).
- 401/403 → Abo löschen (falscher VAPID-Key).
- 413 → Payload kürzen (body auf 80 Zeichen) und einmal erneut senden.
- 429/5xx/Netzfehler → `fail_count++`, `last_error`. Ein Retry nach 60 s, danach aufgeben. Bei `fail_count ≥ 10` entfernt der Stunden-Job das Abo.
`push_log` wird **vor** dem Versand geschrieben (`INSERT … ON CONFLICT(dedupe_key) DO NOTHING`, nur bei erfolgreichem Insert senden). Das macht Doppelversand bei parallelen Läufen unmöglich.

**Badge-Zahl im Payload:** `missingCount` für den Spieler des Abos zum Versandzeitpunkt (nach der auslösenden Änderung).

### 5.5 Service-Worker-Handler

```ts
self.addEventListener('push', (e) => {
  const d = e.data?.json() ?? { title: 'TIPPLAB', body: '', url: '/', tag: 'misc' };
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title, {
      body: d.body, tag: d.tag, renotify: !!d.renotify, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png',
      data: { url: d.url, gameId: d.gameId, kind: d.kind }, actions: d.actions ?? [], lang: 'de', timestamp: Date.now() }),
    typeof d.badge === 'number' ? (d.badge > 0 ? navigator.setAppBadge?.(d.badge) : navigator.clearAppBadge?.()) : null,
  ]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const { url = '/', gameId } = e.notification.data ?? {};
  const target = e.action === 'resolve' && gameId ? `/spiel/${gameId}/aufloesen` : url;
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(w => new URL(w.url).origin === location.origin);
    if (win) { await win.focus(); win.postMessage({ type: 'NAVIGATE', url: target }); return; }
    await clients.openWindow(target);
  })());
});
self.addEventListener('pushsubscriptionchange', (e) => { /* §5.2 Schritt 7 */ });
```
Der Client hört auf `message` `{type:'NAVIGATE'}` und navigiert mit dem Router (ohne Reload). Ist die History leer (`history.length ≤ 1` oder Start über `?von=push`), legt er `/` darunter, damit „Zurück“ in der App bleibt. Nach einem eigenen Tipp schickt der Client `CLOSE_GAME_NOTIFICATIONS`.

### 5.6 Opt-in-Momente (nie beim ersten Aufruf)

| Moment | Bedingung | UI |
|---|---|---|
| Direkt nach dem **ersten** eigenen Tipp (nach dem Reveal) | Push-Status „aus“ und nicht „später“ gesperrt | PushCard: „🔔 Soll's bimmeln, wenn eine neue Wette kommt oder ein Ergebnis da ist?“ [Push an] [Später]. Auf iOS-Safari die InstallCard |
| Nach dem Anlegen einer Wette | dto. | PushCard-Variante: „Willst du Bescheid kriegen, wenn dein Tippschluss erreicht ist?“ |
| Inbox, wenn „Dein Tipp fehlt“ leer ist | dto. | dezente Zeile „Nichts verpassen? **Push an**“ |
| Leere Inbox (keine offenen Wetten) | Push aus | Button „Bescheid sagen, wenn was kommt“ |
| Erststart der installierten iOS-App | nach der Namenswahl | PushCard „Du hast's installiert – jetzt noch Push an?“ |
| `/ich` | immer | PushSettings |

„Später“ setzt `localStorage['tipplab.pushLater'] = {until: now + 14 d, count}`. Danach erscheint die Karte erst wieder nach Ablauf **und** dem nächsten Tipp. Nach zwei Mal „Später“ wird sie nur noch in `/ich` angeboten.

**Status in `/ich`** (gilt nur für dieses Gerät):
| Zustand | Text | Aktion |
|---|---|---|
| unterstützt, aus | „Push ist aus.“ | [Push an] |
| an | „Push ist an auf diesem Gerät ✓“ | Schalter, [Test-Push schicken] |
| blockiert | „Push ist im Browser blockiert. So schaltest du's frei:“ + Android-Chrome: „Schloss-Symbol in der Adresszeile → Berechtigungen → Benachrichtigungen erlauben“ · iOS-App: „Einstellungen → Mitteilungen → Tipplab → Mitteilungen erlauben“ · Desktop: „Schloss-Symbol → Website-Einstellungen → Benachrichtigungen“ | – |
| iOS-Safari | „Auf dem iPhone geht Push nur in der App vom Home-Bildschirm.“ | [Zeig mir wie] |
| nicht unterstützt | „Push klappt hier nicht (Browser zu alt). Die Seite funktioniert trotzdem.“ | – |
| ohne Namen | „Wähl zuerst deinen Namen, dann kann's bimmeln.“ | [Name wählen] |

---

## 6. Migration

### 6.1 Grundsätze

- Alle 14 Wetten und 46 Tipps werden 1:1 übernommen, inklusive Spiel- und Tipp-IDs, Schreibweisen, Zeitstempeln, Feldern, Ergebnissen und verdeckten Werten.
- `distance/rank/isWinner` werden neu berechnet und gegen die Altwerte geprüft. Die Rangliste muss die Fixture aus §2.8 ergeben.
- **Der Snapshot wird nie committet** (er enthält verdeckte Tipps). Er existiert nur lokal (`legacy/`, `data/`, beide gitignored) und landet per `POST /api/admin/import` auf der Instanz.

### 6.2 Snapshot-Format

**v1** (vorhandene Datei `legacy/snapshot.json`):
```jsonc
{
  "source": "https://ki-score-tippspiel.logge.chatgpt.site",
  "fetchedAt": "2026-10-18T15:04:51.052Z",
  "games": [{
    "id": 1059,                                   // int, wird übernommen
    "prompt": "…", "description": "…", "infoUrl": "…" | null, "benchmark": "…",
    "answerType": "number" | "text",
    "fields": [{ "label": "Score", "unit": "Punkte", "min": 0, "max": 100, "step": 0.1 }],   // text: []
    "phase": "open" | "closed" | "resolved" | "archived",                                   // nur Abgleich
    "createdBy": "Logge",
    "createdAt": "2026-10-06 13:25:28",           // UTC ohne Zone (SQLite datetime)
    "resolvedAt": "2026-10-06 13:34:27" | null,   // dto.
    "closesAt": "2026-…Z" | null,                 // ISO
    "archiveAt": "2026-10-13T13:34:27.000Z" | null,  // nur Abgleich
    "result": [38] | "0.1 / 0.5" | null,
    "tips": [{ "gameId": 1059, "id": 56, "playerName": "LZH", "values": [35] }]   // values NIE null
  }]
}
```
**v2** (von `scripts/import-legacy.mjs` erzeugt) = v1 + `"format": "tipplab-legacy-snapshot@2"`, `"capturedAs": ["", "Logge", "Nöl", …]` und pro Tipp optional `"expected": {"distance": 3, "rank": 1, "isWinner": true}` (aus der alten API, nur bei aufgelösten Wetten).
Der Import akzeptiert beide Versionen. Unbekannte Felder werden ignoriert (Warnung im Report).

### 6.3 Abbildung

| Snapshot | Neu |
|---|---|
| `id` | `games.id` |
| `prompt`, `description`, `infoUrl`, `benchmark`, `answerType` | unverändert (`infoUrl: ""` → NULL) |
| `fields` | `fields_json`, Werte mit `Number()` |
| — | `template = 'legacy'` |
| `createdBy` | `created_by_name`; `created_by_key = nameKey()` |
| `createdAt`, `resolvedAt` (`YYYY-MM-DD HH:MM:SS`) | als UTC lesen (`replace(' ', 'T') + 'Z'`) → ISO mit `.000Z` |
| `closesAt` | ISO normalisiert |
| `resolvedAt` gesetzt | `resolved_by = created_by_name`; `closed_at = closesAt ≤ resolvedAt ? closesAt : resolvedAt`; `closed_by = NULL` |
| `phase = closed`, `resolvedAt = null` | `closed_at = closesAt ?? fetchedAt` |
| `result` | `result_json` |
| — | `winner_tip_ids_json = NULL` (automatische Text-Wertung wie früher) |
| `archiveAt` | nicht gespeichert, nur geprüft (`= resolvedAt + 7 d`) |
| `tips[].id/gameId/playerName/values` | `tips.id/game_id/player_name/values_json`; `player_key = nameKey(playerName)` |
| — | `tips.created_at = NULL`, `device_id = NULL` |
| — | `push_new_sent_at = creator_due_sent_at = creator_overdue_sent_at = Importzeit` (kein Push-Schwall) |
| — | `result_seen` für alle Spieler × alle aufgelösten Wetten (kein Reveal-Schwall) |
| Namen | `players`: Schlüssel aus allen `createdBy` + `playerName`. Anzeigename = häufigste Schreibweise (Gleichstand: früheste nach `createdAt`/Tipp-ID). `color` nach erstem Auftreten (sortiert nach Wette `createdAt`, dann Tipp-ID), 0..7 |
| — | `events`: pro Wette `game.imported` (`actor = NULL`, `data {source, fetchedAt}`), am Ende `import.completed` |
| — | `meta.imported_at`, `meta.imported_source` |
| danach | `sqlite_sequence` für games und tips auf `max(id)` |

### 6.4 `POST /api/admin/import`

- Header `x-admin-token: $ADMIN_TOKEN`. Query: `mode=empty` (Default, 409 bei vorhandenen Wetten) | `replace` (löscht `games`, `tips`, `result_seen`, `events` und importiert neu; `players` werden upgedatet, `push_subscriptions` und `push_log` bleiben), `dryRun=true` (alles prüfen, Transaktion zurückrollen), `force=true` (importiert trotz Wertungsabweichung).
- Alles läuft in **einer** Transaktion.
- **Strukturprüfung** (422 `IMPORT_INVALID` mit allen Befunden): Pflichtfelder, Typen, `tips[].gameId === game.id`, eindeutige Spiel- und Tipp-IDs, `values` passend zum Typ (number: Array der Länge `fields.length`, alles endliche Zahlen; text: String 1–160), höchstens ein Tipp pro `(game, nameKey)`. Es gibt **keine** Bereichs- oder Schrittprüfung (Altdaten bleiben unangetastet, Abweichungen erscheinen nur als Warnung).
- **Prüfungen nach dem Einfügen**, im Report:
  1. Phase: `phaseOf(neu, now)` vs. Legacy-`phase` (`closed`↔`closed`). `resolved`→`archived` durch Zeitablauf ist ok (Hinweis), alles andere ist eine Warnung.
  2. `archiveAt` == `resolvedAt + 7 d`.
  3. Wertung: Für jeden Tipp mit `expected` müssen `distance` (Toleranz 1e-9), `rank` und `isWinner` übereinstimmen. Abweichung → 422 `IMPORT_MISMATCH` (Rollback), außer mit `force=true`.
  4. Stats: berechnete Rangliste im Report.
- **Antwort 200:**
  ```json
  { "ok": true, "dryRun": false, "mode": "empty", "format": "tipplab-legacy-snapshot@2",
    "imported": { "games": 14, "tips": 46, "players": 5 },
    "sequence": { "games": 1062, "tips": 68 },
    "checks": {
      "phases": { "ok": 14, "changed": [ { "id": 1055, "legacy": "resolved", "now": "archived", "note": "7-Tage-Frist abgelaufen" } ], "warnings": [] },
      "archiveAt": { "ok": 7, "mismatches": [] },
      "scoring": { "compared": 23, "mismatches": [] },
      "stats": { "gameCount": 14, "resolvedCount": 7, "playerCount": 5, "tipCount": 46,
                 "table": [ ["1", "Logge", 14, 7, 3, 1, "42,9 %"], ["2", "LZH", 11, 7, 2, 0, "28,6 %"], ["2", "Nöl", 13, 7, 2, 0, "28,6 %"], ["4", "Nikjay", 7, 2, 1, 1, "50 %"], ["–", "BigDick69", 1, 0, 0, 0, "–"] ] }
    },
    "warnings": [] }
  ```
  (`compared` = Anzahl Tipps in aufgelösten Wetten, die `expected` haben.)

### 6.5 `scripts/import-legacy.mjs`

Reines Node-24-Script ohne Abhängigkeiten (globales `fetch`).
```
node scripts/import-legacy.mjs [--source https://ki-score-tippspiel.logge.chatgpt.site]
                               [--out data/legacy-snapshot.json]
                               [--post https://tipplab.logge.top] [--token $ADMIN_TOKEN]
                               [--mode empty|replace] [--dry-run] [--force] [--from-file legacy/snapshot.json]
```
Ablauf:
1. `GET {source}/api/games` (anonym, `cache: no-store`, `User-Agent: tipplab-import/1.0`). Prüft `games[]`, sammelt alle `tips[].playerName` (exakte Schreibweisen, dedupliziert über `nameKey`) und alle `createdBy`.
2. Für jeden Namen nacheinander (300 ms Pause) `GET {source}/api/games?playerName={encodeURIComponent(name)}`. Für jede Wette und jeden Tipp wird `values` übernommen, sobald ein Abruf ihn nicht-null liefert. Aus Antworten aufgelöster Wetten kommt `expected = {distance, rank, isWinner}`. Ein Spieler sieht nach eigenem Tipp alle Werte seiner Wette, deshalb deckt die Menge aller Tippenden jede Wette mit mindestens einem Tipp ab.
3. **Vollständigkeit:** Fehlen danach noch Werte (z. B. ein Abruf scheiterte), bricht das Script mit Exit-Code 2 ab und listet `gameId/tipId/playerName`. Bei HTTP-Fehlern gibt es 3 Retries mit Backoff.
4. Snapshot v2 bauen (`source`, `fetchedAt`, `format`, `capturedAs`, `games` in der Form von §6.2, Felder `canManage/hasTipped/answersRevealed/viewerTip/tipCount` werden entfernt).
5. **Schreiben** nach `--out` (Default `data/legacy-snapshot.json`, Modus `0600`). Liegt der Pfad in einem Git-Worktree, muss `git check-ignore -q <pfad>` erfolgreich sein. Sonst Abbruch mit „Ziel ist nicht gitignored – der Snapshot enthält verdeckte Tipps.“ (Override nur mit `--unsafe-path`).
6. Mit `--post`: `POST {post}/api/admin/import?mode=…&dryRun=…&force=…` mit Header `x-admin-token` (aus `--token` oder Env `ADMIN_TOKEN`; fehlt er, Abbruch). Gibt eine kompakte Zusammenfassung aus (Anzahlen, Phasen-Hinweise, Mismatches, Rangliste als Tabelle). Exit-Code 0 bei `ok`, 3 bei 4xx/5xx.
7. `--from-file` überspringt die Schritte 1–5 und postet eine vorhandene Datei (z. B. die v1-Datei aus `legacy/`).
Das Script schreibt nie verdeckte Werte auf stdout (nur Anzahlen).

### 6.6 Öffentliche Test-Fixture

`test/fixtures/legacy-public.json` = die **anonyme** Antwort der alten API (`legacy/live-api-anon.json`, 18.10.2026), also nur, was ohnehin jeder sehen kann: Werte offener Wetten sind `null`, aufgelöste haben Werte und `distance/rank/isWinner`. Die Test-Hilfe `toSnapshot(fixture)` baut daraus einen v2-Snapshot. Fehlende Werte offener Wetten füllt sie mit Platzhaltern (number: `field.min` je Feld, text: `"x"`). Das beeinflusst die Statistik nicht (zählt nur Tipps, gewertet wird nur Aufgelöstes). `expected` stammt aus der Fixture.
Ein Test sichert, dass die Fixture für keine nicht aufgelöste Wette einen Wert ungleich `null` enthält (Leck-Schutz). `scripts/check-public.mjs` (läuft in `npm test` und als `prepush`-Hinweis im README) schlägt fehl, wenn `git ls-files` etwas unter `legacy/`, `data/`, `docs/internal/`, `docs/audit/` oder eine Datei `*snapshot*.json` außerhalb von `test/fixtures/` listet.

### 6.7 Go-Live-Reihenfolge

1. Deploy mit leerem Volume, `ADMIN_TOKEN` gesetzt.
2. `node scripts/import-legacy.mjs --post https://tipplab.logge.top --dry-run` → Report prüfen (0 Mismatches, Rangliste = Fixture).
3. Dasselbe ohne `--dry-run`.
4. Die alte App wird nicht mehr bespielt. Wer dort nach dem Snapshot tippt, verliert den Tipp. Deshalb erst importieren, wenn die Gruppe Bescheid weiß, oder den Import kurz vor dem Umstieg mit `--mode replace` wiederholen (geht nur, solange auf der neuen Instanz noch niemand getippt hat; sonst gewinnt die neue Instanz).
5. Logge öffnet die neue App, wählt seinen Namen, aktiviert Push und teilt den Link.

---

## 7. Projekt

### 7.1 Struktur

```
tipplab/
├─ package.json                 "type": "module", engines.node ">=24"
├─ package-lock.json
├─ tsconfig.base.json           strict, noEmit, verbatimModuleSyntax, erasableSyntaxOnly, allowImportingTsExtensions
├─ tsconfig.server.json         module/moduleResolution "nodenext", types ["node"], include server/ shared/ test/ scripts/*.ts
├─ tsconfig.client.json         jsx "react-jsx", module "esnext", moduleResolution "bundler", lib dom, include client/src shared/
├─ tsconfig.sw.json             lib ["webworker","es2023"], include client/src/sw shared/
├─ playwright.config.ts
├─ Dockerfile · .dockerignore · .gitignore · .env.example · README.md · LICENSE
├─ docs/
│  ├─ SPEC.md                   (dieses Dokument; öffentlich unbedenklich)
│  └─ internal/                 (gitignored: LEGACY_SPEC.md, UX_AUDIT.md, concepts/, audit/)
├─ legacy/                      (gitignored)
├─ data/                        (gitignored, lokale DB + Snapshot)
├─ shared/                      von Server UND Client importiert, nur erasable TS
│  ├─ types.ts                  Game, Tip, DTOs, Phase, PushPrefs
│  ├─ names.ts                  nameKey, cleanName, validateName, foldKey, levenshtein, similarPlayer
│  ├─ parse.ts                  parseNumber, validateTip, validateResult, validateGameInput, onStep
│  ├─ phase.ts                  phaseOf, closingSoon, archiveAt
│  ├─ scoring.ts                scoreGame, normText, textSuggestions
│  ├─ stats.ts                  computeStats
│  ├─ inbox.ts                  inboxSections, missingCount, notYetTipped
│  ├─ format.ts                 formatNumber, formatValue, formatAnswer, formatDistance, formatDate, relTime, joinNames, ruleSummary
│  ├─ templates.ts              Vorlagen §1.4.4
│  └─ insight.ts                Insight-Zeile §1.7.4
├─ server/
│  ├─ index.ts                  liest Config, buildApp(), listen, Scheduler start, SIGTERM → close
│  ├─ app.ts                    buildApp({db, config, pushSender, clock}) – für Tests injizierbar
│  ├─ config.ts                 Env → typisiertes Config-Objekt, Validierung beim Start
│  ├─ db/
│  │  ├─ index.ts               open(DatabaseSync), Pragmas, migrate()
│  │  ├─ migrations/001_init.sql
│  │  └─ repo.ts                alle SQL-Statements (prepared), Mapping Row ↔ Domain
│  ├─ routes/ health.ts state.ts games.ts tips.ts players.ts push.ts events.ts admin.ts static.ts
│  ├─ services/
│  │  ├─ dto.ts                 toGameDTO(game, tips, viewer, now) inkl. Sichtbarkeit §2.5
│  │  ├─ audit.ts               recordEvent() → events + SSE
│  │  ├─ sse.ts                 Verbindungs-Set, broadcast, heartbeat
│  │  ├─ push.ts                VAPID-Setup, sendTo(), Empfängerlogik, Texte
│  │  ├─ pushTexts.ts
│  │  ├─ scheduler.ts           §2.3
│  │  ├─ importLegacy.ts        §6.4 (reine Funktion + Route)
│  │  ├─ activityText.ts
│  │  ├─ og.ts                  OG-Injection
│  │  ├─ rateLimit.ts
│  │  └─ errors.ts              AppError(code, status, message), Fastify-Error-Handler
│  └─ clock.ts                  now() – in Tests ersetzbar
├─ client/
│  ├─ index.html
│  ├─ vite.config.ts            root client/, outDir ../dist/client, manifest: true, Proxy /api → :3000
│  ├─ vite.sw.config.ts         iife-Build von src/sw/sw.ts → dist/client/sw.js
│  ├─ public/                   manifest.webmanifest, theme-init.js, favicon.svg, robots.txt, icons/*
│  └─ src/
│     ├─ main.tsx · App.tsx · router.ts · store.ts (useSyncExternalStore) · api.ts · sse.ts · push.ts · pwa.ts · storage.ts (try/catch-Wrapper)
│     ├─ screens/ Offen.tsx Spiel.tsx Aufloesen.tsx Bearbeiten.tsx Neu.tsx Ergebnisse.tsx Rangliste.tsx Spieler.tsx Ich.tsx SoGehts.tsx NotFound.tsx
│     ├─ components/ (§1.6, eine Datei je Komponente)
│     ├─ copy.ts                alle Mikrotexte aus §1.7 als Konstanten/Funktionen
│     ├─ styles/ tokens.css base.css layout.css components.css motion.css
│     └─ sw/sw.ts
├─ scripts/
│  ├─ import-legacy.mjs · gen-icons.mjs · gen-vapid.mjs · check-public.mjs · dev.mjs
├─ test/
│  ├─ fixtures/legacy-public.json
│  ├─ helpers.ts                makeApp() mit :memory:-DB, fester Uhr, Fake-Push-Sender; toSnapshot()
│  ├─ names.test.ts parse.test.ts phase.test.ts scoring.test.ts stats.test.ts inbox.test.ts format.test.ts
│  ├─ migration.test.ts api.games.test.ts api.tips.test.ts api.resolve.test.ts api.push.test.ts api.admin.test.ts sse.test.ts scheduler.test.ts
└─ e2e/
   ├─ global-setup.ts           Server mit temp DATA_DIR + ADMIN_TOKEN=e2e starten, Fixture importieren
   └─ smoke.spec.ts
```

**Abhängigkeiten** (exakte Versionen beim Anlegen pinnen, jeweils aktuelle stabile Major):
- runtime: `fastify@5`, `@fastify/static@8`, `web-push@3`, `react@19`, `react-dom@19`
- dev: `vite@7`, `@vitejs/plugin-react`, `typescript@5.9` (für `erasableSyntaxOnly`), `@types/node@24`, `@types/react@19`, `@types/react-dom@19`, `@types/web-push`, `@playwright/test`, `@resvg/resvg-js`
Keine weiteren Laufzeit-Abhängigkeiten (kein Router, kein State-Manager, kein CSS-Framework, kein Icon-Paket, keine Datumsbibliothek).

**Server in TypeScript ohne Build:** Node 24 entfernt Typen nativ. Der Server startet direkt mit `node server/index.ts`. Relative Imports enthalten die Endung `.ts`, verboten sind Enums, Namespaces und Parameter-Properties (`erasableSyntaxOnly` erzwingt das).

### 7.2 npm-Scripts

```json
{
  "dev": "node scripts/dev.mjs",
  "dev:server": "node --watch --env-file-if-exists=.env --disable-warning=ExperimentalWarning server/index.ts",
  "dev:client": "vite --config client/vite.config.ts",
  "build": "npm run typecheck && npm run build:client && npm run build:sw",
  "build:client": "vite build --config client/vite.config.ts",
  "build:sw": "vite build --config client/vite.sw.config.ts",
  "start": "node --disable-warning=ExperimentalWarning server/index.ts",
  "typecheck": "tsc -p tsconfig.server.json && tsc -p tsconfig.client.json && tsc -p tsconfig.sw.json",
  "test": "node scripts/check-public.mjs && node --test --disable-warning=ExperimentalWarning \"test/**/*.test.ts\"",
  "e2e": "playwright test",
  "icons": "node scripts/gen-icons.mjs",
  "vapid": "node scripts/gen-vapid.mjs",
  "import:legacy": "node scripts/import-legacy.mjs",
  "size": "node scripts/size.mjs"
}
```
`dev.mjs` startet `dev:server` und `dev:client` parallel (`child_process.spawn`, gemeinsame Ausgabe mit Präfix, Strg+C beendet beide). `size.mjs` gzippt `dist/client/assets/*.js|css` und schlägt fehl, wenn das Budget (§1.10) überschritten ist. `build` ruft es am Ende auf.

### 7.3 Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
RUN npm run build && npm test

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
```
`.dockerignore`: `node_modules`, `dist`, `data`, `legacy`, `docs/internal`, `docs/audit`, `.git`, `e2e`, `test-results`, `playwright-report`, `.env*`.
Beim Start prüft der Server, ob `DATA_DIR` beschreibbar ist. Wenn nicht, beendet er sich mit Exit 1 und der Meldung „DATA_DIR /app/data ist nicht beschreibbar (Volume-Rechte? Besitzer muss uid 1000 sein).“
**Dokploy:** Anwendung aus dem GitHub-Repo `LoggeL/tipplab`, Build-Typ Dockerfile, Build-Arg `GIT_SHA` = Commit, Domain `tipplab.logge.top` → Container-Port 3000, HTTPS (Let's Encrypt, Pflicht für SW und Push), Volume `tipplab-data` → `/app/data`, Env aus §7.4. Kein Compress-Middleware für `/api/events` (bzw. Traefik-Standard ohne Kompression lassen).

### 7.4 Env-Variablen (`.env.example`)

| Variable | Default | Bedeutung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATA_DIR` | `/app/data` (lokal `./data`) | DB, `vapid.json`, `backups/` |
| `DB_FILE` | `${DATA_DIR}/tipplab.db` | `:memory:` in Tests |
| `PUBLIC_URL` | `https://tipplab.logge.top` | OG-Tags, VAPID-Subject-Default |
| `ADMIN_NAMES` | `Logge` | Komma-Liste, Vergleich über `nameKey` |
| `ADMIN_TOKEN` | – (leer = Admin-Routen aus) | Import/Export, mind. 32 Zeichen, sonst Startfehler |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | – (sonst generiert in `vapid.json`) | Web-Push |
| `VAPID_SUBJECT` | `${PUBLIC_URL}` | `mailto:` oder https-URL |
| `DISPLAY_TZ` | `Europe/Berlin` | Datumsformat in Push und OG |
| `TIP_UNDO_SECONDS` | `5` | Undo-Fenster (0–30) |
| `NEW_GAME_PUSH_DELAY_SECONDS` | `60` | Verzögerung und Bündelung „Neue Wette“ |
| `ONE_TIP_PER_DEVICE` | `true` | Anti-Peek |
| `TRASH_DAYS` | `30` | Papierkorb-Frist |
| `LOG_LEVEL` | `info` | pino |
| `GIT_SHA` | `dev` | Teil von `APP_VERSION` |

### 7.5 `.gitignore`

```
node_modules/
dist/
data/
legacy/
docs/internal/
docs/audit/
*.db
*.db-*
*snapshot*.json
!test/fixtures/*.json
.env
.env.*
!.env.example
test-results/
playwright-report/
```

### 7.6 Tests

**`node:test` (Pflicht, laufen im Docker-Build):**
| Datei | Inhalt (Auszug) |
|---|---|
| `names.test.ts` | `nameKey('  NÖL ')==='nöl'`; NFC/NFD gleich; Whitespace; ungültige Namen; `similarPlayer('Noel')→'Nöl'`, `('Loge')→'Logge'` |
| `parse.test.ts` | Parser (`'0,3'`, `'.5'`, `'1.'`, `'1e3'`→NaN, `'1,2,3'`→NaN); Bereich; Raster inkl. Float (`0.3` bei step 0.1); Ergebnis ohne Raster; Text 0/1/160/161 Zeichen; alle Feld-Validierungen mit exakten Texten |
| `phase.test.ts` | open/closed (closesAt erreicht, closedAt gesetzt)/resolved/archived exakt an der 7-Tage-Grenze; `closingSoon` |
| `scoring.test.ts` | Rundung 57,6−55=2,6; Competition-Ranking 1-2-2-4 und 1-1-3-4; Mehrfeld-Summe; Text auto (Case/Whitespace), manuell (`[]`, Teilmenge), Legacy 747 ohne Gewinner; Sortierung |
| `stats.test.ts` | Fixture → exakt die Tabelle aus §2.8 inkl. Gleichstand LZH/Nöl Platz 2 und BigDick69 ohne Rang; kanonischer Name; gelöschte Wetten und entfernte Tipps zählen nicht |
| `inbox.test.ts` | Sektionen und Sortierung, `missingCount`, `notYetTipped` |
| `format.test.ts` | de-DE-Zahlen, `formatAnswer` Mehrfeld, Distanz/Volltreffer, Datum mit/ohne Jahr, `joinNames` |
| `migration.test.ts` | `toSnapshot(fixture)` → Import: 14/46/5, IDs erhalten, Zeitstempel als UTC-ISO, `closed_at` bei aufgelösten Wetten, Sequenz 1062/68, **alle `expected` stimmen**, Rangliste = Fixture, `result_seen` gesetzt, keine Pushes fällig; `mode=empty` zweimal → 409; `replace` idempotent; `dryRun` schreibt nichts; manipulierter `expected` → 422, mit `force` → 200; Leck-Schutz der Fixture |
| `api.games.test.ts` | Anlegen (Validierungstexte, closesAt-Vergangenheit), Bearbeiten mit/ohne fremde Tipps (`FIELDS_LOCKED`), Schließen/Wieder öffnen, Rechte (Fremder 403, Admin per `ADMIN_NAMES` ok, Groß-/Kleinschreibung), Löschen/Restore/Trash, Activity-Texte |
| `api.tips.test.ts` | Tipp → 201 mit `undoUntil`; **Werte anderer verdeckt bis undoUntil, danach sichtbar** (Uhr vorstellen); Undo im Fenster 204, danach 409; `TIP_EXISTS` case-insensitiv; `DEVICE_TIPPED`; `GAME_CLOSED` nach automatischem Tippschluss; Anonyme sehen nie Werte offener Wetten; closed ohne Tipp verdeckt; Moderation + Restore |
| `api.resolve.test.ts` | dryRun bei open → 409 `GAME_OPEN`; dryRun bei closed liefert Werte + Vorschläge; Auflösen aus open schließt mit; Text manuell; Korrektur bis 7 Tage, danach nur Admin; Statistik ändert sich nach Korrektur |
| `api.push.test.ts` | Subscribe/Lookup/Patch/Delete/Resubscribe; Empfänger: Ersteller bekommt kein `new_game`/`reminder`, Auflöser kein `result`; Bündelung zweier Wetten; Reminder nur an Nicht-Tipper, einmalig, Zeitpunkt-Formel; Badge-Zahl; **404/410 löscht Abo**; 5xx → fail_count; Dedupe bei Doppel-Lauf |
| `sse.test.ts` | `hello` mit serverTime; `tip.created` ohne Wert; Heartbeat (Fake-Timer) |
| `scheduler.test.ts` | Auto-Close sekundengenau via Timer, Events, Nachholen nach Neustart, Purge nach 30 Tagen |
| `api.admin.test.ts` | ohne/falsches Token 401, ohne `ADMIN_TOKEN` 404, Export ohne Push-Keys |

**Playwright-Smoke (`e2e/smoke.spec.ts`)**, Projekte `iphone` (WebKit, `devices['iPhone 13']`) und `pixel` (Chromium, `devices['Pixel 7']`), Server aus `global-setup` mit importierter Fixture:
1. **Erstbesuch & Tipp:** `/spiel/{offene Fixture-Wette}` → Wert per Stepper → NamePicker „+ Neu“ → „Testi“ → „… tippen“ → Undo-Countdown sichtbar → nach 5 s Siegel offen, Werte sichtbar → PushCard sichtbar (Pixel) bzw. InstallCard (iPhone).
2. **Undo:** tippen → „Rückgängig“ → Panel mit gleichem Wert zurück.
3. **Anlegen:** als „Logge“ (localStorage vorab) ＋ → AA-Index → Modellname → veröffentlichen → `/spiel/:id` mit offenem Panel, Toast.
4. **Auflösen Zahl:** zweite Browser-Context-Session tippt als „Nöl“ → Logge: Ergebnis eintragen → „Tippabgabe schließen und weiter“ → Wert → Vorschau nennt Gewinner → veröffentlichen → Ergebnisansicht mit 🏆.
5. **Auflösen Text** mit Häkchen bei zwei Varianten → Geteilter Sieg.
6. **Rangliste** (frische Fixture): Zeilen und Werte exakt wie §2.8.
7. **Legacy-Link:** `/#spiel-1059` → URL `/spiel/1059`, Ergebnis 38 Punkte, LZH 🏆.
8. **PWA:** `manifest.webmanifest` 200 und valide (Name, Icons erreichbar); nach Reload `navigator.serviceWorker.controller` gesetzt; `context.setOffline(true)` + Reload → Shell lädt, Offline-Banner, Tipp-Button deaktiviert.
9. **Layout:** hell und dunkel (`colorScheme`), `document.documentElement.scrollWidth ≤ innerWidth` auf allen Hauptrouten, `body`-Hintergrund je Theme verschieden.
10. **Push-UI (Chromium):** `addInitScript` stubbt `Notification.requestPermission` → `granted` und `PushManager.prototype.subscribe` → Fake-Subscription. „Push an“ → Request `POST /api/push/subscribe` abgefangen, Status „Push ist an“.

---

## 8. Akzeptanzkriterien

**Daten & Migration**
- [ ] Import des echten Snapshots (`--dry-run`, dann echt): 14 Wetten, 46 Tipps, 5 Spieler, IDs unverändert, 0 Wertungsabweichungen.
- [ ] Rangliste nach Import: `14 Wetten · 7 aufgelöst · 5 Leute · 46 Tipps` und exakt die Tabelle aus §2.8.
- [ ] Alte Links `…/#spiel-<id>` landen auf `/spiel/<id>` der richtigen Wette.
- [ ] Nach dem Import werden keine „Neue Wette“-Pushes und keine Reveals für Altwetten ausgelöst.
- [ ] `git ls-files` enthält weder Snapshot noch `legacy/`, `data/`, `docs/internal/`, `docs/audit/`. `npm test` prüft das. Die Fixture enthält keine Werte offener Wetten.

**Kern-Flows (Handy, 390×844)**
- [ ] Erster Tipp über einen geteilten Link: höchstens 2 Taps + 1 Eingabe, ohne Dialog.
- [ ] Von der Push-Notification bis zum abgegebenen Tipp: 2 Taps + 1 Eingabe.
- [ ] Der Tipp-Button zeigt den Wert. Nach dem Tippen läuft ein 5-s-Undo, die Werte anderer erscheinen erst danach. Undo im Fenster stellt den Wert wieder her.
- [ ] Offene, ungetippte Wetten stehen auf `/` immer zuoberst, sortiert nach Tippschluss. Der Zähler in Statuszeile, Bottom-Bar und App-Badge ist identisch.
- [ ] Der aktuelle Name ist auf jedem Screen sichtbar. Bekannte Namen sind per Chip wählbar, „Noel“ löst „Meinst du Nöl?“ aus.
- [ ] Neue AA-Wette: ＋ → AA-Index → Modellname → Veröffentlichen (3 Taps + 1 Eingabe), Default-Tippschluss „In 3 Tagen, 20:00“.
- [ ] Auflösen zeigt eine Gewinner-Vorschau, bei Text Checkboxen mit vorausgewählten Treffern und „ähnlich“-Vorschlägen. „Niemand lag richtig“ ist möglich.
- [ ] Ergebnisansicht: genau eine kombinierte Darstellung (ResultBox + RankedChart), Abweichung mit Einheit, Reveal nur beim ersten Ansehen, `prefers-reduced-motion` respektiert.
- [ ] Ein aufgelöstes Detail passt in ≤ 2 Screens, die Inbox zeigt ohne Scrollen 2 große Karten + 3 Zeilen.
- [ ] Rangliste ohne horizontales Scrollen, alle sechs Kennzahlen sichtbar, eigene Zeile hervorgehoben.

**Lebenszyklus & Regeln**
- [ ] Wetten schließen bei `closesAt` sekundengenau (Server-Event + Client-Timer), ohne Reload sichtbar.
- [ ] Aufgelöste Wetten wandern nach genau 7 Tagen in den Abschnitt „Archiv“ und lassen sich dann nur noch vom Admin korrigieren.
- [ ] Werte offener Wetten liefert die API nie an Betrachter ohne eigenen Tipp (nach Undo-Fenster). Geschlossene ohne eigenen Tipp bleiben bis zur Auflösung verdeckt.
- [ ] Ersteller und `ADMIN_NAMES` (Default „Logge“) dürfen verwalten, alle anderen bekommen 403. Schließen und Löschen haben Undo, gelöschte Wetten sind 30 Tage wiederherstellbar, alle Verwalter-Aktionen stehen im Verlauf mit Gerätekennung.
- [ ] Ergebnis-Korrektur, Wieder öffnen, Bearbeiten (mit Feldsperre nach fremden Tipps) und Tipp-Moderation funktionieren wie spezifiziert.
- [ ] Ein Tipp pro Name und Wette (case-insensitiv) und, bei `ONE_TIP_PER_DEVICE=true`, pro Gerät.

**PWA & Push**
- [ ] Lighthouse-PWA-Installierbarkeit erfüllt (Manifest, Icons 192/512/maskable, SW mit Fetch-Handler, HTTPS). `apple-touch-icon` vorhanden.
- [ ] Offline startet die App aus dem Cache, zeigt den letzten Stand mit Zeitstempel und sperrt Schreibaktionen.
- [ ] Nach einem Deploy erscheint „Neue Version da. [Neu laden]“, ohne automatisches Neuladen während einer Eingabe.
- [ ] Push-Permission wird nie ohne Tap angefragt. Opt-in nach dem ersten Tipp, iOS-Safari bekommt die Installationsanleitung, die installierte iOS-App fragt nach Namen und dann nach Push.
- [ ] Neue Wette → nach ≤ 75 s Push an alle Abos außer dem Ersteller. Mehrere Wetten desselben Erstellers innerhalb der Verzögerung → ein gebündelter Push.
- [ ] Ergebnis → personalisierter Push an alle Abos außer dem Auflöser. Erinnerung X Std (pro Gerät 1/2/6/24, Default 2) vor Tippschluss nur an Nicht-Tipper, genau einmal.
- [ ] Ein Klick auf die Notification öffnet bzw. fokussiert die App direkt auf der Wette (bei Ersteller-Push auf „Ergebnis eintragen“).
- [ ] Abos mit 404/410 werden sofort gelöscht. Push-Präferenzen sind pro Gerät schaltbar, Test-Push funktioniert. Das App-Badge zeigt die Anzahl fehlender Tipps.
- [ ] SSE: Fremde Tipps, neue Wetten und Ergebnisse erscheinen ohne Reload. Der Live-Punkt zeigt den Verbindungsstatus.

**Qualität & Betrieb**
- [ ] `npm run build`, `npm test`, `npm run e2e` grün. Das Docker-Image baut auf `node:24-alpine`, läuft als `node`, `HEALTHCHECK /healthz` ist grün, Daten liegen nur in `/app/data`.
- [ ] JS ≤ 80 KB gzip, CSS ≤ 15 KB gzip (`npm run size`).
- [ ] Hell- und Dunkelmodus folgen dem System, Override in `/ich`, `theme-color` passt. Kontrast AA, Touch-Ziele ≥ 44 px, alle Icon-Buttons haben deutsche Labels, kein horizontales Scrollen ab 320 px.
- [ ] VAPID-Schlüssel entstehen beim ersten Start in `/app/data/vapid.json`, falls keine Env-Werte gesetzt sind. Ein Neustart behält sie.
- [ ] Tägliches SQLite-Backup in `/app/data/backups/` (14 Stück).

---

## 9. Nicht im Umfang v1 (bewusst)

Punktesystem 3/2/1 und zweite Rangliste · Duelle/Rivalitäten · Serien, Titel, Badges · Reaktionen · Spruch zum Tipp · Anstupsen · Kopplungscodes/Geräte-Rechte/PIN · Nachtruhe für Push · Spielerfarbe wählbar · Slider-Lupe · Referenzmarken aus alten Ergebnissen · Desktop-Zweispalter · Pagination/Lazy-Load (ab ~300 Wetten nachrüsten: `GET /api/games?phase=archived&before=`) · Stimmungsbild-Wetten ohne Auflösung · E-Mail · Mehrsprachigkeit.

---

## 10. Die 20 wichtigsten Entscheidungen

1. **Synthese:** Gerüst und Flows aus Speed, Vertrauensmodell aus Clarity, Reveal-Momente aus Social. Punktesystem, Duelle, Serien und Kopplungscodes sind verworfen.
2. **Ohne Auth, Name = Person.** `nameKey` = NFC + trim + Whitespace + de-DE-lowercase (legacy-kompatibel). Die Gerätekennung dient nur Audit, Push und Anti-Peek, nie als Recht.
3. **Rechte:** Ersteller oder `ADMIN_NAMES` (Default „Logge“). Abgesichert durch Umkehrbarkeit (Undo, Papierkorb 30 Tage, Korrektur, Wieder öffnen) und einen öffentlichen Verlauf mit Gerätekennung statt Login.
4. **Sichtbarkeit:** Werte erst nach eigenem Tipp (nach Ablauf des Undo-Fensters) oder nach der Auflösung. Geschlossene Wetten bleiben verdeckt, damit Wieder öffnen fair bleibt und der Reveal der Auflösung gehört. Ausnahme: der Verwalter im Auflösen-Screen einer geschlossenen Wette.
5. **Tipp-Finalität:** Wert im Button + 5-s-Undo mit verzögertem Aufdecken statt Bestätigungsdialog (kein Spickfenster, ein Tap weniger).
6. **Anti-Peek light:** ein Tipp pro Gerät und Wette (abschaltbar), Label „neu“ für Erst-Tipper, Moderation durch Verwalter.
7. **IA:** vier Ziele: Offen-Inbox (nach Handlungsbedarf), Ergebnisse („Diese Woche“ + „Archiv“), ＋ Neue Wette, Rangliste. `/ich` über den Namens-Chip, jede Wette mit eigener Route als Push- und Share-Ziel.
8. **Ein Phasenmodell** `open|closed|resolved|archived` in einer geteilten Funktion für Server und Client. `closedAt` getrennt von `closesAt`, Archiv = `resolvedAt + 7 d` (abgeleitet, mit Wirkung: Korrektur danach nur noch durch Admin).
9. **Automatischer Tippschluss** sekundengenau (Scheduler-Tick 15 s + Timer auf den nächsten `closesAt`), Default beim Anlegen „In 3 Tagen, 20:00“.
10. **Wertung identisch zur alten App** (Summe absoluter Abweichungen, `round6`, Competition-Ranking), Text zusätzlich mit manueller Gewinnerwahl (`winnerTipIds`; NULL = alte automatische Regel). Gewertet wird beim Lesen.
11. **Rangliste:** die alte Formel als einzige Rangliste (Fixture bleibt exakt). Nur Darstellung verbessert: Zeilen, kanonischer Name, Formkurve, Klartext-Fußnote.
12. **Anlegen über 8 Vorlagen** (alte 5 enthalten) auf einem Screen. Technische Felder liegen unter „Feinjustierung“, Live-Vorschau des Tippfelds, Hinweis „Klingt nach Zahl“ bei Freitext.
13. **Datenmodell:** SQLite mit `players`, `games` (Felder als JSON), `tips` (partielle Unique-Indizes), `result_seen`, `push_subscriptions`, `push_log`, `events` (Audit + SSE-Quelle). Soft-Delete, ISO-UTC-Zeiten, tägliches `VACUUM INTO`-Backup.
14. **API:** REST mit einem Sammel-Endpunkt `/api/state`, Aktionen als eigene Routen (`close`, `reopen`, `resolve`, `correct`, `restore`), `dryRun` für die Vorschau, einheitliches Fehlerformat mit deutschen Texten.
15. **Live:** SSE ohne Nutzdaten (nie Werte oder Ergebnisse), der Client refetcht `/api/state` gebündelt. Reconnect mit Voll-Refetch, ohne Replay.
16. **Push-Arten:** neue Wette (60 s verzögert, pro Ersteller gebündelt), Erinnerung X Std vorher nur an Nicht-Tipper, personalisiertes Ergebnis, Korrektur, Ersteller-Pushes. Wer auslöst, bekommt keinen Push, der Ersteller nie `new_game`/`reminder` zur eigenen Wette. Dedupe über `push_log`, Aufräumen bei 404/410.
17. **Push-Opt-in** nur per Tap, primär direkt nach dem ersten Tipp. Auf iOS führt der Weg über die Installationsanleitung, die installierte App fragt zuerst den Namen und dann Push. Präferenzen pro Gerät.
18. **PWA:** handgeschriebener SW mit versioniertem Shell-Precache (cache-first für Navigation und Assets), API network-first mit Cache-Fallback (offline lesbar, ohne Schreib-Warteschlange), Update-Banner statt stillem `skipWaiting`, App-Badge = fehlende Tipps.
19. **Migration:** Import per `POST /api/admin/import` (`x-admin-token`, Modi empty/replace, dryRun, Wertungsabgleich mit `expected`) und `scripts/import-legacy.mjs` (anonym + pro Spielername ziehen, Vollständigkeitsprüfung, Schreiben nur an gitignored Pfade). Die öffentliche Test-Fixture ist die anonyme API-Antwort.
20. **Stack-Umsetzung:** Server in TypeScript ohne Build (Node-24-Type-Stripping, `erasableSyntaxOnly`), geteiltes `shared/`, React 19 ohne Router- und State-Bibliotheken, keine Webfonts, Budget 80 KB JS gzip. Ein `node:24-alpine`-Image als `USER node`, `HEALTHCHECK /healthz`, Volume `/app/data`.
