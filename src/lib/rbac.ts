import type { Role } from "@/lib/database.types";

export type Resource =
  | "jobs" | "jobs:finance_fields" | "production" | "installation"
  | "issues" | "finance" | "dashboard" | "settings" | "users";
export type Action = "read" | "write" | "void";

// ตรงกับ PRD REQ-06 + RLS policies ใน 0003_rls.sql
const MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  ADMIN: {
    jobs: ["read", "write"], "jobs:finance_fields": ["read", "write"],
    production: ["read", "write"], installation: ["read", "write"],
    issues: ["read", "write"], finance: ["read", "write", "void"],
    dashboard: ["read"], settings: ["read", "write"], users: ["read", "write"],
  },
  SALES: {
    jobs: ["read", "write"], "jobs:finance_fields": ["read", "write"],
    production: ["read"], issues: ["read", "write"], finance: ["read"], dashboard: ["read"],
  },
  DESIGNER: {
    jobs: ["read", "write"], production: ["read"], issues: ["read"], dashboard: ["read"],
  },
  PRODUCTION: {
    jobs: ["read"], production: ["read", "write"], issues: ["read", "write"], dashboard: ["read"],
  },
  INSTALLER: {
    jobs: ["read"], production: ["read"], installation: ["read", "write"],
    issues: ["read", "write"], dashboard: ["read"],
  },
  ACCOUNTING: {
    jobs: ["read"], "jobs:finance_fields": ["read"],
    finance: ["read", "write", "void"], dashboard: ["read"],
  },
  VIEWER: { jobs: ["read"], dashboard: ["read"] },
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

export function menusFor(role: Role): string[] {
  const all = ["dashboard", "jobs", "production", "installation", "issues", "finance", "users", "settings"];
  const map: Record<string, Resource> = {
    dashboard: "dashboard", jobs: "jobs", production: "production",
    installation: "installation", issues: "issues", finance: "finance",
    users: "users", settings: "settings",
  };
  return all.filter((m) => can(role, map[m], "read"));
}

export const FINANCE_FIELD_ROLES: Role[] = ["ADMIN", "SALES", "ACCOUNTING"];
