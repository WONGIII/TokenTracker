<div align="center">

<img src="./docs/logo.svg" alt="TokenTracker ZzH" width="132" />

# TokenTracker ZzH

**Dies ist mein eigener, angepasster Build von [xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)** — derselbe Tracker mit meinen Anpassungen: Backend auf meinen eigenen Server umgestellt, ZzH als Standard-Desktop-Pet, kein OAuth und eine eigene Deep-Link-, Port- und Icon-Identität, damit er neben dem Original laufen kann.

[English](./README.en.md) · [简体中文](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · **Deutsch**

### Jeden AI-Token erfassen — und die Nutzung sichtbar machen

Ein genaues, local-first Dashboard für Token-Verbrauch und Kosten über **39 AI-Coding-Tools** — plus Desktop-Pet, native Widgets und Cloud-Sync über meinen eigenen Server statt über den des Originalprojekts.

<img src="./docs/screenshots/zzh-dashboard.png" alt="Dashboard" width="880" />

---

## Was dieser Build ändert

Das Original ist ein fertiges Produkt; dies ist mein persönlicher Build davon. Hier steht das vollständige Delta.

| | Änderung |
|---|---|
| ☁️ **Eigenes Backend** | Sync, geräteübergreifende Kontoansicht und Leaderboard laufen über meinen eigenen Server statt über den gehosteten Dienst des Originalprojekts. Auch die **Standard-Backend-URL** der CLI zeigte auf das Original und wurde geändert. |
| 🔑 **Kein OAuth** | Die Anmeldung ist nur E-Mail + Passwort. Alle OAuth-Provider-Slots sind serverseitig leer, und die Provider-Buttons wurden aus der UI entfernt, statt sie ins Leere laufen zu lassen. |
| 🐾 **ZzH** | Eine pinke „Z"-Marke auf Weiß und ein neues Standard-Pet (v2-Sprite-Atlas) ersetzen den schwarzen Blitz und Clawd — in Tray, Taskleiste, Favicon und Dashboard. |
| 🔗 **Kein Schema-/Port-Konflikt** | `ttzzh://` statt `tokentracker://`, CLI-Port **17890** statt 7680 und eine eigene Installer-Identität. Ein Klick auf „in App öffnen" auf der Original-Website startet also deren App, nie diese. |
| 🧩 **Mehrere Konten pro Adapter** | Die Limits-Seite kann mehr als einen Login pro Anbieter verfolgen, jeweils mit eigenem Key und Tarif. |
| 💰 **Ergänzte Modellpreise** | DeepSeek V4.1 Flash und seine Aliase werden zu den V4-Flash-Preisen berechnet statt mit $0 — inklusive Off-Peak-Rabatt. |
| 📉 **Zwei Kostenfehler behoben** | Das Detail-Modal berechnete Modell-Aggregate statt Einzelzeilen und berechnete damit jeden DeepSeek-Token zum Peak-Preis (~1,7× der Headline). |
| 🐟 **DeepSeek Harness separat gezählt** | Das Original schob `dsh` unter "Other". Die Rangliste hat eine eigene Spalte mit Icon, das Profil-Fenster listet den Anbieter separat, und die **Sitzungsliste** erfasst ihn (308 von 392 Sitzungen hier) mit eigenem Filter. |
| 🔄 **Vollständiger Upload beim Login** | Nach einem Kontowechsel schickt die erste Synchronisierung die **gesamte** lokale Warteschlange auf einmal, statt alle 15 Minuten 1000 Zeilen; danach nur noch Deltas. |
| 🖼️ **Avatar per Bild-URL** | Ohne OAuth gibt es keinen Anbieter-Avatar: In den Einstellungen fügst du einen Bildlink ein, den Kopfzeile, Seitenleiste und Rangliste nutzen. Der Link wird zwischengespeichert: Neuladen ist sofort, Änderungen greifen unmittelbar. |
| 🔧 **Eine Reihe nie funktionierender Funktionen** | Erfolge, Profil-Likes, die Ranglisten-Rollups und die Community-Statistiken haben in diesem Code nie funktioniert — fehlende Tabellen, fehlende Funktionen, kein Zeitplan oder eine Rollup-Pipeline ohne Daten. Alles behoben und als Migrations festgehalten. |
| 🧹 **Lokalen Cache leeren** | Einstellungen → Konto hat einen Ein-Klick-Knopf für zwischengespeicherte Ranglisten-Zeiträume, Community-Statistiken und Vorablade-Daten; danach lädt die Seite neu. |

---

## Screenshots

| Limits —— mehrere Konten pro Adapter | Sessions |
|---|---|
| <img src="./docs/screenshots/zzh-limits.png" alt="Limits" width="440" /> | <img src="./docs/screenshots/zzh-sessions.png" alt="Sessions" width="440" /> |

| Skills | Erfolge |
|---|---|
| <img src="./docs/screenshots/zzh-skills.png" alt="Skills" width="440" /> | <img src="./docs/screenshots/zzh-achievements.png" alt="Erfolge" width="440" /> |

| Desktop-Pet | |
|---|---|
| <img src="./docs/screenshots/zzh-pet.png" alt="Pet" width="440" /> | |

---

## Mehrere Konten pro Adapter

Bisher wurde pro Anbieter genau **ein** Konto verfolgt — das, mit dem die lokale CLI angemeldet war. Das reicht nicht, wenn man ein Arbeits- und ein privates Konto pflegt oder zwei API-Keys mit unterschiedlichen Tarifen.

Konten in `~/.tokentracker/tracker/config.json` ergänzen:

```json
{
  "limits": {
    "accounts": [
      { "id": "commandcode-goat", "provider": "commandCode",
        "label": "CommandCode GOAT", "plan": "GOAT", "apiKey": "user_..." },
      { "id": "commandcode-go", "provider": "commandCode",
        "label": "CommandCode Go", "plan": "Go", "apiKey": "user_..." },
      { "id": "kimi-work", "provider": "kimi",
        "label": "Kimi (Arbeit)", "plan": "Moonshot", "apiKey": "sk-..." },
      { "id": "codex-alt", "provider": "codex",
        "label": "Codex (Zweitkonto)", "home": "~/.codex-work" }
    ]
  }
}
```

Jeder Eintrag wird eine eigene Karte — eigenes Label, eigenes Tarif-Badge, eigene Kontingent-Fenster und Reset-Zeiten. Zwei Credential-Modi, weil die Adapter unterschiedlich funktionieren:

- **`apiKey`** — die Quota-API des Adapters akzeptiert einen expliziten Key. Unterstützt für **kimi**, **opencodeGo** und **commandCode**; der Key ersetzt die lokale CLI-Suche vollständig.
- **`home`** — der Adapter authentifiziert sich über die lokale CLI-Sitzung, ein zweites Konto bedeutet also ein zweites Profilverzeichnis. Dort mit der jeweiligen Variable anmelden (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GEMINI_HOME`, `KIMI_HOME`) und das Konto darauf zeigen lassen.

Ein Adapter, der beides nicht kann, meldet „Dieser Adapter liest sein Kontingent aus dem lokalen CLI-Login", statt die Zahlen des eingebauten Kontos still unter einem zweiten Label zu zeigen. ZCode gehört bewusst dazu: Endpunkt und Tarifart lassen sich nur aus der lokalen Installation ableiten.

---

## Installation und Start

Erfordert **Node.js ≥ 20**.

```bash
git clone https://github.com/WONGIII/TokenTrackerZzH.git
cd TokenTrackerZzH
node bin/tracker.js            # installiert Hooks, synchronisiert, öffnet das Dashboard
```

Das Dashboard läuft lokal unter http://localhost:17890 . Die Windows-Tray-App wird aus TokenTrackerWin/ gebaut (Schritte in MODIFICATIONS.md); sie installiert sich neben dem Original (%LOCALAPPDATA%\Programs\TokenTrackerZzH).

Nicht auf npm. npx tokentracker-cli installiert das Paket des Originals, nicht diesen Build. Nutze das Repository oder ein Release-Asset.

---

## Sync ist optional

Die Anmeldung ist völlig optional: ohne Konto bleibt alles lokal, genau wie im Original.

**Wird bei Anmeldung gesendet:** stündliche Nutzungs-Buckets (`hour_start`, `source`, `model`, die fünf Token-Spalten, `total_tokens`, `conversation_count`) sowie eine Maschinen-ID bei der Geräteregistrierung.

**Wird nie gesendet:** Prompts, Antworten, Dateiinhalte, Projekt- oder Repositorynamen, Dateipfade und jegliche Provider-Zugangsdaten. Die Dateien pro Projekt und pro Sitzung (`project.queue.jsonl`, `session.queue.jsonl`) werden nie hochgeladen.

### Dienste Dritter, die dieser Build weiterhin kontaktiert

Nichts davon gehört dem Original:

| Dienst | Wann | Was |
|---|---|---|
| Die APIs der AI-Anbieter selbst (Anthropic, OpenAI, Cursor, Google, GitHub Copilot, xAI, Kimi, Z.ai, Qoder, Devin, CommandCode, iFlytek, TRAE) | Solange Kontingent-Balken sichtbar sind | Liest **dein** Kontingent mit Zugangsdaten, die bereits auf deinem Rechner liegen. Direkt vom Rechner zum Anbieter, ohne Mittelsmann |
| `raw.githubusercontent.com` | Höchstens einmal täglich | Die öffentliche LiteLLM-Preistabelle (reiner Download) |
| `api.github.com` | Beim Laden des Dashboards | Star-Zahl dieses Repositories |
| `codex-pets.net` | Nur beim Import eines Pets | Die gewählte Pet-ID |
| `open.er-api.com` | Nur bei Nicht-USD-Währung | Nichts außer der Anfrage |
| `ip.net.coffee`, `claude.ai`, `1.1.1.1` | Nur auf der IP-Check-Seite | Deine IP ist der Zweck dieser Seite |
| Statusseiten der Anbieter | Nur auf der Service-Status-Seite | Nichts außer der Anfrage |
| `fonts.googleapis.com` | Nur beim Erzeugen eines Share-Bilds | Übliche Webfont-Anfrage |

Es gibt **keinen Analytics-Dienst**: Der PostHog-Key ist leer, und der anonyme Install-Heartbeat geht jetzt an **meinen** Server (abschaltbar mit `TOKENTRACKER_NO_TELEMETRY=1`).

---

## Danksagung und Lizenz

MIT, wie das Original. Die ursprüngliche `LICENSE` (Copyright (c) 2026 xiufengsun) bleibt unverändert, und alle meine Änderungen stehen in [`MODIFICATIONS.md`](./MODIFICATIONS.md). Dieser Build wird vom Originalprojekt weder unterstützt noch dorthin zurückgegeben.

- Original: **[xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)** — das eigentliche Produkt, alle 39 Anbieter, das ursprüngliche Dashboard
- Backend: **[InsForge](https://github.com/InsForge/InsForge)** — das selbst gehostete BaaS
- Modellpreise: **[LitellM](https://github.com/BerriAI/litellm)** — die Preistabelle
