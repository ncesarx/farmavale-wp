const LEADERSHIP_ROLES = new Set(["OWNER", "ADMIN", "SUPERVISOR"]);
const OPERATIONAL_ROLES = new Set(["OWNER", "ADMIN", "SUPERVISOR", "AGENT"]);

export function canCollaborateOnConversation(
  role: string,
  userId: string,
  assignedAgentId: string | null,
) {
  if (LEADERSHIP_ROLES.has(role)) return true;
  return role === "AGENT" && assignedAgentId === userId;
}

export function isEligibleTransferTarget(input: {
  role: string;
  status: string;
  maxOpenConversations: number;
  openConversations: number;
}) {
  return (
    OPERATIONAL_ROLES.has(input.role) &&
    input.status === "ACTIVE" &&
    input.maxOpenConversations > input.openConversations
  );
}
