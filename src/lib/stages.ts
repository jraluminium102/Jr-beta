// State machine 24 stage — flow ลูกค้า (entity = jobs.current_stage)
// UI ใช้เป็น single source of truth · status enum เดิม sync ที่ DB (advance_stage RPC)

export const STAGE_NAMES: Record<number, string> = {
  1: "ลูกค้านัดดูหน้างาน",
  2: "บันทึกเข้าทะเบียนลูกค้า",
  3: "ฝ่ายแบบวาดแบบ",
  4: "เซลล์ตรวจแบบ",
  5: "ทำใบเสนอราคา",
  6: "เจรจาราคา",
  7: "ส่งใบเสนอให้ลูกค้า",
  8: "ลูกค้ามัดจำ",
  9: "รอวัดจริง",
  10: "หัวหน้าช่างเข้าวัด",
  11: "ประชุมหลังวัด",
  12: "แก้แบบ + ใบเสนอ",
  13: "คอนเฟิร์มลูกค้า",
  14: "ทำเอกสารลูกค้า",
  15: "ลงคิวผลิต",
  16: "สั่งอลูมิเนียม",
  17: "สั่งกระจก",
  18: "ผลิตงาน",
  19: "QC โรงงาน",
  20: "ผลิตเสร็จ/รอติดตั้ง",
  21: "เข้าติดตั้ง",
  22: "รอลูกค้าตรวจรับ",
  23: "แก้งาน",
  24: "ส่งงาน + รับประกัน",
};

// loop ที่อนุญาต (ย้อนกลับได้) — ตรงกับ advance_stage RPC
export const STAGE_LOOPS: Record<number, number> = { 4: 3, 6: 5, 12: 11, 23: 22 };

// stage ที่มี "ฟอร์มเฉพาะ" อยู่แล้ว (ปุ่มทั่วไปจะชี้ไปฟอร์มนั้นแทน advance ตรง ๆ)
export const STAGE_FORM: Record<number, "deposit" | "production" | "installation"> = {
  8: "deposit",
  9: "production", 10: "production", 11: "production", 12: "production", 13: "production",
  14: "production", 15: "production", 16: "production", 17: "production", 18: "production", 19: "production",
  21: "installation", 22: "installation", 23: "installation",
};

export const STAGE_GROUP: Record<number, string> = {};
for (let i = 1; i <= 24; i++) STAGE_GROUP[i] = i <= 7 ? "ขาย" : i === 8 ? "มัดจำ" : i <= 19 ? "ผลิต" : "ติดตั้ง";

export const stageName = (n: number) => STAGE_NAMES[n] ?? `ขั้น ${n}`;
export const nextStage = (n: number) => (n >= 1 && n < 24 ? n + 1 : null);
export const loopTarget = (n: number) => STAGE_LOOPS[n] ?? null;
export const isDone = (n: number) => n >= 24;
