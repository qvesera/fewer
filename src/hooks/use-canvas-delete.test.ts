import { describe, expect, test } from "bun:test";
import { deleteToastPayloads } from "./use-canvas-delete";

const node = (id: string) => ({ id, type: "folder", position: { x: 0, y: 0 }, data: {} } as any);
const edge = (id: string) => ({ id, source: "a", target: "b" } as any);

describe("deleteToastPayloads", () => {
  test("nodes only → one message", () => {
    const msgs = deleteToastPayloads([node("n1"), node("n2")], []);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].description).toBe("2 items removed");
  });
  test("single node → singular", () => {
    const msgs = deleteToastPayloads([node("n1")], []);
    expect(msgs[0].description).toBe("1 item removed");
  });
  test("edges only → one message", () => {
    const msgs = deleteToastPayloads([], [edge("e1")]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].description).toBe("1 edge removed");
  });
  test("multiple edges → plural", () => {
    const msgs = deleteToastPayloads([], [edge("e1"), edge("e2"), edge("e3")]);
    expect(msgs[0].description).toBe("3 edges removed");
  });
  test("both → two messages", () => {
    const msgs = deleteToastPayloads([node("n1")], [edge("e1"), edge("e2")]);
    expect(msgs).toHaveLength(2);
  });
  test("empty → no messages", () => {
    expect(deleteToastPayloads([], [])).toHaveLength(0);
  });
});
