# Roadbook 4.0

Diese Version ist für GitHub Pages vorbereitet.

## Ordnerstruktur

```text
Roadbook/
├── index.html
├── manifest.webmanifest
├── service-worker.js
└── assets/
    ├── style.css
    ├── app.js
    └── campsites.js
```

## Wichtig beim Hochladen

Lade **den Inhalt dieses Ordners** hoch, nicht den übergeordneten Ordner `roadbook-v4`.

`index.html`, `manifest.webmanifest`, `service-worker.js` und der Ordner `assets` müssen direkt im Hauptverzeichnis des Repositorys liegen.

## GitHub Pages

1. Repository öffnen.
2. `Settings` → `Pages`.
3. Quelle: `Deploy from a branch`.
4. Branch: `main`, Ordner: `/root`.
5. Speichern.
6. Danach ein bis zwei Minuten warten.

## Daten

Status, Notizen, Preise und eigene Campingplätze werden im Browser gespeichert. Über `Mehr` können die Daten exportiert und importiert werden.


## Version 4.1

Camping-Schnellmodus ohne Preis und Rückrufdatum. Neu: Priorität A/B/C, große Ergebnisbuttons, automatische Anrufreihenfolge und Fortschrittsanzeige.


## Version 4.2 – Rückrufrunde

Die Telefon-Warteschlange arbeitet nun in zwei Phasen:

1. Zuerst erscheinen alle Campingplätze mit „Noch anrufen“.
2. „Nicht erreicht“ und „Erneut anrufen“ wandern ans Ende.
3. Sobald alle Erstanrufe erledigt sind, startet automatisch die Rückrufrunde.
4. Reserviert, Ausgebucht und Warteliste gelten als abgeschlossen.
