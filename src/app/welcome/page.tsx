import { redirect } from "next/navigation";

/**
 * `/welcome` was a byte-for-byte duplicate of `/` (same component, same title
 * and description, both indexed — the nav even pointed its Features link at
 * this copy). One page, one URL: it now redirects to the canonical home, and
 * the sitemap no longer lists it (T-149).
 */
export default function WelcomePage() {
  redirect("/");
}
