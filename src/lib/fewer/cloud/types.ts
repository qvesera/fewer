/** Cloud provider identifiers supported by the connections system. */
export type CloudProvider =
  | "github"
  | "google-drive"
  | "onedrive"
  | "sharepoint"
  | "azure-devops"
  | "azure-blob";

/** A linked cloud account (as returned to the client — never includes tokens). */
export interface CloudConnection {
  id: string;
  provider: CloudProvider;
  account_id: string;
  account_name: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A single folder/file entry returned by a provider's list/tree endpoint. */
export interface CloudEntry {
  name: string;
  type: "folder" | "file";
  size?: number;
  /** Provider web URL — opened in a new tab by "Open in provider". */
  webUrl?: string;
  /** Provider-specific child pointer (e.g. Drive folder id, OneDrive item id). */
  ref?: string;
}

/** Result of listing a folder's immediate children. */
export interface CloudListResult {
  entries: CloudEntry[];
  /** Provider-specific root pointer for the connection's root. */
  rootRef?: string;
  /** Display name for the root (e.g. "My Drive", "Documents"). */
  rootName?: string;
}

/** A provider adapter must implement these. */
export interface CloudProviderAdapter {
  id: CloudProvider;
  label: string;
  /** Scopes/authorization URL builder. Returns the URL to redirect the user to. */
  buildAuthUrl(state: string): Promise<string>;
  /** Exchange the OAuth code for tokens, returning token + account info. */
  exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    accountId: string;
    accountName: string;
    config?: Record<string, unknown>;
  }>;
  /** Refresh an access token. Returns null if the provider has no refresh flow. */
  refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn?: number } | null>;
  /** List immediate children of a folder (rootRef = root filesystem). */
  listChildren(accessToken: string, ref?: string): Promise<CloudListResult>;
  /** Build a TreeEntry subtree. Default: recursively list until depth limit. */
  buildTree?(accessToken: string, ref: string, depth: number): Promise<import("@/lib/fewer/types").TreeEntry>;
}