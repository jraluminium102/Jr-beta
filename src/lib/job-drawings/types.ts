// Types ฝั่ง TS สำหรับฟีเจอร์ "สแตมป์สเปคลงแบบลูกค้า (PDF)"
//   ตรงกับ job_drawings (migration 0117) — ตำแหน่งเก็บเป็นสัดส่วน 0..1 ของขนาดหน้า (ไม่เพี้ยนตามจอ/ขนาดพิมพ์)
//   size ก็เป็นสัดส่วนเดียวกัน (ของ "ความสูงหน้า") ไม่ใช่ px ตรง ๆ — คูณด้วยความสูงที่แสดงจริง (จอ/กระดาษ) แล้วได้ฟอนต์ที่ WYSIWYG ทั้งตอนแก้และตอนพิมพ์

import type { HighlightColor } from "@/lib/highlight-colors";

export type DrawingPage = { path: string; w: number; h: number }; // path = public URL รูป PNG ต่อหน้า (bucket 'drawings')

export type AnnotColor = "" | "red" | "blue" | "green";
export type AnnotAlign = "left" | "center" | "right";

export type DrawingAnnotation = {
  id: string;        // client-side key กันชนตอนแก้ (ไม่ persist เป็น column แยก อยู่ใน jsonb)
  page: number;       // index (0-based) เข้า pages[]
  xf: number;         // 0..1 ตำแหน่งซ้าย ของกล่องข้อความ (สัดส่วนความกว้างหน้า)
  yf: number;         // 0..1 ตำแหน่งบน ของกล่องข้อความ (สัดส่วนความสูงหน้า)
  size: number;       // 0..1 ขนาดฟอนต์ (สัดส่วนของ "ความสูงหน้า") ทั่วไป ~0.014–0.03
  text: string;
  color?: AnnotColor;
  align?: AnnotAlign;
  hl?: HighlightColor; // สีไฮไลต์ (พื้นหลังกล่องข้อความ) — "" / ไม่มีค่า = ไม่มีไฮไลต์ (ดู src/lib/highlight-colors.ts)
};

export type JobDrawing = {
  id: number;
  job_id: string;
  title: string;
  pdf_path: string;
  original_name: string;
  pages: DrawingPage[];
  annotations: DrawingAnnotation[];
  created_at: string;
  updated_at: string;
};

// prefill group — ตรงกับ buildGroups() ของ src/lib/cover-sheet/generate.mjs
export type PrefillLine = { text: string };
export type PrefillGroup = { n: number; title: string; lines: PrefillLine[] };

// บับเบิ้ลจากใบปะหน้า (ช่อง 1 "สั่งของเตรียมผลิต") — คงสี/ไฮไลต์ให้ตรง annotation ของแบบช่าง
export type CoverBubble = {
  text: string;
  color: AnnotColor;
  hl: HighlightColor;
  kind: "spec" | "group";
  n?: number;
};

export type JobDrawingsGetResponse = {
  drawings: JobDrawing[];
  prefill: PrefillGroup[];
  coverBubbles?: CoverBubble[];
  job: {
    job_code: string | null;
    customer_name: string;
    status: string;
    deposit_date: string | null;
    deposited: boolean; // = deposit_date != null (เกณฑ์ "มัดจำแล้ว" ที่ระบบใช้จริง — ดู mark-deposited/deposit-amount route)
    address?: string;   // ที่อยู่บ้านลูกค้า (ทะเบียนลูกค้า/customer_area) — seed หัวแบบ
  };
  can_write: boolean;   // สิทธิ์แก้ (drawings:write = ADMIN/PRODUCTION/DESIGNER) — role อ่านอย่างเดียวเห็นแต่ดู/พิมพ์
};

export const DEFAULT_ANNOT_SIZE = 0.02;
