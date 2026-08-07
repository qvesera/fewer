---
title: Cloud Storage
description: Link cloud accounts (GitHub, Google Drive, OneDrive, SharePoint, Azure) to browse and visualize folders from cloud storage and private repositories.
---

Fewer can browse and visualize directory structures from linked cloud accounts — private GitHub repos, Google Drive, OneDrive, SharePoint, and Azure. Sign in, link an account, then browse and import a folder into the graph.

## Link a cloud account

1. Sign in (use the **Sign in** button in the navbar).
2. In the sidebar, open the **Cloud** section.
3. Click **Link** next to a provider.
4. Authorize the app on the provider's consent screen.
5. You're returned to Fewer with the account linked.

Each provider uses its own OAuth app. Before you can link, the provider's credentials must be configured — see [Cloud setup](/docs/deployment) for how to create the OAuth apps and set the environment variables.

## Browse cloud storage

1. Open the **Cloud** section in the sidebar and click **Browse** (or open the Cloud browser from the File & Actions menu).
2. Pick a linked account.
3. Navigate folders. Click a folder to open it; use the breadcrumb trail to go back up.
4. Click the external-link icon on any entry to open it in the provider's web UI in a new tab.

## Import into the graph

1. Browse to the folder you want.
2. Set the import **Depth** (how many levels deep to fetch).
3. Click **Import Folder**.

The folder's structure is rendered as a graph using the provider's metadata. Fewer only reads names, folder structure, and sizes — it never downloads file contents.

## Open in provider

Any node imported from a cloud account can be opened in the provider's web UI:

- Right-click a folder or file node.
- Choose **Open in {Provider}** (e.g. "Open in GitHub").

This opens the folder or file at its exact location in the provider's site in a new browser tab.

## Unlink an account

1. Open the **Cloud** section in the sidebar.
2. Click the trash icon next to the account.

This removes the connection and its stored tokens. It does not affect your provider account.

## Supported providers

- **GitHub** — browse private (and public) repositories.
- **Google Drive** — browse My Drive folders.
- **OneDrive** — browse your personal OneDrive.
- **SharePoint** — browse SharePoint sites' document libraries.
- **Azure DevOps** — browse git repositories.
- **Azure Blob** — browse storage container blobs.

## Privacy

Cloud connections are read-only. Fewer stores the provider access token encrypted on the server, scoped to filesystem/metadata read permission, and uses it only to fetch folder listings you request. Tokens are never sent to your browser or exposed in the app.

## Next Steps

- [Accounts](/docs/accounts): your Fewer account and saved graphs
- [Import & Export](/docs/import-export): other ways to bring data in