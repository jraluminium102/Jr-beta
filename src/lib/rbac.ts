import type { Role } from "@/lib/database.types";

export type Resource =
  | "jobs" | "jobs:finance_fields" | "production" | "installation"
  | "issues" | "finance" | "dashboard" | "settings" | "users" | "queue"
  | "designer" | "boq" | "sales_closure" | "warranties";
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
    sales_closure: ["read", "write"],
    warranties: ["read", "write"],
  },
  SALES: {
    jobs: ["read", "write"], "jobs:finance_fields": ["read"],
    production: ["read"], issues: ["read", "write"], finance: ["read"], dashboard: ["read"],
    queue: ["read", "write"],   // [0035] เซลล์จัดการคิวตัวเองได้ (RLS จำกัดเฉพาะ sales_id ของตัวเอง)
    boq: ["read"],
    sales_closure: ["read", "write"],
    warranties: ["read", "write"],
  },
  DESIGNER: {
    jobs: ["read", "write"], production: ["read"],
    issues: ["read", "write"],  // [0035] ช่างแบบแจ้งปัญหาแบบได้
    dashboard: ["read"],
    designer: ["read", "write"],
    warranties: ["read"],
  },
  PRODUCTION: {
    jobs: ["read"], production: ["read", "write"], issues: ["read", "write"], dashboard: ["read"],
    designer: ["read"], boq: ["read", "write"],
    warranties: ["read", "write"],  // [0035] ช่างผลิตออกใบรับประกันได้
  },
  INSTALLER: {
    jobs: ["read"], production: ["read"], installation: ["read", "write"],
    issues: ["read", "write"], dashboard: ["read"],
    warranties: ["read", "write"],  // [0035] ช่างติดตั้งออกใบรับประกันหลังจบงานได้
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
  const all = ["dashboard", "followup", "production", "prodqueue", "designer", "installation", "issues", "sales_closure", "boq", "finance", "settings"];
  const map: Record<string, Resource> = {
    dashboard: "dashboard", followup: "jobs", production: "production",
    prodqueue: "production",
    designer: "designer", installation: "installation", issues: "issues",
    sales_closure: "sales_closure", boq: "boq",
    finance: "finance", settings: "settings",
  };
  return all.filter((m) => can(role, map[m], "read"));
}

export const FINANCE_FIELD_ROLES: Role[] = ["ADMIN", "SALES", "ACCOUNTING"];
