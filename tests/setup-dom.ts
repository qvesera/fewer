import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, afterEach } from "bun:test";

// Register the DOM before touching any @testing-library module: screen binds
// its queries to document.body at import time.
GlobalRegistrator.register({ url: "http://localhost:3000" });
const { cleanup } = await import("@testing-library/react");
const { toBeInTheDocument, toBeDisabled, toHaveValue } = await import("@testing-library/jest-dom/matchers");
expect.extend({ toBeInTheDocument, toBeDisabled, toHaveValue });
afterEach(cleanup);

