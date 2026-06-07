// ทดสอบ deriveCoverSheet เทียบใบปะหน้าจริง 3 ใบ (ณัฐวดี/อ้อ/รุ่ง)
// รัน: node scripts/test-cover.ts   (node v24 strip TS types เอง)
import { deriveCoverSheet } from "../src/lib/coverSheet.ts";

// mock production order — ใส่แค่ items (parser ใช้แค่ field นี้)
const mk = (detail: string) => ({ items: [{ name: "x", detail, qty: 1 }] }) as any;

const CASES: Record<string, { order: any; expect: { prepare: number; installer: number; customer: number } }> = {
  "ณัฐวดี (กั้นห้องกระจก)": {
    order: mk(
      [
        "- ด้าน A บานกระจกติดตาย",
        "- ด้าน B ประตูบานเลื่อนลากจูงรางล่าง (รุ่นกันน้ำ) แบ่ง 3 บาน (มีมุ้งจีบ)",
        "- ด้าน C หน้าต่างบานเลื่อนสลับ",
        "- อลูมิเนียม สีอบขาว",
        "- กระจกเขียว หนา 6 มม.",
        "- มุ้งจีบ ผ้าไฟเบอร์ดำ",
        "หมายเหตุ — ราคาที่เสนอรวม: งานเสริมกล่องอลูมิเนียม สีอบขาว (ด้าน A) / งานดรอปพื้น (ด้าน B) / งานรื้อระแนงเดิม (ด้าน C)",
        "หมายเหตุ — ไม่รวม: สีทาเก็บงาน (ลูกค้าเตรียมวัสดุ)",
      ].join("\n")
    ),
    expect: { prepare: 3, installer: 3, customer: 1 },
  },
  "อ้อ (กั้นห้องกระจก + ไฟ)": {
    order: mk(
      [
        "- ด้าน A หน้าต่างบานเลื่อนสลับ",
        "- ด้าน B ประตูบานเลื่อน",
        "- ด้าน C บานกระจกติดตาย",
        "- หลังคาไวนิล สีขาว",
        "- อลูมิเนียม สีอบขาว",
        "- กระจกเขียว หนา 6 มม.",
        "- มุ้งเฟรมเล็ก ผ้าไฟเบอร์เทา (ด้าน B)",
        "- มุ้งจีบ ผ้าไฟเบอร์เทา (ด้าน A, C)",
        "- รางน้ำ อลูมิเนียม",
        "- ตะแกรงพลาสติกกันใบไม้ สีดำ",
        '- ท่อน้ำทิ้ง PVC 2.5" สีขาว',
        "- สวิตช์ไฟ 1 จุด + ปลั๊กไฟ 9 จุด",
        "หมายเหตุ — ราคาที่เสนอรวม: เดินไฟดาวน์ไลท์ (ท่อลอย) 8 ดวง + สวิตช์ไฟ 1 จุด และปลั๊กไฟ 9 จุด",
      ].join("\n")
    ),
    expect: { prepare: 9, installer: 1, customer: 0 },
  },
  "รุ่ง (กั้นห้องกระจก + ระแนง + LED)": {
    order: mk(
      [
        "- อลูมิเนียม สีเทาซาฮาร่า",
        "- หลังคาไวนิล สีขาว",
        "- หลังคาโพลีตัน 3 มม. สีออสเกรย์ (108S Aus Grey)",
        "- รางน้ำ อลูมิเนียม",
        "- ตะแกรงพลาสติกกันใบไม้ สีดำ",
        '- ท่อน้ำทิ้ง PVC 3 นิ้ว สีดำ',
        '- ระแนงอลูฯลายไม้ สีสักทอง SMS 1"x1.6"',
        "- ไฟเส้น LED 2 เส้น + สวิตช์ไฟ 1 จุด",
        "- เพลทเหล็ก",
        "หมายเหตุ — ราคาที่เสนอรวม: เดินไฟเส้น LED ฝังในระแนง 2 เส้น + สวิตช์ 1 จุด (จั๊มจากไฟเดิม) / ติดตั้งไฟ Solar Cell 2 จุด",
        "หมายเหตุ — ไม่รวม: ไฟ Solar Cell 2 ดวง (ลูกค้าเตรียม)",
      ].join("\n")
    ),
    expect: { prepare: 9, installer: 2, customer: 1 },
  },
};

let pass = 0;
let fail = 0;
for (const [name, { order, expect }] of Object.entries(CASES)) {
  const cs = deriveCoverSheet(order);
  const got = { prepare: cs.prepare.length, installer: cs.installerPrefill.length, customer: cs.customerPrefill.length };
  const ok = got.prepare === expect.prepare && got.installer === expect.installer && got.customer === expect.customer;
  console.log(`\n${ok ? "✅" : "❌"} ${name}`);
  console.log("  ① สั่งของเตรียมผลิต:");
  cs.prepare.forEach((x) => console.log("     - " + x));
  console.log("  ② แจ้งช่างติดตั้ง (pre-fill):");
  cs.installerPrefill.forEach((x) => console.log("     - " + x));
  console.log("  ③ แจ้งลูกค้าเตรียมของ (pre-fill):");
  cs.customerPrefill.forEach((x) => console.log("     - " + x));
  if (!ok) {
    console.log(`  ⚠ คาด prepare=${expect.prepare} installer=${expect.installer} customer=${expect.customer} | ได้ prepare=${got.prepare} installer=${got.installer} customer=${got.customer}`);
    fail++;
  } else pass++;
}
console.log(`\n${"─".repeat(40)}\nสรุป: ผ่าน ${pass} / ตก ${fail}`);
