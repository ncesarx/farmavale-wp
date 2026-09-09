export type AssignmentCandidate = {
  id: string;
  maxOpenConversations: number;
  openConversations: number;
};

export function selectAssignmentCandidate(candidates: AssignmentCandidate[]) {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.maxOpenConversations > 0 &&
          candidate.openConversations < candidate.maxOpenConversations,
      )
      .toSorted(
        (left, right) =>
          left.openConversations - right.openConversations ||
          left.id.localeCompare(right.id),
      )[0] ?? null
  );
}
