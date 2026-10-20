---
title: Fewer Desktop App
description: Using the standalone desktop app: local library, .fwr saves, themes, licensing, and offline use.
---

# Fewer Desktop App

The Fewer desktop app is a **standalone, local-first** build of Fewer. It runs entirely on your machine: no account, no server, no network required (URL import is the one optional online feature).

## Your library

On first launch the app creates a library folder at:

```
~/Documents/fewer
```

Saved projects live in `graphs/` as **`.fwr`** files (Fewer's portable graph document, the JSON shape `{ format_version, app, graph }`). Named themes live in `themes/` as **`.fwtheme`** files. Both are plain JSON you can copy, back up, or sync with any file tool.

- The library reads **`.fwr` files only**: an older `.json` copy of a saved graph is not scanned (export it again as `.fwr` to bring it back).
- You can point the library at a different folder any time from **Saved → library location**.
- Dropping `.fwr` files into the `graphs/` folder by hand works too: the app rescans the directory.

## Import & export

- **Import** accepts `.fwr` documents, which restore whole with their cards, positions, tags and groups; raw `.json` graph exports, which rebuild the graph from their structure; ASCII trees; shell scripts; CSV; DOT; directory files; GitHub repository URLs; and public file-index URLs.
- **Archives inside a folder are always opened**: when you open a folder, any `.zip`, `.tar`, `.7z` or `.rar` found along the way shows its contents directly on the canvas — the archive is read in place, never extracted to disk. Refresh from Disk keeps this behaviour.
- **Export** offers SVG, PNG, JSON, CSV, DOT, shell script, ASCII tree, and **Fewer graph (`.fwr`)** for a portable copy of the whole project. The `.fwr` carries cards, positions, tags and groups.

- **Double-click a folder** to zoom to fit; **double-click a file** to open it
  in your operating system's default application — the same opener as the
  right-click **Open File** and **Enter**. Files that only exist inside an
  expanded archive zoom instead of opening.

**Drag and drop**: drag a folder from your file manager onto the canvas to open
it as the graph, and the app asks before replacing the one you have. Drop a file
instead and it opens in your system's default app for that type.

### Opening a graph

- **Double-click a `.fwr`** in your file manager: Fewer claims the format, so
  the document opens in the app (Linux, macOS and Windows all register the
  association; a graph dropped on a running window opens there too instead of
  starting a second one).
- **Open Folder** appears in *File & Actions* (and on the empty canvas): it
  opens the native folder picker straight away — no import dialog. The other
  import origins (URL, GitHub, archive, file) stay behind **More sources…**.
- **Recent Folders** appears in *File & Actions* once you have opened a
  folder: the eight most recent roots, one click re-opens each. A folder that
  has since been deleted or unmounted drops off the list automatically.
- **Open Recent** appears in *File & Actions* once you have opened a document:
  the five most recent, click to reopen. A file that has since moved or been
  deleted drops off the list automatically.

GitHub and URL imports fetch directly from your machine: no proxy server in between. They are the only network traffic the app ever makes, and only when you ask for them.

### Updating a folder on the canvas

Right-click a folder card → **Refresh from Disk** re-scans that folder against
the real directory and replaces its subtree, reporting what appeared (`+3 / -1`)
and what disappeared. The desktop app reads the directory directly through its
own file-system bridge, so refresh works fully offline: no server, no browser
permission prompt. The graph root's card offers it too.

### Tags and groups follow the folder

The desktop app remembers the **tags and groups you attach while exploring a
folder** — no save button, nothing to press. Tag or group something, keep
working, close the app: reopen the same folder (Open Folder or Recent
Folders) and the tags, tag colours and groups come back exactly as you left
them, attached to the same files and folders.

- The metadata lives next to the app's search index, in the app's own data
  folder — never inside the folder you opened, never in the cloud.
- Membership follows the file's path, so a re-scan of the folder re-attaches
  everything; files you deleted from disk simply drop out of their groups.
- Because a folder carries its own metadata, the desktop sidebar has no
  "Your Directories" section: reopening the folder IS reopening your work.

### Big folders appear instantly

Opening a folder no longer waits for a full crawl. The app shows the **first
two levels right away** and keeps scanning the rest in the background — deeper
cards appear as they are read. A chip in the header reports progress
(`Scanning app · 12,340 cards · 2,140 folders`) and can stop the crawl.

- The background crawl pauses at **25,000 cards or 30 seconds**, whichever
  comes first; the chip then offers **Resume** to continue, and folders it did
  not reach carry a **not loaded** badge (`—` where their item count would be:
  unknown is not the same as empty).
- Click a **not loaded** badge to load just that folder on demand.
- Stopping the scan (✕, opening another folder, clearing the canvas) leaves
  the graph as-is — no badges, no leftover chip — and everything already
  loaded keeps working.
- Scanning skips `node_modules`, hidden and cache folders, and archive
  listing time never counts against the pause budget.

## Themes

The theme editor saves named themes to your library as `.fwtheme` files. No sign-in, no cloud gallery: themes are yours on disk. Theme files are plain JSON, so share the file itself with another Fewer install.

## Licensing

The desktop app is **free as it stands**: canvas, layout, search, undo/redo,
import, the local graph library (projects save to your own folder, no
account needed), and watermarked exports all work out of the box.

Licence activation ships in a later release, together with the Pro extras it
will unlock (unbranded exports, in-app file preview). **This build deliberately
has no licence screen and no upgrade flow**: there is nothing to activate and
nothing to buy yet, and the documentation will say so the day that changes.

## Application menu (T-197)

The desktop shell has a native **File / Edit / View / Window / Help** menu:

- **File → Open Folder…** (`Ctrl/Cmd+O`), **Save Project** (`Ctrl/Cmd+S`), **Export…** (`Ctrl/Cmd+E`), **Settings…** (`Ctrl/Cmd+,` on Linux/Windows; on macOS Settings lives in the app menu).
- **Edit → Undo / Redo / Select All Cards / Delete Selection** — graph-level, separate from the text-editing shortcuts.
- **View → Toggle Sidebar** (`Ctrl/Cmd+B`), zoom, full screen, and (in development builds) Developer Tools.
- **Help → Keyboard Shortcuts**, **Report an Issue**.

The in-app header carries only what you need mid-work. Settings and Export are reached from the menu, not from header buttons.

### Search on this device

The search box in the header searches the loaded graph first, then a **local
index of every folder you have opened** — names and paths only, never file
contents. Device hits appear under *On this device*; clicking one selects the
card, or opens the folder first when the hit lives elsewhere.

- The index lives in the app's own data folder, not your library.
- Only opened folders are indexed; `node_modules`, hidden directories and
  build caches are skipped.
- **Settings → Help → Storage** shows how many entries and megabytes the index
  uses and can clear it.

## Updating

Download a new build from the releases page and install it over the old one; your library folder is untouched. The builds are unsigned, so on macOS right-click → Open the first time, and on Windows SmartScreen may warn on first run (More info → Run anyway).

## Reporting a bug

**Settings → Help → Report an Issue** collects diagnostics (app version, layout, graph stats) and builds a pre-filled GitHub issue that opens in your **default browser**: review it there and press *Submit new issue*. **Download** / **Copy** give you the raw JSON if you'd rather attach it somewhere else. The desktop app files issues through GitHub only; there is no email submission.

**Settings → Help → Export Settings** saves a JSON snapshot of every Fewer setting on this device (theme, panel layout, search history, license state), useful as a backup, or as the file to attach to a bug report.

## Troubleshooting

- **Library won't save**: check that the library folder (default `~/Documents/fewer`) exists and is writable.
- **A graph won't open**: the `.fwr` file may be corrupted; the app skips unreadable files rather than crashing, and the rest of the library still loads.
- **GitHub import says "not found"**: unauthenticated GitHub API access is rate-limited to ~60 requests/hour; wait an hour or use a folder download instead.
