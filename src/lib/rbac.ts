import type { Role } from "@/lib/database.types";

export type Resource =
  | "jobs" | "jobs:finance_fields" | "production" | "installation"
  | "issues" | "finance" | "dashboard" | "settings" | "users" | "queue"
  | "designer" | "boq" | "sales_closure" | "warranties" | "stock" | "drawings"
  | "floor_queue" | "calc_overrides";
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
    stock: ["read", "write"],
    drawings: ["read", "write"],   // สแตมป์สเปคลงแบบ (0117)
    floor_queue: ["read", "write"],   // จัดคิวงานพื้น
    calc_overrides: ["read", "write"],   // ชั้นทับค่าสูตรคิดราคา 4.0/ใบตัด (0134)
  },
  SALES: {
    jobs: ["read", "write"], "jobs:finance_fields": ["read"],
    production: ["read"], issues: ["read", "write"], finance: ["read"], dashboard: ["read"],
    queue: ["read", "write"],   // [0035] เซลล์จัดการคิวตัวเองได้ (RLS จำกัดเฉพาะ sales_id ของตัวเอง)
    boq: ["read"],
    sales_closure: ["read", "write"],
    warranties: ["read", "write"],
    stock: ["read", "write"],
    drawings: ["read"],   // เซลล์เปิดดูแบบ+สเปคได้ (ไม่แก้)
    floor_queue: ["read"],
    calc_overrides: ["read", "write"],   // ชั้นทับค่าสูตรคิดราคา 4.0/ใบตัด (0134)
  },
  DESIGNER: {
    jobs: ["read", "write"], production: ["read"],
    issues: ["read", "write"],  // [0035] ช่างแบบแจ้งปัญหาแบบได้
    dashboard: ["read"],
    designer: ["read", "write"],
    warranties: ["read"],
    stock: ["read"],
    drawings: ["read", "write"],   // ดีไซเนอร์ = คนเตรียมแบบ สแตมป์สเปคลงแบบได้ (0117)
    floor_queue: ["read"],
    calc_overrides: ["read"],   // ชั้นทับค่าสูตรคิดราคา 4.0/ใบตัด (0134) — ดูได้ แก้ไม่ได้
  },
  PRODUCTION: {
    jobs: ["read"], production: ["read", "write"], issues: ["read", "write"], dashboard: ["read"],
    designer: ["read"], boq: ["read", "write"],
    warranties: ["read", "write"],  // [0035] ช่างผลิตออกใบรับประกันได้
    stock: ["read", "write"],
    drawings: ["read", "write"],   // ผลิตเตรียมแบบให้ช่างได้ (0117)
    floor_queue: ["read", "write"],   // ผลิต/ออฟฟิศ จัดคิวงานพื้น
    calc_overrides: ["read", "write"],   // ชั้นทับค่าสูตรคิดราคา 4.0/ใบตัด (0134) — คนคุมสูตรผลิต/ใบตัดจริง
  },
  INSTALLER: {
    jobs: ["read"], production: ["read"], installation: ["read", "write"],
    issues: ["read", "write"], dashboard: ["read"],
    warranties: ["read", "write"],  // [0035] ช่างติดตั้งออกใบรับประกันหลังจบงานได้
    stock: ["read"],
    drawings: ["read"],   // ช่างติดตั้งเปิดดูแบบ+สเปคได้ (ไม่แก้)
    floor_queue: ["read"],
    calc_overrides: ["read"],   // ชั้นทับค่าสูตรคิดราคา 4.0/ใบตัด (0134) — ดูได้ แก้ไม่ได้
  },
  ACCOUNTING: {
    jobs: ["read"], "jobs:finance_fields": ["read"],
    finance: ["read", "write", "void"], dashboard: ["read"],
    production: ["read"],   // เข้าหน้าผลิตดู/ถอยมัดจำได้ (finance:void) — ไม่ให้ write ผลิต
    boq: ["read", "write"],
    stock: ["read", "write"],  // บัญชี = ผู้ดูแลต้นทุน/มูลค่าคงคลัง (ตั้งราคา + รวมรายการซ้ำแบบปรับจำนวน) — canPrice ผูก ACCOUNTING อยู่แล้ว
    drawings: ["read"],   // บัญชีเปิดดูแบบ+สเปคได้ (ไม่แก้)
    floor_queue: ["read"],
    calc_overrides: ["read", "write"],   // ชั้นทับค่าสูตรคิดราคา 4.0/ใบตัด (0134) — บัญชีดูแลต้นทุน
  },
  VIEWER: { jobs: ["read"], dashboard: ["read"], calc_overrides: ["read"] },
  // ช่างผลิต — เห็นแค่ตารางผลิต กดเช็คลิสต์ (production write ไว้มาร์ค production_sets)
  CHANG: { production: ["read", "write"] },
  // สโตร์ — เห็น "แค่เรื่องสโตร์เท่านั้น" (เช็คสต๊อก/สมุดสโตร์/ใบตัด-BOQ) ไม่เห็นคิว/ใบเสนอ/ผลิต/แบบ
  //   สิทธิ์เดียว = stock · ตาบอดราคา (canSeeCost + redact ที่ API) · Shell กันเข้า path นอกสโตร์ (เด้ง /stock)
  STORE: {
    stock: ["read", "write"],
  },
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

// role ที่ "ไม่เห็นราคา/ต้นทุน" — ซ่อนที่ UI + redact ฟิลด์ราคาที่ API สต็อก (ห้ามหลุดผ่าน network)
export const COST_BLIND_ROLES: string[] = ["STORE"];
export function canSeeCost(role: string | null | undefined): boolean {
  return !!role && !COST_BLIND_ROLES.includes(role);
}

export function menusFor(role: Role): string[] {
  // issues + sales_closure ยุบเข้า followup แล้ว — ไม่ปรากฏในเมนูแยก
  // prodqueue (/production-schedule) เอาออกจากเมนูออฟฟิศแล้ว (เจ้าของสั่ง 23 ก.ค.69) — เข้าผ่านปุ่ม "เปิดตารางผลิตช่าง" ในหน้าผลิต (ลิงก์ช่าง)
  //   route ยังอยู่ (ลิงก์ช่าง /chang เรนเดอร์ component ตัวเดียวกัน · CHANG role ยังเด้งเข้าได้) — แค่ไม่โชว์ในเมนู
  const all = ["dashboard", "followup", "production", "measure_schedule", "floor_queue", "designer", "installation", "finance", "settings"];
  const map: Record<string, Resource> = {
    dashboard: "dashboard", followup: "jobs", production: "production",
    prodqueue: "production",
    measure_schedule: "production",
    floor_queue: "floor_queue",   // จัดคิวงานพื้น — resource แยก (write = ADMIN/PRODUCTION · ไม่ให้ CHANG เขียนผ่าน production)
    designer: "designer", installation: "installation",
    finance: "finance", settings: "settings",
  };
  return all.filter((m) => can(role, map[m], "read"));
}

export const FINANCE_FIELD_ROLES: Role[] = ["ADMIN", "SALES", "ACCOUNTING"];
