---
title: Settings, Power User Mode & Notifications
description: Configure Fewer via the Settings dialog: theme, minimap, node dimensions, power user mode, notifications, and the About/Help tabs.
---

The gear icon in the top navbar opens **Settings**, a dialog with four tabs: **About**, **Appearance**, **Advanced**, and **Help**.

## About

- App icon, version badge, and tagline
- **Privacy blurb**: all processing happens locally in your browser; no data is uploaded
- **GitHub link**: opens the repository
- **Website link**: opens the project site
- **Sponsor button**: opens GitHub Sponsors
- Tech + license footer (Next.js, React Flow, shadcn/ui · AGPLv3)

## Appearance

- **Theme mode selector**: Light / Dark / Custom (Custom is only shown in Power User mode and opens the theme editor)
- **Show Files toggle**: show or hide file-level nodes on the canvas (folders only)

## Advanced

Advanced settings are gated behind **Power User mode**: a toggle in this tab (also reflected in the sidebar). Advanced users get:

- **Custom theme mode** visible in Appearance
- File/URL import buttons in the sidebar
- Extra layout directions (Bottom→Top, Right→Left)
- Sidebar sections: Minmax/Metrics sliders

Settings in Advanced:

| Setting | Description |
| ------- | ----------- |
| **Show Files** | Show/hide file nodes (also in Appearance) |
| **Minimap** | Toggle the minimap on/off |
| **Minimap Position** | Top-left, Top-right, Bottom-left, Bottom-right |
| **Minimap Size** | Slider, 80–300px |
| **Node Width** | Card width slider, 120–400px |
| **Node Height** | Card height slider, 40–300px |

## Help

- **Keyboard Shortcuts**: open the shortcuts dialog
- **Bug Report**: open the bug report dialog with auto-collected diagnostics
- **Restart Tutorial**: replay the interactive walkthrough
- **GitHub Issues** link
- **Website** link

## Accounts & Saved Graphs

Fewer works fully without an account. Signing in (optional) unlocks saving and sharing your directories across devices. See [Accounts & Saved Graphs](/docs/accounts) for the full guide.

### Sign in

Click the **Sign in** button in the top navbar to open the auth dialog. You can:

- **Create an account** with email + password
- **Sign in** to an existing account
- **Reset your password** via email

### Save a graph

1. Sign in
2. Click **Save Current Graph** in the **Your Directories** sidebar section
3. Name the graph and click **Save**

Saved graphs capture the full app state: nodes, edges, layout, theme mode, custom theme, minimap, and advanced settings. Restoring a saved graph restores everything.

### Manage saved graphs

The **Your Directories** section lists your saved graphs. Each row lets you:

- **Load** the graph (click the name)
- **Rename** (pencil icon)
- **Share** (link icon): anyone-with-the-link or invite-only
- **Delete** (trash icon)

Saving is always user-initiated. Fewer never auto-uploads your graph.

## Notifications

The bell icon in the navbar opens the **notification history** panel. Every major action posts a toast:

- Delete, copy, cut, duplicate, paste, unparent, connect, relayout
- Show/hide nodes, open file, refresh from disk
- Auto-hide notifications on import

A badge on the bell shows unread notifications; it clears when you open the panel. Up to 5 toasts stack at the right edge of the screen.

## Resetting

Disabling **Power User mode** resets all settings to defaults, including the theme mode.

## Next Steps

- [Theming](/docs/theming): custom colors, presets, and the theme editor
- [Graph Features](/docs/graph-features): minimap, layout, and canvas behavior
- [Editing Nodes](/docs/editing): add, rename, delete, and connect nodes