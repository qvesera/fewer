/**
 * Tag assignment methods: assignTag, unassignTag, toggleNodeTag,
 * assignTagToNodes, unassignTagFromNodes.
 */
import type { GraphState } from "../types";
import { writeTagIds, addTagId, removeTagId } from "./shared";

export function buildAssignmentMethods(
  set: (partial: Pick<GraphState, "nodes" | "graphVersion">) => void,
  get: () => GraphState,
) {
  return {
    assignTag: (nodeId: string, tagId: string) =>
      writeTagIds(set, get, (n) => n.id === nodeId, addTagId(tagId)),

    unassignTag: (nodeId: string, tagId: string) =>
      writeTagIds(set, get, (n) => n.id === nodeId, removeTagId(tagId)),

    toggleNodeTag: (nodeId: string, tagId: string) => {
      const node = get().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.data.tagIds?.includes(tagId)) get().unassignTag(nodeId, tagId);
      else get().assignTag(nodeId, tagId);
    },

    /** Assign one tag to many nodes in a single history entry. Idempotent. */
    assignTagToNodes: (nodeIds: string[], tagId: string) => {
      const idSet = new Set(nodeIds);
      writeTagIds(set, get, (n) => idSet.has(n.id), addTagId(tagId));
    },

    /** Remove one tag from many nodes in a single history entry. */
    unassignTagFromNodes: (nodeIds: string[], tagId: string) => {
      const idSet = new Set(nodeIds);
      writeTagIds(set, get, (n) => idSet.has(n.id), removeTagId(tagId));
    },
  };
}
