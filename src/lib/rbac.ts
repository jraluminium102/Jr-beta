import type { Role } from "@/lib/database.types";

export type Resource =
  | "jobs" | "jobs:finance_fields" | "production" | "installation"
  | "issues" | "finance" | "dashboard" | "settings" | "users" | "queue"
  | "designer" | "boq";
export type Action = "read" | "write" | "void";

// ตรงกับ PRD REQ-06 + RLS policies ใน 0003_rls.sql
const MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  ADMIN: {
    jobs: ["read", "write"], "jobs:finance_fields": ["read", "write"],
    production: ["read", "write"], installation: ["read", "write"],
    issues: ["read", "write"], finance: ["read", "write", "void"],
    dashboard: ["read"], settings: ["read", "write"], users: ["read", "write"],
    queue: ["read", "write"],
    designer: ["read", "write"], boq: ["read", "write"],
  },
  SALES: {
    jobs: ["read", "write"], "jobs:finance_fields": ["read"],
    production: ["read"], issues: ["read", "write"], finance: ["read"], dashboard: ["read"],
    queue: ["read"],
    boq: ["read"],
  },
  DESIGNER: {
    jobs: ["read", "write"], production: ["read"], issues: ["read"], dashboard: ["read"],
    designer: ["read", "write"],
  },
  PRODUCTION: {
    jobs: ["read"], production: ["read", "write"], issues: ["read", "write"], dashboard: ["read"],
    designer: ["read"], boq: ["read", "write"],
  },
  INSTALLER: {
    jobs: ["read"], production: ["read"], installation: ["read", "write"],
    issues: ["read", "write"], dashboard: ["read"],
  },
  ACCOUNTING: {
    jobs: ["read"], "jobs:finance_fields": ["read"],
    finance: ["read", "write", "void"], dashboard: ["read"],
    boq: ["read", "write"],
  },
  VIEWER: { jobs: ["read"], dashboard: ["read"] },
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

export function menusFor(role: Role): string[] {
  const all = ["dashboard", "followup", "jobs", "production", "designer", "installation", "issues", "boq", "finance", "settings"];
  const map: Record<string, Resource> = {
    dashboard: "dashboard", followup: "jobs", jobs: "jobs", production: "production",
    designer: "designer", installation: "installation", issues: "issues", boq: "boq",
    finance: "finance", settings: "settings",
  };
  return all.filter((m) => can(role, map[m], "read"));
}

export const FINANCE_FIELD_ROLES: Role[] = ["ADMIN", "SALES", "ACCOUNTING"];
