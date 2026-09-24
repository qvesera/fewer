import { describe, expect, test, mock } from "bun:test";
mock.module("server-only", () => ({}));

const { getAdapter, isProviderImplemented } = await import("./registry");

describe("getAdapter", () => {
  test("github → returns adapter with id=github", async () => {
    const a = await getAdapter("github");
    expect(a.id).toBe("github");
  });
  test("google-drive → returns adapter with id=google-drive", async () => {
    const a = await getAdapter("google-drive");
    expect(a.id).toBe("google-drive");
  });
  test("onedrive → returns adapter with id=onedrive", async () => {
    const a = await getAdapter("onedrive");
    expect(a.id).toBe("onedrive");
  });
  test("sharepoint → returns adapter with id=sharepoint", async () => {
    const a = await getAdapter("sharepoint");
    expect(a.id).toBe("sharepoint");
  });
  test("azure-devops → returns adapter with id=azure-devops", async () => {
    const a = await getAdapter("azure-devops");
    expect(a.id).toBe("azure-devops");
  });
  test("azure-blob → returns adapter with id=azure-blob", async () => {
    const a = await getAdapter("azure-blob");
    expect(a.id).toBe("azure-blob");
  });
  test("unknown provider → notConfigured stub (buildAuthUrl throws)", async () => {
    const a = await getAdapter("bitbucket" as any);
    expect(() => a.buildAuthUrl("test-state")).toThrow("bitbucket is not implemented yet");
  });
  test("unknown provider → notConfigured refreshToken returns null", async () => {
    const a = await getAdapter("bitbucket" as any);
    expect(await a.refreshToken("any")).toBeNull();
  });
});

describe("isProviderImplemented", () => {
  test("github → true", () => expect(isProviderImplemented("github")).toBe(true));
  test("bitbucket → false", () => expect(isProviderImplemented("bitbucket" as any)).toBe(false));
});
