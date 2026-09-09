export const CUSTOMER_READ_ROLES = [
  "OWNER",
  "ADMIN",
  "SUPERVISOR",
  "AGENT",
  "ANALYST",
] as const;

export const CUSTOMER_WRITE_ROLES = [
  "OWNER",
  "ADMIN",
  "SUPERVISOR",
  "AGENT",
] as const;

export function canViewCustomers(role: string) {
  return CUSTOMER_READ_ROLES.includes(role as (typeof CUSTOMER_READ_ROLES)[number]);
}

export function canEditCustomers(role: string) {
  return CUSTOMER_WRITE_ROLES.includes(role as (typeof CUSTOMER_WRITE_ROLES)[number]);
}
