---
title: Fewer Desktop App
description: Using the standalone desktop app — local library, .fwr saves, themes, licensing, and offline use.
---

# Fewer Desktop App

The Fewer desktop app is a **standalone, local-first** build of Fewer. It runs entirely on your machine: no account, no server, no network required (URL import is the one optional online feature).

## Your library

On first launch the app creates a library folder at:

```
~/Documents/fewer
```

Saved projects live in `graphs/` as **`.fwr`** files — Fewer's portable graph document (`{ format_version, app, graph }`). Named themes live in `themes/` as **`.fwtheme`** files. Both are plain JSON you can copy, back up, or sync with any file tool.

- Legacy library files saved as `.json` stay readable — the app scans both extensions.
- You can point the library at a different folder any time from **Saved → library location**.
- Dropping `.fwr` files into the `graphs/` folder by hand works too: the app rescans the directory.

## Import & export

- **Import** accepts `.fwr` (and raw `.json` graph exports), ASCII trees, shell scripts, CSV, DOT, directory files, GitHub repository URLs, and public file-index URLs.
- **Export** offers SVG, PNG, JSON, CSV, DOT, shell script, ASCII tree, and **Fewer graph (`.fwr`)** for a portable copy of the whole project.

**Drag and drop**: drag a folder from your file manager onto the canvas to open
it as the graph — the app asks before replacing the one you have. Drop a file
instead and it opens in your system's default app for that type.

### Opening a graph

- **Double-click a `.fwr`** in your file manager: Fewer claims the format, so
  the document opens in the app (Linux, macOS and Windows all register the
  association; a graph dropped on a running window opens there too instead of
  starting a second one).
- **Open Recent** appears in *File & Actions* once you have opened a document —
  the five most recent, click to reopen. A file that has since moved or been
  deleted drops off the list automatically.

GitHub and URL imports fetch directly from your machine — no proxy server in between. They are the only network traffic the app ever makes, and only when you ask for them.

### Updating a folder on the canvas

Right-click a folder card → **Refresh from Disk** re-scans that folder against
the real directory and replaces its subtree, reporting what appeared (`+3 / -1`)
and what disappeared. The desktop app reads the directory directly through its
own file-system bridge, so refresh works fully offline — no server, no browser
permission prompt. The graph root's card offers it too.

## Themes

The theme editor saves named themes to your library as `.fwtheme` files. No sign-in, no cloud gallery — themes are yours on disk. Theme files are portable JSON: share the file itself with another Fewer install.

## Licensing

The desktop app uses a **license key** instead of an account:

- Without a license the app runs in **free mode**: canvas, layout, search, undo/redo, import, and watermarked exports.
- A license unlocks saved projects, docking, tags, custom themes, metrics, batch operations, version history, analytics, and unbranded exports.

Activate a license from **Settings → License**. License checks are offline (Ed25519 signature verified on-device).

## Updating

Download a new build from the releases page and install it over the old one — your library folder is untouched. Unsigned builds: on macOS right-click → Open the first time; on Windows SmartScreen may warn on first run (More info → Run anyway).

## Reporting a bug

**Settings → Help → Report an Issue** collects diagnostics (app version, layout, graph stats) and builds a pre-filled GitHub issue that opens in your **default browser** — review it there and press *Submit new issue*. **Download** / **Copy** give you the raw JSON if you'd rather attach it somewhere else. The desktop app files issues through GitHub only; there is no email submission.

**Settings → Help → Export Settings** saves a JSON snapshot of every Fewer setting on this device (theme, panel layout, search history, license state) — useful as a backup, or as the file to attach to a bug report.

## Troubleshooting

- **Library won't save** — check that the library folder (default `~/Documents/fewer`) exists and is writable.
- **A graph won't open** — the `.fwr` file may be corrupted; the app skips unreadable files rather than crashing, and the rest of the library still loads.
- **GitHub import says "not found"** — unauthenticated GitHub API access is rate-limited to ~60 requests/hour; wait an hour or use a folder download instead.
