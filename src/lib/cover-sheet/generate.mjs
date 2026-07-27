// generate.mjs — สร้าง "ใบปะหน้า" อัตโนมัติจากข้อในใบเสนอราคา
//   ใช้ร่วมทั้งฝั่ง server (API) และ script ทดสอบ (pure JS ไม่มี type · เหมือน calculator40/engine.mjs)
//
//   แนวคิด: 1 ข้อในใบเสนอ (ที่มี "รายละเอียดงาน") = 1 ชุด · ดึงบุลเลทใต้ "รายละเอียดงาน" มาเป็นสเปค
//   - โหมด grouped: แยกตามชุด (มีชื่อชุด+เลข)
//   - โหมด short (default): 1 สเปค = 1 บูลเลท · สเปคเดียวกันเป๊ะที่ซ้ำหลายชุด รวมเป็นบูลเลทเดียว ต่อท้าย (ชุด …)

// ── ย่อคำแบบเบา ๆ (ปลอดภัย ไม่เปลี่ยนความหมาย) — แก้เองต่อได้ในหน้าเว็บ ──────────
function abbr(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/อบสีพิเศษ\s*/g, "");          // "อลูมิเนียม อบสีพิเศษ สีX" → "อลูมิเนียม สีX"
  s = s.replace(/^อลูมิเนียม/, "อลูฯ ");        // อลูมิเนียม (ขึ้นต้น) → อลูฯ (มีเว้นวรรค)
  s = s.replace(/^แผ่น(สมาร์ทบอร์ด|คอมโพสิต)/, "$1"); // แผ่นสมาร์ทบอร์ด → สมาร์ทบอร์ด
  s = s.replace(/\s*จำนวน\s*(\d+)\s*ตัว/g, " ×$1 ตัว"); // จำนวน 1 ตัว → ×1 ตัว
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
}

// ── ดึงบุลเลทสเปคจาก item.detail (บล็อกใต้ "รายละเอียดงาน") ─────────────────────
export function specBulletsFromDetail(detail) {
  const lines = String(detail || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let inSpec = false;
  const out = [];
  for (const ln of lines) {
    const head = ln.replace(/^[#\-\s]+/, "").trim(); // ตัด #/-/ช่องว่างนำหน้า เหลือหัวข้อ
    // หัวข้อเริ่มบล็อกสเปค — ตรงกับ AUTO_HEADINGS ใน DetailLines/quotation-options (รายละเอียดงาน/สเปก/รายละเอียด)
    if (/^(รายละเอียดงาน|สเปก|รายละเอียด)/.test(head)) { inSpec = true; continue; }
    if (/^(หมายเหตุ|เงื่อนไข)/.test(head)) { inSpec = false; continue; }
    if (!inSpec) continue;
    if (/^#/.test(ln)) { inSpec = false; continue; } // เจอหัวข้อใหม่ = จบบล็อกสเปค
    if (/^-/.test(ln)) out.push(abbr(ln.replace(/^-\s*/, "")));
  }
  return out;
}

// ── ข้อไหน "ไม่ใช่งาน" (ส่วนลด/หมายเหตุล้วน) → ข้าม ──────────────────────────────
function isWorkItem(item) {
  const name = String(item.name || "");
  if (/ส่วนลด|discount/i.test(name)) return false;
  return specBulletsFromDetail(item.detail).length > 0;
}

// ── สร้างชุด (grouped) ────────────────────────────────────────────────────────
// items: [{ name, detail, group_label? }]
export function buildGroups(items) {
  const groups = [];
  let n = 0;
  for (const it of items || []) {
    if (!isWorkItem(it)) continue;
    n += 1;
    groups.push({
      n,
      title: (it.group_label ? it.group_label + " · " : "") + String(it.name || "").trim(),
      lines: specBulletsFromDetail(it.detail).map((text) => ({ text })),
    });
  }
  return groups;
}

// ── ย่อรายการชุดเป็นข้อความ เช่น [1,2,3,5] → "1–3, 5" ─────────────────────────────
export function fmtSetRefs(nums) {
  const a = [...new Set(nums)].sort((x, y) => x - y);
  const parts = [];
  let i = 0;
  while (i < a.length) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    parts.push(j > i ? `${a[i]}–${a[j]}` : `${a[i]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

// ── โหมดสั้น: 1 สเปค = 1 บูลเลท · สเปคเดียวกันเป๊ะรวมกัน ต่อท้าย (ชุด …) ──────────
export function toShort(groups) {
  const map = new Map(); // key(text) → { text, color, hl, sets:number[] }
  const order = [];
  for (const g of groups) {
    for (const l of g.lines) {
      const key = (l.text || "").trim();
      if (!key) continue;
      if (!map.has(key)) {
        // สี/ไฮไลต์ = ของบรรทัดแรกที่เจอ (first-occurrence wins) — กันหายตอนพิมพ์โหมดสั้น
        map.set(key, { text: l.text, color: l.color || "", hl: !!l.hl, sets: [] });
        order.push(key);
      }
      const e = map.get(key);
      if (!e.sets.includes(g.n)) e.sets.push(g.n);
    }
  }
  const multi = groups.length > 1;
  return order.map((k) => {
    const e = map.get(k);
    return { text: e.text, color: e.color, hl: e.hl, sets: e.sets, ref: multi ? `ชุด ${fmtSetRefs(e.sets)}` : "" };
  });
}

// ── สร้างใบปะหน้าเต็ม (default = short) ────────────────────────────────────────
export function generateCoverSheet(items, opts = {}) {
  const groups = buildGroups(items);
  return {
    mode: opts.mode || "short",          // default สั้นมาก่อน
    groups,                               // สำหรับโหมด grouped
    short: toShort(groups),               // สำหรับโหมด short
  };
}
