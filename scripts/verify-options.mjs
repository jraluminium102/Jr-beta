/**
 * verify-options — OPTION ในข้อใบเสนอ (ข้อความล้วน ไม่รวมยอด)
 * รัน:  node --experimental-strip-types scripts/verify-options.mjs
 * import โค้ดจริงจาก src/lib/quotation-options.ts (ล็อกฟอร์แมต + ตำแหน่งแทรกให้ตรงตัวอย่างจริง QT2569070056)
 */
import { insertOption, buildOptionBody, countOptions } from "../src/lib/quotation-options.ts";

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
  const ok = got === exp;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n   ได้  : ${JSON.stringify(got)}\n   คาด : ${JSON.stringify(exp)}`}`);
};

console.log("\n═══ buildOptionBody — 3 แบบ ตรงตัวอย่างจริง ═══");
eq("add (เพิ่มราคา)", buildOptionBody("add", "โช๊คด้านบน", 5000), "หากลูกค้าต้องการเพิ่ม โช๊คด้านบน ราคาเพิ่ม 5,000 บาท");
eq("reduce (ลดราคา)", buildOptionBody("reduce", "อลูมิเนียม สีเทาซาฮาร่า", 2000), "หากลูกค้าต้องการเปลี่ยนเป็น อลูมิเนียม สีเทาซาฮาร่า ราคาลดลง 2,000 บาท");
eq("set (เปลี่ยนราคา)", buildOptionBody("set", "ประตูบานเปิด ( ไม่มีธรณี ) ปิดทึบ ( มีคาดตาราง )", 31500), "หากลูกค้าต้องการเปลี่ยนเป็น ประตูบานเปิด ( ไม่มีธรณี ) ปิดทึบ ( มีคาดตาราง ) ราคา 31,500 บาท");
eq("ผู้ใช้พิมพ์ 'หาก' เอง → ไม่เติม prefix ซ้ำ", buildOptionBody("add", "หากลูกค้าต้องการเพิ่มมือจับ ราคาเพิ่ม", 100).startsWith("หากลูกค้าต้องการเพิ่มมือจับ"), true);

console.log("\n═══ insertOption — เลขอัตโนมัติ + ตำแหน่ง (ก่อนหัวข้อ / ต่อจาก OPTION เดิม) ═══");
const base = "- ประตูอลูมิเนียมลูกฟูกเรียบบานเปิด\n#หมายเหตุ\n- ราคารวมติดตั้ง\nรายละเอียดงาน\n- สีอลูมิเนียม: อบขาว";
const r1 = insertOption(base, "add", "โช๊คด้านบน", 5000);
eq("แทรก #1 ก่อน #หมายเหตุ",
  r1,
  "- ประตูอลูมิเนียมลูกฟูกเรียบบานเปิด\nOPTION (1) : หากลูกค้าต้องการเพิ่ม โช๊คด้านบน ราคาเพิ่ม 5,000 บาท\n#หมายเหตุ\n- ราคารวมติดตั้ง\nรายละเอียดงาน\n- สีอลูมิเนียม: อบขาว");
const r2 = insertOption(r1, "reduce", "สีเทาซาฮาร่า", 2000);
eq("แทรก #2 ต่อจาก OPTION เดิม (จัดกลุ่ม)",
  r2.split("\n").slice(1, 3).join(" | "),
  "OPTION (1) : หากลูกค้าต้องการเพิ่ม โช๊คด้านบน ราคาเพิ่ม 5,000 บาท | OPTION (2) : หากลูกค้าต้องการเปลี่ยนเป็น สีเทาซาฮาร่า ราคาลดลง 2,000 บาท");
eq("countOptions = 2", countOptions(r2), 2);
eq("detail ว่าง → OPTION ท้ายสุด", insertOption("", "add", "x", 100), "OPTION (1) : หากลูกค้าต้องการเพิ่ม x ราคาเพิ่ม 100 บาท");
eq("ไม่มีหัวข้อ → ต่อท้ายบุลเล็ต", insertOption("- a\n- b", "add", "x", 100), "- a\n- b\nOPTION (1) : หากลูกค้าต้องการเพิ่ม x ราคาเพิ่ม 100 บาท");

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail > 0 ? 1 : 0);
