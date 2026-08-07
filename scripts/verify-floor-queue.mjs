// verify-floor-queue.mjs — golden test ข้อความ "คัดลอกไปไลน์" ของหน้าจัดคิวงานพื้น
//   รัน: node scripts/verify-floor-queue.mjs
import { buildLineExport, fmtQueueTime } from "../src/lib/floor-queue/line-export.mjs";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`✗ ${name}`);
  console.log(`  got : ${JSON.stringify(got)}`);
  console.log(`  want: ${JSON.stringify(want)}`);
};

// ── helper ──
eq("fmtQueueTime ตัดศูนย์นำหน้าชั่วโมง", fmtQueueTime("09:00"), "9.00");
eq("fmtQueueTime ชั่วโมง 2 หลัก", fmtQueueTime("14:30"), "14.30");

// ── เคส 1: มีวัน + สถานะรอ CF ──
{
  const entries = [
    { customer_name: "กนกวรรณ(ลพบุรี)", work_desc: "ต่องานฝ้า,ไฟ", extra_note: "", duration_note: "",
      scheduled_date: "2026-08-07", start_time: "09:00", status: "wait_cf", bucket: "scheduled", kind: "work", sort_order: 0 },
  ];
  const want = [
    "☀️🌤️ อัพเดทคิวเดือนสิงหาคม 🌤️✨",
    "",
    "🔴 วันที่ 7 สิงหาคม 2569 , 9.00 น.",
    "- คุณกนกวรรณ(ลพบุรี) : ต่องานฝ้า,ไฟ (รอCF)",
  ].join("\n");
  eq("เคส 1: วันที่ + (รอCF)", buildLineExport(entries), want);
}

// ── เคส 2: kind assess (ประเมิน/คุยงาน) ──
{
  const entries = [
    { customer_name: "ธัญญาภรณ์", work_desc: "เข้าคุยเรื่องเก็บงาน", extra_note: "", duration_note: "คุยอย่างเดียวยังไม่ให้แก้งาน",
      scheduled_date: "2026-08-01", start_time: "09:00", status: "confirmed", bucket: "scheduled", kind: "assess", sort_order: 0 },
  ];
  const want = [
    "☀️🌤️ อัพเดทคิวเดือนสิงหาคม 🌤️✨",
    "",
    "🟣 วันที่ 1 สิงหาคม 2569 , 9.00 น.",
    "- คุณธัญญาภรณ์ : เข้าคุยเรื่องเก็บงาน (คุยอย่างเดียวยังไม่ให้แก้งาน)",
  ].join("\n");
  eq("เคส 2: kind assess ใช้ 🟣 ไม่มี (รอCF) เพราะ confirmed", buildLineExport(entries), want);
}

// ── เคส 3: 2 ถังท้าย (ไม่มีวัน) ──
{
  const entries = [
    { customer_name: "เจนจิรา", work_desc: "ต่องานเฟส2", extra_note: "", bucket: "after_jr", kind: "work", sort_order: 0 },
    { customer_name: "อ้อ", work_desc: "ติดดาวน์ไลท์+ทาสีผนัง", extra_note: "", bucket: "after_jr", kind: "work", sort_order: 1 },
    { customer_name: "ณัฐวดี", work_desc: "", extra_note: "รอลูกค้าคอนเฟิร์มทำงาน", bucket: "deposit_wait", kind: "work", sort_order: 0 },
    { customer_name: "ฐิตาภัสร์", work_desc: "", extra_note: "รอJRติดตั้งเสร็จ", bucket: "deposit_wait", kind: "work", sort_order: 1 },
  ];
  const want = [
    "งานที่รอต่อหลังJRเสร็จ",
    "- คุณเจนจิรา : ต่องานเฟส2",
    "- คุณอ้อ : ติดดาวน์ไลท์+ทาสีผนัง",
    "",
    "",
    "ลูกค้ามัดจำมาแล้ว รอลงคิว",
    "- คุณณัฐวดี (รอลูกค้าคอนเฟิร์มทำงาน)",
    "- คุณฐิตาภัสร์ (รอJRติดตั้งเสร็จ)",
  ].join("\n");
  eq("เคส 3: 2 ถังท้าย ไม่มีวัน คั่นกัน 2 บรรทัดว่าง", buildLineExport(entries), want);
}

// ── เคส 4 (เสริม): ทุกอย่างรวมกัน — หลายวัน + ถัง (ล็อกลำดับ + การคั่นทั้งชุด) ──
{
  const entries = [
    { customer_name: "รชต", work_desc: "เริ่มงาน(เลขที่185/716ชั้น14)", extra_note: "", duration_note: "ทำ3วัน",
      scheduled_date: "2026-08-04", start_time: "09:00", status: "confirmed", bucket: "scheduled", kind: "work", sort_order: 0 },
    { customer_name: "กนกวรรณ(ลพบุรี)", work_desc: "ต่องานฝ้า,ไฟ", extra_note: "", duration_note: "",
      scheduled_date: "2026-08-07", start_time: "09:00", status: "wait_cf", bucket: "scheduled", kind: "work", sort_order: 0 },
    { customer_name: "ธัญญาภรณ์", work_desc: "เข้าคุยเรื่องเก็บงาน", extra_note: "", duration_note: "คุยอย่างเดียวยังไม่ให้แก้งาน",
      scheduled_date: "2026-08-01", start_time: "09:00", status: "confirmed", bucket: "scheduled", kind: "assess", sort_order: 0 },
    { customer_name: "เจนจิรา", work_desc: "ต่องานเฟส2", extra_note: "", bucket: "after_jr", kind: "work", sort_order: 0 },
    { customer_name: "อ้อ", work_desc: "ติดดาวน์ไลท์+ทาสีผนัง", extra_note: "", bucket: "after_jr", kind: "work", sort_order: 1 },
    { customer_name: "ณัฐวดี", work_desc: "", extra_note: "รอลูกค้าคอนเฟิร์มทำงาน", bucket: "deposit_wait", kind: "work", sort_order: 0 },
    { customer_name: "ฐิตาภัสร์", work_desc: "", extra_note: "รอJRติดตั้งเสร็จ", bucket: "deposit_wait", kind: "work", sort_order: 1 },
  ];
  const want = [
    "☀️🌤️ อัพเดทคิวเดือนสิงหาคม 🌤️✨",
    "",
    "🟣 วันที่ 1 สิงหาคม 2569 , 9.00 น.",
    "- คุณธัญญาภรณ์ : เข้าคุยเรื่องเก็บงาน (คุยอย่างเดียวยังไม่ให้แก้งาน)",
    "",
    "🔴 วันที่ 4 สิงหาคม 2569 , 9.00 น.",
    "- คุณรชต : เริ่มงาน(เลขที่185/716ชั้น14) (ทำ3วัน)",
    "",
    "🔴 วันที่ 7 สิงหาคม 2569 , 9.00 น.",
    "- คุณกนกวรรณ(ลพบุรี) : ต่องานฝ้า,ไฟ (รอCF)",
    "",
    "",
    "งานที่รอต่อหลังJRเสร็จ",
    "- คุณเจนจิรา : ต่องานเฟส2",
    "- คุณอ้อ : ติดดาวน์ไลท์+ทาสีผนัง",
    "",
    "",
    "ลูกค้ามัดจำมาแล้ว รอลงคิว",
    "- คุณณัฐวดี (รอลูกค้าคอนเฟิร์มทำงาน)",
    "- คุณฐิตาภัสร์ (รอJRติดตั้งเสร็จ)",
  ].join("\n");
  eq("เคส 4: รวมทุกส่วน — เรียงวันน้อย→มาก (ข้ามชนิด) + คั่นบล็อก/ถังถูกต้อง", buildLineExport(entries), want);
}

// ── เคส 5: ไม่มีข้อมูลเลย → string ว่าง ไม่ throw ──
eq("เคส 5: entries ว่าง → \"\"", buildLineExport([]), "");

// ── เคส 6: ชื่อมี "คุณ" นำหน้ามาแล้ว (ดึงจากงาน JR) → ไม่ซ้ำ "คุณคุณ" ──
{
  const entries = [
    { customer_name: "คุณสมชาย", work_desc: "เริ่มงาน", extra_note: "", duration_note: "",
      scheduled_date: "2026-08-10", start_time: "09:00", status: "confirmed", bucket: "scheduled", kind: "work", sort_order: 0 },
    { customer_name: "คุณฐิตาภัสร์", work_desc: "", extra_note: "รอJRติดตั้งเสร็จ", bucket: "deposit_wait", kind: "work", sort_order: 0 },
  ];
  const want = [
    "☀️🌤️ อัพเดทคิวเดือนสิงหาคม 🌤️✨",
    "",
    "🔴 วันที่ 10 สิงหาคม 2569 , 9.00 น.",
    "- คุณสมชาย : เริ่มงาน",
    "",
    "",
    "ลูกค้ามัดจำมาแล้ว รอลงคิว",
    "- คุณฐิตาภัสร์ (รอJRติดตั้งเสร็จ)",
  ].join("\n");
  eq("เคส 6: ชื่อมี 'คุณ' มาแล้ว → ไม่ซ้ำ", buildLineExport(entries), want);
}

// ── เคส 7: คิวลงวันแล้วแต่ยังไม่กรอกงาน → ไม่มี " : " ลอย ──
{
  const entries = [
    { customer_name: "ภวพร", work_desc: "", extra_note: "", duration_note: "",
      scheduled_date: "2026-08-10", start_time: "09:00", status: "confirmed", bucket: "scheduled", kind: "work", sort_order: 0 },
  ];
  const want = [
    "☀️🌤️ อัพเดทคิวเดือนสิงหาคม 🌤️✨",
    "",
    "🔴 วันที่ 10 สิงหาคม 2569 , 9.00 น.",
    "- คุณภวพร",
  ].join("\n");
  eq("เคส 7: ไม่มีงาน → ไม่ขึ้น ' : ' ลอย", buildLineExport(entries), want);
}

// ── เคส 8: หลายคนวันเดียวกัน (เวลา/สถานะ/kind เดียว) รวมหัวเดียว เรียงตาม sort_order ──
{
  const entries = [
    { customer_name: "ลีฟ", work_desc: "ประเมินหน้างาน", scheduled_date: "2026-07-30", start_time: "09:00", status: "confirmed", bucket: "scheduled", kind: "work", sort_order: 1 },
    { customer_name: "พิทยารัตน์", work_desc: "ต่องานสี,ไฟ", scheduled_date: "2026-07-30", start_time: "09:00", status: "confirmed", bucket: "scheduled", kind: "work", sort_order: 0 },
  ];
  const want = [
    "☀️🌤️ อัพเดทคิวเดือนกรกฎาคม 🌤️✨",
    "",
    "🔴 วันที่ 30 กรกฎาคม 2569 , 9.00 น.",
    "- คุณพิทยารัตน์ : ต่องานสี,ไฟ",
    "- คุณลีฟ : ประเมินหน้างาน",
  ].join("\n");
  eq("เคส 8: หลายคนวันเดียว หัวเดียว เรียง sort_order", buildLineExport(entries), want);
}

// ── เคส 9: วันเดียวกัน สถานะต่างกัน (confirmed + รอCF) → หัวเดียว สถานะต่อท้ายรายคน ──
{
  const entries = [
    { customer_name: "ภวพร", work_desc: "เริ่มงาน", scheduled_date: "2026-08-10", start_time: "09:00", status: "confirmed", bucket: "scheduled", kind: "work", sort_order: 0 },
    { customer_name: "สุคุณลิม", work_desc: "แก้งาน", scheduled_date: "2026-08-10", start_time: "09:00", status: "wait_cf", bucket: "scheduled", kind: "work", sort_order: 1 },
  ];
  const want = [
    "☀️🌤️ อัพเดทคิวเดือนสิงหาคม 🌤️✨",
    "",
    "🔴 วันที่ 10 สิงหาคม 2569 , 9.00 น.",
    "- คุณภวพร : เริ่มงาน",
    "- คุณสุคุณลิม : แก้งาน (รอCF)",
  ].join("\n");
  eq("เคส 9: วันเดียวสถานะต่างกัน หัวเดียว สถานะต่อท้ายคน", buildLineExport(entries), want);
}

console.log(`\n${fail === 0 ? "✓ PASS" : "✗ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
