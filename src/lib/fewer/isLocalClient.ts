/**
 * Check whether the browser is accessing this app from the same machine that
 * runs the Next.js server (localhost / loopback). When running remotely (e.g.
 * accessing from a MacBook via 192.168.1.4), local-filesystem operations like
 * "Open in File Explorer" and "Open file in OS app" cannot work because the
 * server-side API routes spawn processes on the server's machine, not the
 * client's. This helper lets the UI hide or degrade those actions gracefully.
 */
export function isLocalClient(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname === ""
  );
}