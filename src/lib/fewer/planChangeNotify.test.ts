import { describe, expect, test } from "bun:test";
import {
  planChangeEmailHtml,
  planChangeEmailText,
  planChangeRecordId,
  planChangeSubject,
  planLabel,
  type PlanChangeRow,
} from "./planChangeNotify";

const upgrade: PlanChangeRow = { id: 1, email: "user@example.com", from_plan: "free", to_plan: "pro" };
const downgrade: PlanChangeRow = { id: 2, email: "user@example.com", from_plan: "pro", to_plan: "free" };
const createdPro: PlanChangeRow = { id: 3, email: "user@example.com", from_plan: null, to_plan: "pro" };

describe("planLabel", () => {
  test("maps the stored enum values", () => {
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("pro")).toBe("Pro");
    expect(planLabel("team")).toBe("Team");
  });

  test("passes an unknown value through and stringifies null", () => {
    expect(planLabel("enterprise")).toBe("enterprise");
    expect(planLabel(null)).toBe("");
    expect(planLabel(undefined)).toBe("");
  });
});

describe("planChangeSubject", () => {
  test("names the destination plan", () => {
    expect(planChangeSubject(upgrade)).toBe("Your fewer plan is now Pro");
    expect(planChangeSubject(downgrade)).toBe("Your fewer plan is now Free");
  });
});

describe("planChangeEmailHtml", () => {
  test("states the transition for an upgrade", () => {
    expect(planChangeEmailHtml(upgrade)).toContain("Your fewer plan changed from Free to Pro.");
  });

  test("states the transition for a downgrade", () => {
    expect(planChangeEmailHtml(downgrade)).toContain("Your fewer plan changed from Pro to Free.");
  });

  test("states the new plan when there is no previous one (checkout upsert)", () => {
    expect(planChangeEmailHtml(createdPro)).toContain("Your fewer plan is now Pro.");
    expect(planChangeEmailHtml(createdPro)).not.toContain("changed from");
  });

  test("ships inside the shared shell with the brand footer", () => {
    const html = planChangeEmailHtml(upgrade);
    expect(html).toContain("fewer.directory");
    expect(html).toContain("Interactive File &amp; System Graph Visualizer");
    expect(html).toContain("Your plan changed");
  });

  test("escapes a hostile plan value", () => {
    const html = planChangeEmailHtml({ ...upgrade, to_plan: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("points at Settings → Account instead of the hidden plans doc", () => {
    const html = planChangeEmailHtml(upgrade);
    expect(html).toContain("Settings → Account");
    expect(html).not.toContain("/docs/plans");
  });
});

describe("planChangeEmailText", () => {
  test("mirrors the html copy in plain text", () => {
    const text = planChangeEmailText(downgrade);
    expect(text).toContain("Your fewer plan changed from Pro to Free.");
    expect(text).toContain("Settings -> Account");
    expect(text).not.toContain("<");
  });
});

describe("planChangeRecordId", () => {
  test("reads the id from a Supabase Database Webhook body", () => {
    expect(planChangeRecordId({ type: "INSERT", table: "plan_change_events", record: { id: 42 } })).toBe(42);
  });

  test("accepts a numeric string id", () => {
    expect(planChangeRecordId({ record: { id: "42" } })).toBe(42);
  });

  test("rejects anything without a usable id", () => {
    expect(planChangeRecordId(null)).toBeNull();
    expect(planChangeRecordId({})).toBeNull();
    expect(planChangeRecordId({ record: {} })).toBeNull();
    expect(planChangeRecordId({ record: { id: "abc" } })).toBeNull();
    expect(planChangeRecordId({ record: { id: 1.5 } })).toBeNull();
    expect(planChangeRecordId("not a body")).toBeNull();
  });
});
