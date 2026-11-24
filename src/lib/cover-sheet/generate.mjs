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

// ── ดึงบุลเลท "หมายเหตุ" จาก item.detail (บล็อกใต้ "หมายเหตุ") — สำหรับคอลัมน์ 2/3 ──────
export function noteBulletsFromDetail(detail) {
  const lines = String(detail || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let inNote = false;
  const out = [];
  for (const ln of lines) {
    const head = ln.replace(/^[#\-\s]+/, "").trim();
    if (/^หมายเหตุ/.test(head)) { inNote = true; continue; }
    // เจอหัวข้ออื่น (สเปค/รายละเอียด/เงื่อนไข/#) = จบบล็อกหมายเหตุ
    if (/^(รายละเอียดงาน|สเปก|รายละเอียด|เงื่อนไข)/.test(head)) { inNote = false; continue; }
    if (!inNote) continue;
    if (/^#/.test(ln)) { inNote = false; continue; }
    if (/^-/.test(ln)) out.push(ln.replace(/^-\s*/, "").trim());
  }
  return out;
}

// ── คอลัมน์ 2 (แจ้งช่างตอนติดตั้ง): ตัดหมายเหตุเหลือ "ขอบเขตงาน" ────────────────────
//   "ราคาที่เสนอรวมงาน{X} หากพบ.../ในกรณี..." → {X} เช่น "รื้อประตูเดิม" · "ดรอปพื้น"
//   เอาเฉพาะบรรทัดที่บอกขอบเขตงาน (ขึ้นต้นราคา…รวมงาน) — บรรทัดอื่น (ยืนราคา/ชำระเงิน) คืน ""
export function installerScopeFromNote(note) {
  const s = String(note || "").replace(/\s+/g, " ").trim();
  const m = s.match(/^ราคา\S*?รวมงาน(.+)$/) || s.match(/^รวมงาน(.+)$/);
  if (!m) return "";
  let scope = m[1].trim();
  scope = scope.replace(/\s*\(\s*ลูกค้า[^)]*\)\s*/g, " ");        // ตัดวงเล็บ "(ลูกค้า…เตรียม…)" (ไปคอลัมน์ 3)
  scope = scope.split(/\s+(?:หากพบ|ในกรณี|กรณี|เช่น|โดย|ทั้งนี้|ซึ่ง)/)[0]; // ตัดท้ายที่เงื่อนไข/ตัวอย่าง
  return scope.replace(/\s{2,}/g, " ").trim();
}

// ── คอลัมน์ 3 (แจ้งลูกค้า + เตรียมของ): ดึงบรรทัด "ลูกค้า…เตรียม…" ───────────────────
//   เช่น "(ลูกค้าดำเนินการเตรียมวัสดุและสีให้)" → "ลูกค้าดำเนินการเตรียมวัสดุและสีให้"
export function customerPrepFromNote(note) {
  const s = String(note || "").replace(/\s+/g, " ").trim();
  const m = s.match(/ลูกค้า[^()]*?เตรียม[^()]*/);
  if (!m) return "";
  return m[0].replace(/\s+/g, " ").replace(/[\s.]+$/, "").trim();
}

// ── ของที่ช่างต้องเตรียมไปหน้างาน (ช่องกลาง · เจ้าของ 24 พ.ย.69) ─────────────────────
//   แหล่งเดียว ใช้ทั้งตอนสร้างอัตโนมัติ (ดูจากใบเสนอ) และปุ่มจิ้มในหน้าแก้ใบปะหน้า
//   ① ตามงาน: ใบเสนอมีหลังคาชินโคไลท์ / โพลีตัน → ขึ้นของที่ต้องเตรียมให้เอง
//   ② ไม่เกี่ยวกับงาน (จิ้มเอง): โคมไฟ (ไฟสี + กี่อัน) · นั่งร้าน · ข้อต่อ · ตีนเป็ด
export const prepText = (name) => "เตรียม " + String(name || "").trim();
export const ROOF_PREP = [
  { key: "shinko", label: "หลังคาชินโคไลท์", re: /ชินโค|shinko/i, items: ["ยางเดิน", "ตบหลังชินโคไลท์", "ปิดปลายชินโคไลท์"] },
  { key: "poly", label: "หลังคาโพลีตัน", re: /โพลีตัน|polyton/i, items: ["ตบหลังคาหลังเต่า", "ปิดปลายโพลีตัน", "ยางเดิน"] },
];
export const PREP_EXTRAS = ["นั่งร้าน", "ข้อต่อ", "ตีนเป็ด"];
export const LAMP_COLORS = ["วอร์มไวท์", "คูลไวท์", "เดย์ไลท์"];
export function lampPrepText(count, color) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  const c = String(color || "").trim();
  return prepText("โคมไฟ" + (n > 0 ? ` ${n} อัน` : "") + (c ? ` ไฟสี${c}` : ""));
}

// ใบเสนอมีหลังคาชนิดไหนบ้าง → คีย์ของ ROOF_PREP (เรียงตาม ROOF_PREP)
//   ดูชื่อข้อ + บรรทัดรายละเอียด (ไม่ดูบล็อกหมายเหตุ/เงื่อนไข — กันข้อความแบบ "รื้อหลังคาโพลีตันเดิม")
//   ไม่นับ: ผนังที่ทำจากแผ่นหลังคา · วัสดุซ่อนสโลป · ของเดิมที่รื้อออก
export function roofPrepKeys(items) {
  const found = new Set();
  const scan = (raw) => {
    // "แผ่นหลังคา" ในชื่อ "ผนังแผ่นหลังคา" ไม่ใช่งานหลังคา — ตัดออกก่อนดูว่าคำว่า ผนัง หรือ หลังคา อยู่ใกล้ชื่อวัสดุกว่ากัน
    const u = String(raw || "").replace(/ซ่อนสโลป[^)]*/g, "").replace(/แผ่นหลังคา/g, "");
    for (const p of ROOF_PREP) {
      const re = new RegExp(p.re.source, "gi");
      let m;
      while ((m = re.exec(u))) {
        const before = u.slice(0, m.index), after = u.slice(m.index);
        if (/รื้อ/.test(before.slice(-25))) continue;                       // ของที่รื้อออก
        if (/^[^\s()]*\s*(?:ของ)?เดิม/.test(after)) continue;               // "โพลีตันเดิม"
        if (before.lastIndexOf("ผนัง") > Math.max(before.lastIndexOf("หลังคา"), before.lastIndexOf("กันสาด"))) continue; // ผนังทำจากแผ่นนี้
        found.add(p.key);
        break;
      }
    }
  };
  for (const it of items || []) {
    if (/ส่วนลด|discount/i.test(String(it?.name || ""))) continue;
    scan(it?.name);
    let inNote = false;
    for (const ln of String(it?.detail || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      const head = ln.replace(/^[#\-\s]+/, "").trim();
      if (/^(หมายเหตุ|เงื่อนไข)/.test(head)) { inNote = true; continue; }
      if (/^(รายละเอียดงาน|สเปก|รายละเอียด)/.test(head)) { inNote = false; continue; }
      if (!inNote) scan(ln);
    }
  }
  return ROOF_PREP.filter((p) => found.has(p.key)).map((p) => p.key);
}

// บรรทัด "เตรียม …" ของหลังคาที่เจอในใบเสนอ (ไม่ซ้ำ · ยางเดิน ใช้ร่วมสองแบบ ขึ้นครั้งเดียว)
export function roofPrepLines(items) {
  const out = [];
  for (const k of roofPrepKeys(items)) {
    for (const name of ROOF_PREP.find((p) => p.key === k).items) {
      const t = prepText(name);
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

// ── สร้างคอลัมน์ 2/3 จากหมายเหตุทุกข้อในใบเสนอ (dedup รักษาลำดับ) ────────────────────
export function buildSideColumns(items) {
  const midSeen = new Set(), rightSeen = new Set();
  const mid = [], right = [];
  for (const it of items || []) {
    if (!isWorkItem(it)) continue;
    for (const note of noteBulletsFromDetail(it.detail)) {
      const scope = installerScopeFromNote(note);
      if (scope && !midSeen.has(scope)) { midSeen.add(scope); mid.push({ text: scope, color: "", kind: "spec" }); }
      const prep = customerPrepFromNote(note);
      if (prep && !rightSeen.has(prep)) { rightSeen.add(prep); right.push({ text: prep, color: "", kind: "spec" }); }
    }
  }
  // ของที่ช่างต้องเตรียมตามชนิดหลังคา → ต่อท้ายช่องกลาง
  for (const t of roofPrepLines(items)) {
    if (!midSeen.has(t)) { midSeen.add(t); mid.push({ text: t, color: "", kind: "spec" }); }
  }
  return { mid, right };
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

// ── แปลง groups → "list แบน" ของคอลัมน์ซ้าย ตามโหมด (สิ่งที่เห็น=สิ่งที่พิมพ์) ──────
//   short   : บุลเลทล้วน (ไม่มีหัวข้อชุด) · สเปคซ้ำหลายชุดรวม ต่อท้าย "(ชุด …)" ในตัวข้อความ
//   grouped : หัวข้อชุด (kind:'group' + เลข n) คั่นแต่ละชุด แล้วตามด้วยบุลเลท
export function toLeftLines(groups, mode) {
  if (mode === "grouped") {
    const out = [];
    for (const g of groups) {
      out.push({ text: g.title, color: "", hl: false, kind: "group", n: g.n });
      for (const l of g.lines) out.push({ text: l.text, color: l.color || "", hl: !!l.hl, kind: "spec" });
    }
    return out;
  }
  return toShort(groups).map((s) => ({
    text: s.ref ? `${s.text}  (${s.ref})` : s.text,
    color: s.color || "", hl: !!s.hl, kind: "spec",
  }));
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
