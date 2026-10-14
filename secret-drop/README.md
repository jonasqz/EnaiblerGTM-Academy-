# secret-drop

Eine Datei, ein Shared Secret, ein Raumschiff. Ohne Abhängigkeiten (nur Node), ein Container.

Der Empfänger sieht „Hey Anna! Jonas will eine Datei mit dir teilen“. Mit Secret startet der Download.
Ohne Secret kann er stattdessen Space Aliens spielen und die Seite Wort für Wort zerschießen.

## Starten

```bash
SHARE_SECRET=geheim FILE_PATH=./Angebot.pdf node server.js
# http://localhost:3000/?to=Anna&ref=li-42
```

## Umgebungsvariablen

| Variable | Pflicht | Standard | Wofür |
| --- | --- | --- | --- |
| `SHARE_SECRET` | ja | | Das Secret. Ohne startet der Server nicht. |
| `FILE_PATH` | | `/data/file` | Pfad zur Datei im Container |
| `DOWNLOAD_NAME` | | Dateiname | So heißt die Datei beim Empfänger, z. B. `Angebot März.pdf` |
| `SENDER_NAME` | | `Jonas` | „Jonas will eine Datei mit dir teilen“ |
| `NOTE` | | | Optionaler Satz unter der Überschrift |
| `EVENTS_FILE` | | | Events zusätzlich als JSON Lines in diese Datei schreiben, z. B. `/data/events.jsonl` |
| `MAX_ATTEMPTS` | | `10` | Falsche Versuche pro IP in 15 Minuten |
| `TRUST_PROXY` | | `true` | IP aus `X-Forwarded-For` lesen (hinter Coolify/Traefik richtig) |
| `PORT` | | `3000` | |

## Coolify

1. Neue Resource → Dockerfile, Base Directory `/secret-drop`, Port `3000`.
2. Persistent Storage: Volume auf `/data` mounten und die Datei hineinlegen (z. B. `/data/file` oder per `FILE_PATH` umbenennen).
3. `SHARE_SECRET` (und `DOWNLOAD_NAME`) als Environment Variables setzen. Datei tauschen = Datei im Volume ersetzen, kein Redeploy nötig.

## Links personalisieren

Alle Parameter sind optional und landen im Event-Log:

- `to` – Name in der Begrüßung („Hey Anna!“)
- `ref` – frei wählbare ID, z. B. pro Empfänger oder Kanal
- `utm_*` – wie üblich

Beispiel: `https://drop.example.com/?to=Anna&ref=anna-li&utm_source=linkedin`

## Tracking

Keine Cookies, kein Drittanbieter. Jedes Event ist eine JSON-Zeile auf stdout (in Coolify unter Logs) und optional in `EVENTS_FILE`:

```json
{"t":"2026-10-14T16:45:41.405Z","event":"unlock_ok","to":"Anna","ref":"li1","visitor":"440f146ab879"}
```

Events: `view`, `unlock_ok`, `unlock_failed`, `unlock_blocked`, `download`, `game_start`, `game_over`, `game_win`, `game_exit` (die Spiel-Events mit `score`).
`visitor` ist ein Hash aus IP, Browser und Secret: gleiche Person, gleiche ID, keine IP im Log.
`bot: true` markiert Link-Vorschauen (Slack, LinkedIn, WhatsApp …), damit die nicht als Öffnung zählen.

Auswerten, z. B.: `grep '"ref":"anna-li"' /data/events.jsonl`

## Sicherheit

- Secret-Vergleich in konstanter Zeit, max. 10 Fehlversuche pro IP und 15 Minuten.
- Nach dem Secret gibt es einen Download-Link, der 5 Minuten gilt. Die Datei liegt nie öffentlich.
- `noindex`, `no-referrer`, strikte Content Security Policy, kein Framing.
- Ein Secret für alle Empfänger: wer es weitergibt, gibt die Datei weiter. Für sensible Dateien das Secret pro Versand wechseln.

## Spiel

Pfeiltasten oder WASD: drehen, Schub, bremsen. Leertaste: feuern. Esc: beenden. M: Ton.
Auf dem Handy: tippen und halten, das Schiff fliegt zum Finger und feuert.
Wörter, Buttons und vorbeifliegende Sachen gehen mit einem Treffer kaputt, die Karte erst, wenn nichts mehr auf ihr steht.
