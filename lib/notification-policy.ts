export type NotificationKind = "NEW_MESSAGE" | "ASSIGNMENT" | "SLA_WARNING" | "SYSTEM";

export function isNotificationEnabled(
  kind: NotificationKind,
  preference: { newMessages: boolean; assignments: boolean; slaWarnings: boolean },
) {
  if (kind === "NEW_MESSAGE") return preference.newMessages;
  if (kind === "ASSIGNMENT") return preference.assignments;
  if (kind === "SLA_WARNING") return preference.slaWarnings;
  return true;
}
