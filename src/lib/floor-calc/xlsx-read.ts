import { inflateRawSync } from "node:zlib";

/**
 * อ่านไฟล์ .xlsx — zip + xml ล้วน ไม่พึ่งไลบรารีนอก
 * (โปรเจกต์ไม่มี sheetjs/exceljs · ไฟล์ใบเสนอของช่างเป็น xlsx ธรรมดาไม่มีอะไรพิสดาร)
 *
 * รองรับ: sharedStrings · inline string · สูตร (เอาค่าที่คำนวณไว้แล้ว) · หลายชีต
 * ไม่รองรับ (ไม่จำเป็นกับงานนี้): รูป กราฟ pivot สไตล์ วันที่แบบ serial (คืนเป็นตัวเลขดิบ)
 */

// ── ZIP ──────────────────────────────────────────────────────────────────
function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // หา End Of Central Directory (ไล่จากท้าย · comment ยาวได้ถึง 65535)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ .xlsx ที่ถูกต้อง (ไม่พบโครงสร้าง zip)");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // ตำแหน่ง central directory

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // local header — ความยาว extra ที่นี่อาจไม่เท่ากับใน central directory
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    try {
      out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    } catch {
      // ไฟล์ย่อยพังข้ามไป (เช่น thumbnail) — ไม่ให้ทั้งไฟล์ล้ม
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

// ── XML helpers ──────────────────────────────────────────────────────────
const unescapeXml = (s: string) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** เลขคอลัมน์จาก ref (A1 → 1, AB7 → 28) */
function colOf(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export type SheetGrid = {
  name: string;
  /** rows[r][c] — 0-based ทั้งคู่ · ช่องว่าง = "" */
  rows: string[][];
};

/** อ่านทุกชีตเป็นตารางข้อความ (เรียงชีตตาม workbook.xml → rels ไม่ใช่ชื่อไฟล์) */
export function readXlsx(buf: Buffer): SheetGrid[] {
  const zip = readZip(buf);
  const txt = (p: string) => zip.get(p)?.toString("utf8") ?? "";

  // sharedStrings — ต่อทุก <t> ในหนึ่ง <si> (rich text แตกหลาย run)
  const shared: string[] = [];
  const ssXml = txt("xl/sharedStrings.xml");
  if (ssXml) {
    for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
      shared.push(unescapeXml(parts.join("")));
    }
  }

  // ลำดับชีตจริง
  const wb = txt("xl/workbook.xml");
  const relsXml = txt("xl/_rels/workbook.xml.rels");
  const rels: Record<string, string> = {};
  for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, "").replace(/^\.\//, "");
  }

  const sheets: SheetGrid[] = [];
  for (const m of wb.matchAll(/<sheet[^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"[^>]*\/?>/g)) {
    const name = unescapeXml(m[1]);
    const file = rels[m[2]];
    if (!file) continue;
    const xml = txt("xl/" + file);
    if (!xml) { sheets.push({ name, rows: [] }); continue; } // chartsheet ฯลฯ

    const rows: string[][] = [];
    for (const rm of xml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rIdx = Number(rm[1]) - 1;
      const cells: string[] = [];
      for (const cm of rm[2].matchAll(/<c\s+r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const c = colOf(cm[1]) - 1;
        const attrs = cm[2] ?? "";
        const inner = cm[3] ?? "";
        const t = /t="([^"]+)"/.exec(attrs)?.[1];
        let v: string;
        if (t === "inlineStr") {
          v = unescapeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
        } else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          if (raw == null) v = "";
          else if (t === "s") v = shared[Number(raw)] ?? "";
          else v = unescapeXml(raw);
        }
        cells[c] = v;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = "";
      rows[rIdx] = cells;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name, rows });
  }
  return sheets;
}
