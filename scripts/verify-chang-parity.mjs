/**
 * กัน "ลิงก์ช่าง" หลุดจาก "เว็บหลัก" อีก
 *
 * ที่มา (16 ก.ค.2569 · เจ้าของแจ้ง 2 รอบ):
 *   รอบ 1 "ลิงก์ช่างไม่อัพเดท" → API เขียนแยกกัน → งานจดเองหาย/โน้ตหาย/โชว์งาน READY ที่เว็บหลักซ่อน
 *   รอบ 2 "เลย์เอาท์ยังไม่เหมือนหน้าตารางผลิตในเว็บเต็ม" → รวมแค่ data ไม่พอ **หน้าจอก็ต้องตัวเดียวกัน**
 *
 * กติกาตอนนี้: ลิงก์ช่าง = **เรนเดอร์หน้า production-schedule ตัวเดียวกับเว็บหลัก**
 *   · api client แนบ x-chang-token อัตโนมัติเมื่อ path /chang/*  (src/lib/api.ts)
 *   · API เดิมรับโทเคน → ตอบ role=CHANG                        (src/lib/bff/chang-ctx.ts)
 *   · หน้าเดิมเห็น role=CHANG → เข้าโหมดช่างเอง (ซ่อนของออฟฟิศ)
 * ห้ามกลับไปทำ "หน้าลอกแบบ" / "API ลอกแบบ" อีก
 *
 *   node scripts/verify-chang-parity.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const P = {
  changPage: "src/app/chang/[token]/page.tsx",
  api: "src/lib/api.ts",
  changCtx: "src/lib/bff/chang-ctx.ts",
  shared: "src/lib/production/schedule.ts",
  mainApi: "src/app/api/production-schedule/route.ts",
  mainPage: "src/app/(app)/(oms)/production-schedule/page.tsx",
  setsApi: "src/app/api/production-sets/[id]/route.ts",
  prodApi: "src/app/api/production/[id]/route.ts",
};
const read = (k) => readFileSync(P[k], "utf8");

const checks = [
  {
    name: "ลิงก์ช่างเรนเดอร์หน้าตารางผลิต 'ตัวเดียวกับเว็บหลัก'",
    pass: () => /import\s+ProductionSchedulePage\s+from\s+"@\/app\/\(app\)\/\(oms\)\/production-schedule\/page"/.test(read("changPage"))
      && /<ProductionSchedulePage\s*\/>/.test(read("changPage")),
    fix: "อย่าเขียนหน้าตารางผลิตของช่างขึ้นมาใหม่ — /chang/[token]/page.tsx ต้อง import + เรนเดอร์ ProductionSchedulePage",
  },
  {
    name: "ไม่มีหน้าลอกแบบเก่า (ChangPublicView) หลงเหลือ",
    pass: () => !existsSync("src/app/chang/[token]/ChangPublicView.tsx"),
    fix: "ลบ ChangPublicView ทิ้ง — มันคือหน้าลอกแบบที่ทำให้เลย์เอาท์หลุดกัน",
  },
  {
    name: "ไม่มี API ลอกแบบเก่า (/api/chang/[token]) หลงเหลือ",
    pass: () => !existsSync("src/app/api/chang/[token]/route.ts"),
    fix: "ลบ /api/chang/[token] ทิ้ง — ลิงก์ช่างต้องใช้ API เดียวกับเว็บหลัก",
  },
  {
    name: "api client แนบโทเคนช่างอัตโนมัติเมื่ออยู่ใต้ /chang/",
    pass: () => {
      const s = read("api");
      return s.includes("changHeaders") && /\/\^\\\/chang\\\/\(\[\^\/\]\+\)\//.test(s) && s.includes("x-chang-token");
    },
    fix: "src/lib/api.ts ต้องมี changHeaders() ที่ match ^/chang/<token> แล้วแนบ x-chang-token ทุกคำขอ",
  },
  {
    name: "ชื่อช่าง (ไทย) ถูก encode ก่อนใส่ header",
    pass: () => read("api").includes("encodeURIComponent(who)") && read("changCtx").includes("decodeURIComponent"),
    fix: "HTTP header รับแค่ ISO-8859-1 — ชื่อไทยต้อง encodeURIComponent ฝั่ง client + decode ฝั่ง server ไม่งั้น fetch throw ทั้งคำขอ",
  },
  {
    name: "API ที่ช่างใช้ รับโทเคนผ่าน requireChangOr (ไม่โคลน endpoint)",
    pass: () => ["mainApi", "setsApi", "prodApi"].every((k) => read(k).includes("requireChangOr")),
    fix: "endpoint ที่ช่างต้องใช้ (ตารางผลิต/มาร์คชุดงาน/เริ่มผลิต-ส่งติดตั้ง) ต้องใช้ requireChangOr จาก @/lib/bff/chang-ctx",
  },
  {
    name: "endpoint ที่ช่างใช้ ไม่อ่าน ctx.profile ตรง ๆ (ช่างไม่มี profile → พัง)",
    pass: () => ["setsApi", "prodApi"].every((k) => !/ctx\.profile\.[a-z_]/.test(read(k))),
    fix: "ช่างผ่านลิงก์มี profile = null → ใช้ ctx.actorName / ctx.profile?.x แทน ctx.profile.x",
  },
  {
    name: "query ตารางผลิตอยู่ที่ตัวกลางที่เดียว (buildScheduleRows)",
    pass: () => {
      const s = read("mainApi");
      return s.includes("buildScheduleRows") && !s.includes('.from("productions")') && read("shared").includes("export const SET_COLS");
    },
    fix: "อย่า query productions ในไฟล์ API — เรียก buildScheduleRows() จาก src/lib/production/schedule.ts",
  },
  {
    name: "หน้าเว็บหลักยังมีโหมดช่าง (role CHANG) ให้ลิงก์ช่างอาศัย",
    pass: () => /meta\?\.role as string\) === "CHANG"/.test(read("mainPage")),
    fix: "หน้า production-schedule ต้องเช็ค meta.role === 'CHANG' เพื่อซ่อนของออฟฟิศ — ลิงก์ช่างพึ่งอันนี้",
  },
];

let bad = 0;
for (const c of checks) {
  let ok = false;
  try { ok = c.pass(); } catch { ok = false; }
  if (!ok) bad++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}`);
  if (!ok) console.log(`   → ${c.fix}`);
}
console.log(bad
  ? `\n❌ ${bad}/${checks.length} ไม่ผ่าน — ลิงก์ช่างกำลังจะหลุดจากเว็บหลัก`
  : `\n✅ ผ่านครบ ${checks.length} — ลิงก์ช่างใช้หน้า+API เดียวกับเว็บหลัก`);
process.exit(bad ? 1 : 0);
