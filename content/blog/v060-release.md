---
title: v0.6.0: A Gallery, Version History, and One Import Dialog
date: 2026-09-12
description: Fewer 0.6.0 adds a public community gallery, automatic version history you can restore, username-or-email sign-in with real profiles, and a single 3-step import dialog that handles folder, file, URL, and cloud sources alike.
author: Yash Srivastava
tags: release, gallery, sharing, import, accounts
---

**v0.6.0** is the release where Fewer stopped being only a viewer of directories you already had, and became a place where directory graphs can be **published, versioned, and built from almost any source**.

## A Community Gallery

Saved graphs already had share links. Now a **public** share can be listed in the community gallery at [fewer.directory/gallery](https://fewer.directory/gallery) — browsable by anyone, signed in or not.

- Choose **Anyone with the link**, tick **List in the community gallery**, and give it a title and description.
- The listing carries **metadata only** — title, description, card count, date. The graph itself is still fetched only when someone opens the share link.
- Entries are attributed to your profile, so publishing asks for a first name and a username first.
- Unlist it any time by regenerating the share without the gallery flag.

It is a small thing, and it changes what the tool is for: a directory graph someone else can find, not only one you keep.

## Version History

Saving used to be a one-way door — overwrite a graph and the previous state was gone. Every saved graph now keeps **automatic snapshots**:

- Open **Version history** from the clock icon in **Your Directories** to see when each snapshot was taken and how many cards it held.
- **Restore** any snapshot back onto the canvas, or **delete** individual ones.
- Re-saving without changes records nothing, so history stays signal instead of noise.
- Retention follows your plan: **30 days** on Free, **365 days** on Pro, capped at **50 snapshots per graph**.

## One Import Dialog, Every Source

Importing used to mean three different dialogs depending on where the tree came from. There is now a single **3-step flow** — **Origin**, then **Options**, then **Import** — for folders on disk, exported files, GitHub repos, public file indexes, Internet Archive items, and linked cloud accounts.

Step 2 is literally the same options panel everywhere: depth, hidden files, extension filters, and the rest. Pick a different origin and your configuration stays put, which is what you want when you are comparing the same tree from two places. **Enter** advances the steps.

## Multi-Select That Does Real Work

Selecting several cards now opens a **Batch actions** section on the canvas and in card context menus:

- **Rename…** with find/replace, prefix/suffix, and numbering, with a live preview
- **Move to Folder…**, Set as Parent, Unparent, Duplicate, Delete N items
- Hide/show children in bulk, plus copy-paths and selection helpers

Each batch action is a single undoable step, so a mass rename is one **Ctrl+Z** away from being undone.

## Accounts, Sharpened

Accounts grew up alongside sharing:

- **Profiles** with first and last name plus a **unique username**
- **Sign in with your username instead of your email**, or keep using the email
- Usernames are normalized and enforced unique at the database level, not just in the UI

## Also in This Release

- **Hidden cards panel grouping**: hidden files are grouped under their visible folder with a count, and hovering a folder or row on the panel highlights the matching cards (and ancestor-path edges) on the canvas.
- **Crown shyness slider**: sibling subtrees now leave space proportional to their depth and size, with intensity adjustable from 0–3× in Settings → Advanced.
- **Headless docs and blog**: posts and guides live in the database now and publish without a deploy, which is how this post reached you.

Fewer is still fully client-side for everything local, still works logged out, and still never uploads a graph you did not ask it to save.

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```
