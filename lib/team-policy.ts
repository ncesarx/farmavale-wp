export type ManageableRole = "OWNER" | "ADMIN" | "SUPERVISOR" | "AGENT" | "ANALYST";

export function canManageTeam(role: ManageableRole) {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageTarget(
  actorRole: ManageableRole,
  _actorId: string,
  target: { id: string; role: ManageableRole },
) {
  if (!canManageTeam(actorRole)) return false;
  if (actorRole === "ADMIN" && target.role === "OWNER") return false;
  return true;
}

export function canAssignRole(
  actorRole: ManageableRole,
  role: ManageableRole,
) {
  if (actorRole === "OWNER") return true;
  return actorRole === "ADMIN" && role !== "OWNER";
}
