import type { Role } from "@/lib/database.types";

export type Resource =
  // OMS (ฝั่งปฏิบัติงาน)
  | "jobs" | "jobs:finance_fields" | "production" | "installation"
  | "issues" | "finance" | "dashboard" | "settings" | "users"
  // DOC/บัญชี (ฝั่งเอกสาร)
  | "quotations" | "customers" | "stock" | "billing" | "receipts"
  | "production_orders" | "warranties" | "calculator" | "queue"
  // เฟส 2 — ภาพสินค้า
  | "product_gallery";

export type Action = "read" | "write" | "void";

// ตรงกับ Permission matrix เป้าหมาย (roadmap-rbac-features.md)
// และสอดคล้อง RLS policies ใน 0003_rls.sql + 0007_acct_rls.sql + 0008_acct_documents.sql
const MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  ADMIN: {
    // OMS
    jobs: ["read", "write"], "jobs:finance_fields": ["read", "write"],
    production: ["read", "write"], installation: ["read", "write"],
    issues: ["read", "write"], finance: ["read", "write", "void"],
    dashboard: ["read"], settings: ["read", "write"], users: ["read", "write"],
    // DOC
    quotations: ["read", "write"], customers: ["read", "write"],
    billing: ["read", "write"], receipts: ["read", "write"],
    production_orders: ["read", "write"], warranties: ["read", "write"],
    stock: ["read", "write"], calculator: ["read", "write"], queue: ["read", "write"],
    // เฟส 2
    product_gallery: ["read", "write"],
  },
  SALES: {
    // OMS
    jobs: ["read", "write"], "jobs:finance_fields": ["read", "write"],
    production: ["read"], issues: ["read", "write"], finance: ["read"], dashboard: ["read"],
    // DOC
    quotations: ["read", "write"], customers: ["read", "write"],
    billing: ["read", "write"], receipts: ["read", "write"],
    production_orders: ["read", "write"], warranties: ["read", "write"],
    stock: ["read"], calculator: ["read", "write"], queue: ["read", "write"],
    // เฟส 2
    product_gallery: ["read", "write"],
  },
  DESIGNER: {
    // OMS
    jobs: ["read", "write"], production: ["read"], issues: ["read"], dashboard: ["read"],
    // DOC
    quotations: ["read"], customers: ["read"],
    calculator: ["read", "write"], queue: ["read"],
    // เฟส 2
    product_gallery: ["read"],
  },
  PRODUCTION: {
    // OMS
    jobs: ["read"], production: ["read", "write"], issues: ["read", "write"], dashboard: ["read"],
    // DOC — สต๊อก R/W ตามมติ (role PRODUCTION ทำสต๊อก)
    production_orders: ["read", "write"],
    stock: ["read", "write"], queue: ["read"],
    // เฟส 2
    product_gallery: ["read"],
  },
  INSTALLER: {
    // OMS
    jobs: ["read"], production: ["read"], installation: ["read", "write"],
    issues: ["read", "write"], dashboard: ["read"],
    // DOC — ดูใบสั่งผลิตได้ (R) เพื่อเช็คสินค้าก่อนติดตั้ง
    production_orders: ["read"],
    warranties: ["read"], queue: ["read"],
    // เฟส 2
    product_gallery: ["read"],
  },
  ACCOUNTING: {
    // OMS
    jobs: ["read"], "jobs:finance_fields": ["read"],
    finance: ["read", "write", "void"], dashboard: ["read"],
    // DOC
    quotations: ["read"], customers: ["read", "write"],
    billing: ["read", "write"], receipts: ["read", "write"],
    stock: ["read"],
    // เฟส 2
    product_gallery: ["read"],
  },
  VIEWER: {
    jobs: ["read"], dashboard: ["read"],
    quotations: ["read"], queue: ["read"],
    // เฟส 2
    product_gallery: ["read"],
  },
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

// OMS sidebar (ฝั่งปฏิบัติงาน) — เหมือนเดิม
export function menusFor(role: Role): string[] {
  const all = ["dashboard", "jobs", "production", "installation", "issues", "finance", "users", "settings"];
  const map: Record<string, Resource> = {
    dashboard: "dashboard", jobs: "jobs", production: "production",
    installation: "installation", issues: "issues", finance: "finance",
    users: "users", settings: "settings",
  };
  return all.filter((m) => can(role, map[m], "read"));
}

// DOC sidebar (ฝั่งเอกสาร/บัญชี) — กรองตาม role
export function docMenusFor(role: Role): string[] {
  const all = [
    "dashboard", "queue", "customers", "quotations",
    "calculator", "billing", "receipts",
    "production_orders", "warranties", "stock",
  ];
  const map: Record<string, Resource> = {
    dashboard:        "dashboard",
    queue:            "queue",
    customers:        "customers",
    quotations:       "quotations",
    calculator:       "calculator",
    billing:          "billing",
    receipts:         "receipts",
    production_orders:"production_orders",
    warranties:       "warranties",
    stock:            "stock",
  };
  return all.filter((m) => can(role, map[m], "read"));
}

export const FINANCE_FIELD_ROLES: Role[] = ["ADMIN", "SALES", "ACCOUNTING"];
