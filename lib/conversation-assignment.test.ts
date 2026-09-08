import assert from "node:assert/strict";
import test from "node:test";
import {
  AssignmentCandidate,
  selectAssignmentCandidate,
} from "@/lib/conversation-assignment";

test("selects the available candidate with the smallest workload", () => {
  const candidates: AssignmentCandidate[] = [
    { id: "agent-b", openConversations: 3, maxOpenConversations: 5 },
    { id: "agent-a", openConversations: 1, maxOpenConversations: 5 },
  ];

  assert.equal(selectAssignmentCandidate(candidates)?.id, "agent-a");
});

test("excludes agents that reached capacity", () => {
  const candidates: AssignmentCandidate[] = [
    { id: "at-capacity", openConversations: 2, maxOpenConversations: 2 },
    { id: "available", openConversations: 2, maxOpenConversations: 3 },
  ];

  assert.equal(selectAssignmentCandidate(candidates)?.id, "available");
});

test("uses a stable id tie-breaker", () => {
  const candidates: AssignmentCandidate[] = [
    { id: "agent-z", openConversations: 0, maxOpenConversations: 5 },
    { id: "agent-a", openConversations: 0, maxOpenConversations: 5 },
  ];

  assert.equal(selectAssignmentCandidate(candidates)?.id, "agent-a");
});

test("returns null when no candidate has capacity", () => {
  const candidates: AssignmentCandidate[] = [
    { id: "disabled", openConversations: 0, maxOpenConversations: 0 },
    { id: "full", openConversations: 5, maxOpenConversations: 5 },
  ];

  assert.equal(selectAssignmentCandidate(candidates), null);
});
