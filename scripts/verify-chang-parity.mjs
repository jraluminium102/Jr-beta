/**
 * กันตารางผลิต "เว็บหลัก" กับ "ลิงก์ช่าง" หลุดกันอีก
 *
 * ที่มา (16 ก.ค.2569): 2 ทางนี้เคยต่างคนต่างเขียน query เอง แล้วค่อย ๆ หลุดกันเงียบ ๆ
 *   · งานจดเอง (adhoc) — เว็บหลักมี ลิงก์ช่างไม่ดึง → เจ้าของเพิ่มงานแล้วช่างไม่เห็น
 *   · producer_note — เว็บหลักส่ง ลิงก์ช่างไม่ส่ง
 *   · งาน READY — เว็บหลักซ่อน ลิงก์ช่างโชว์
 * ไม่มี error ไม่มีเทสจับ รู้ตัวอีกทีคือผู้ใช้มาบอก → เทสนี้คือตัวจับ
 *
 * เทสแบบ static (ไม่ต้องต่อ DB/เว็บ): อ่านโค้ดว่ายัง "ใช้ตัวสร้างแถวกลางร่วมกัน" อยู่ไหม
 *   node scripts/verify-chang-parity.mjs
 */
import { readFileSync } from "node:fs";

const F = {
  shared: "src/lib/production/schedule.ts",
  mainApi: "src/app/api/production-schedule/route.ts",
  changApi: "src/app/api/chang/[token]/route.ts",
  mainPage: "src/app/(app)/(oms)/production-schedule/page.tsx",
  changPage: "src/app/chang/[token]/ChangPublicView.tsx",
};
const read = (k) => readFileSync(F[k], "utf8");

const checks = [
  {
    name: "API เว็บหลัก ใช้ buildScheduleRows (ไม่ query เอง)",
    pass: () => {
      const s = read("mainApi");
      return s.includes("buildScheduleRows") && !s.includes('.from("productions")');
    },
    fix: "อย่า query productions ตรง ๆ ใน /api/production-schedule — เรียก buildScheduleRows() จาก src/lib/production/schedule.ts",
  },
  {
    name: "API ลิงก์ช่าง ใช้ buildScheduleRows (ไม่ query เอง)",
    pass: () => {
      const s = read("changApi");
      return s.includes("buildScheduleRows") && !s.includes('.from("productions")');
    },
    fix: "อย่า query productions ตรง ๆ ใน /api/chang/[token] — เรียก buildScheduleRows() ตัวเดียวกับเว็บหลัก",
  },
  {
    name: "ลิงก์ช่างกรองงานด้วยกติกากลาง isVisibleToChang",
    // ⚠ ต้องเช็ค ".filter(isVisibleToChang)" ไม่ใช่แค่ชื่อ — บรรทัด import ก็มีชื่อนี้
    //   (เทสรุ่นแรกเช็คแค่ชื่อ พอลองลบ .filter ออก เทสยังเขียว = จับไม่ได้เลย)
    pass: () => /\.filter\(\s*isVisibleToChang\s*\)/.test(read("changApi")),
    fix: "ลิงก์ช่างต้อง .filter(isVisibleToChang) — ไม่งั้นช่างเห็นงาน READY ที่เว็บหลักซ่อนไปแล้ว",
  },
  {
    name: "ชุดคอลัมน์ชุดงาน (SET_COLS) มีที่เดียว",
    pass: () => !read("changApi").includes("const SET_COLS") && read("shared").includes("export const SET_COLS"),
    fix: "SET_COLS ต้องอยู่ใน src/lib/production/schedule.ts ที่เดียว — ประกาศซ้ำ = เพิ่มฟีลด์แล้วลืมอีกฝั่ง",
  },
  {
    name: "ลิงก์ช่างใช้ตัวคิดเดดไลน์/สถานะชุด ตัวเดียวกับเว็บหลัก",
    pass: () => {
      const s = read("changPage");
      return s.includes("deadlineInfo") && s.includes("setIsDone") &&
        s.includes('from "@/app/(app)/(oms)/production-schedule/page"');
    },
    fix: "ChangPublicView ต้อง import deadlineInfo/setIsDone จาก production-schedule/page — ห้ามก๊อปสูตรไปเขียนใหม่",
  },
  {
    name: "ฟีลด์ที่ช่างต้องเห็น ถูกส่งครบจากตัวกลาง",
    pass: () => {
      const s = read("shared");
      return ["producer_note", "kind", "subtitle", "adhoc_production_tasks", "due_date"].every((k) => s.includes(k));
    },
    fix: "buildScheduleRows ต้องส่ง kind/subtitle/producer_note/due_date + รวมงานจดเอง (adhoc_production_tasks)",
  },
  {
    name: "ลิงก์ช่างโชว์งานจดเอง + โน้ตช่าง",
    pass: () => {
      const s = read("changPage");
      return s.includes("producer_note") && s.includes('kind === "adhoc"');
    },
    fix: "ChangPublicView ต้องเรนเดอร์ producer_note และป้ายงานจดเอง (kind === 'adhoc')",
  },
  {
    name: "ค่ามาร์คของช่าง ยาวได้เท่าตัวเลือกดรอปดาวน์ที่ออฟฟิศเพิ่มเองได้ (60)",
    pass: () => read("changApi").includes("z.string().max(60)"),
    fix: "patchSchema.value ต้อง max(60) เท่าลิมิตของ /api/production-set-options — น้อยกว่านั้นช่างกดตัวเลือกยาว ๆ ไม่ได้",
  },
];

let bad = 0;
for (const c of checks) {
  let ok = false;
  try { ok = c.pass(); } catch (e) { ok = false; }
  if (!ok) bad++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}`);
  if (!ok) console.log(`   → ${c.fix}`);
}
console.log(bad ? `\n❌ ${bad}/${checks.length} ไม่ผ่าน — เว็บหลักกับลิงก์ช่างกำลังจะหลุดกัน` : `\n✅ ผ่านครบ ${checks.length} — เว็บหลักกับลิงก์ช่างยังใช้ของร่วมกันอยู่`);
process.exit(bad ? 1 : 0);
