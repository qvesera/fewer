---
title: Install as an App (PWA)
description: Fewer is a progressive web app — install it to your home screen for an app-like experience with offline support, splash screen, and standalone window.
---

Fewer is a progressive web app. Once you open [fewer.directory](https://fewer.directory) in a supported browser, you can install it like a native app.

## Why Install

- **App-like window** — runs in its own standalone window, no browser chrome
- **Splash screen** — branded launch screen with the Fewer logo
- **Offline support** — the app shell and static assets are cached
- **Quick access** — one tap on your home screen, dock, or taskbar

## Install on Desktop (Chrome, Edge, Brave)

1. Open [fewer.directory](https://fewer.directory)
2. Click the **install icon** in the address bar (or **⋮ → Install Fewer**)
3. Confirm the install dialog

## Install on Android (Chrome, Brave)

1. Open [fewer.directory](https://fewer.directory)
2. Tap **⋮ → Add to Home screen** (or **Install app** in the prompt)
3. Confirm

## Install on iOS (Safari)

1. Open [fewer.directory](https://fewer.directory) in Safari
2. Tap **Share** → **Add to Home Screen**
3. Tap **Add**

## Requirements

- **HTTPS** — PWA install requires a secure context. The hosted site qualifies; local dev on `http://localhost` also counts as secure.
- **Supported browser** — Chrome/Edge/Brave (desktop + Android), Safari (iOS 11.3+). Firefox supports the manifest but has limited install UI.
- **Updated install capability** — fewers manifest (`public/manifest.json`) ships 192x192 and 512x512 icons, theme colors, and a unique id so browsers show the install prompt.

## Verify Installation

After install, the app opens in its own window. You can find it by searching "fewer" in your app launcher. The address bar is hidden, and the app uses the branded theme colors for its title bar and splash.

## Local Development

If you self-host, serve the `public/` directory (which includes `manifest.json`, `robots.txt`, and icons) so the manifest resolves correctly. The standalone build in `.next/standalone` copies `public/` automatically.

## Next Steps

- [Theming](/docs/theming) — make the installed app match your style
- [Keyboard Shortcuts](/docs/shortcuts) — navigate faster once installed