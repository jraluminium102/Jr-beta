import { businessDateIssue } from "../src/lib/date-guard.ts";
const T = [
  // [input, allowFuture, ควรผ่านไหม, คำอธิบาย]
  ["2026-06-16", false, true,  "วันปกติในอดีต"],
  ["2026-07-16", false, true,  "วันนี้"],
  ["2026-12-06", false, false, "เคสจริง คุณโสมนัสสา — วัน/เดือนสลับ กลายเป็นอนาคต"],
  ["2026-11-06", false, false, "เคสจริง คุณศุภธัช"],
  ["2026-09-06", false, false, "เคสจริง คุณสายทิพย์"],
  ["2026-12-06", true,  true,  "อนาคตได้ ถ้าอนุญาต (เช่นวันนัดติดตั้ง)"],
  ["2569-06-16", false, false, "ปี พ.ศ."],
  ["2026-02-31", false, false, "วันที่ไม่มีจริง"],
  ["2026-13-01", false, false, "เดือน 13"],
  ["16/06/2026", false, false, "รูปแบบผิด (DD/MM/YYYY)"],
  ["2019-12-31", false, false, "เก่าเกินไป"],
  ["", false, false, "ว่าง"],
  ["2026-6-1", false, false, "ไม่ pad ศูนย์"],
];
let bad = 0;
for (const [iso, allowFuture, shouldPass, why] of T) {
  const issue = businessDateIssue(iso, { allowFuture, label: "วันที่ส่งใบเสนอ" });
  const passed = issue === null;
  const ok = passed === shouldPass;
  if (!ok) bad++;
  console.log(`${ok ? "✅" : "❌"} ${String(iso).padEnd(12)} allowFuture=${String(allowFuture).padEnd(5)} → ${passed ? "ผ่าน" : "ไม่ผ่าน: " + issue}   [${why}]`);
}
console.log(bad ? `\n${bad} เคสไม่ตรงคาด` : "\nถูกทุกเคส");
process.exit(bad ? 1 : 0);
