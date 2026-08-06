import { deflateRawSync } from "node:zlib";

/**
 * เขียนไฟล์ .xlsx — zip + xml ล้วน ไม่พึ่งไลบรารีนอก (คู่กับ xlsx-read.ts)
 * ทำเท่าที่ใบเสนอราคาต้องใช้: ข้อความ/ตัวเลข · ตัวหนา · สีพื้น · เส้นขอบ · ผสานเซลล์ · ความกว้างคอลัมน์
 */

// ── CRC32 (zip ต้องใช้) ──────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const comp = deflateRawSync(f.data);
    const crc = crc32(f.data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);          // version needed
    lh.writeUInt16LE(0x0800, 6);      // flag: ชื่อไฟล์เป็น UTF-8
    lh.writeUInt16LE(8, 8);           // method: deflate
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/\n/g, "&#10;");

const colName = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** สไตล์ที่ใช้ได้ (index ตรงกับ cellXfs ใน styles.xml ข้างล่าง) */
export const S = {
  plain: 0,
  title: 1,     // หัวเอกสาร ตัวหนาใหญ่ จัดกลาง
  sub: 2,       // บรรทัดรอง
  th: 3,        // หัวตาราง — หนา พื้นชมพู เส้นขอบ จัดกลาง
  td: 4,        // ช่องข้อความ มีเส้นขอบ ตัดคำ
  tdC: 5,       // ช่องข้อความ จัดกลาง
  num: 6,       // ตัวเลข #,##0.00 มีเส้นขอบ
  group: 7,     // แถวหัวข้อหมวด — หนา พื้นชมพูอ่อน
  totalLbl: 8,  // ป้ายยอดรวม หนา ชิดขวา
  totalNum: 9,  // ยอดรวม หนา
  note: 10,     // หมายเหตุ ตัวเล็ก ตัดคำ
} as const;

export type Cell = { v: string | number; s?: number };
export type Row = Cell[];

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="6">
<font><sz val="11"/><name val="Tahoma"/></font>
<font><b/><sz val="16"/><name val="Tahoma"/></font>
<font><sz val="10"/><color rgb="FF6D616A"/><name val="Tahoma"/></font>
<font><b/><sz val="10"/><color rgb="FFA8425A"/><name val="Tahoma"/></font>
<font><sz val="10"/><name val="Tahoma"/></font>
<font><b/><sz val="11"/><color rgb="FFA8425A"/><name val="Tahoma"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFAEDF0"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3F5"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFB0A8AC"/></left><right style="thin"><color rgb="FFB0A8AC"/></right><top style="thin"><color rgb="FFB0A8AC"/></top><bottom style="thin"><color rgb="FFB0A8AC"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
</styleSheet>`;

export type SheetSpec = {
  name: string;
  rows: Row[];
  /** ความกว้างคอลัมน์ (หน่วยตัวอักษร) เรียงจากคอลัมน์ 1 */
  widths?: number[];
  /** ผสานเซลล์ เช่น "A1:I1" */
  merges?: string[];
  /** ความสูงแถว (1-based) เช่น { 1: 26 } */
  heights?: Record<number, number>;
};

export function writeXlsx(sheets: SheetSpec[]): Buffer {
  const sheetXml = (sp: SheetSpec) => {
    const cols = sp.widths?.length
      ? `<cols>${sp.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : "";
    const rows = sp.rows.map((cells, r) => {
      const rn = r + 1;
      const h = sp.heights?.[rn];
      const body = cells.map((c, i) => {
        if (c == null) return "";
        const ref = `${colName(i + 1)}${rn}`;
        const s = c.s ? ` s="${c.s}"` : "";
        if (typeof c.v === "number") return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
        if (c.v === "") return `<c r="${ref}"${s}/>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
      }).join("");
      return `<row r="${rn}"${h ? ` ht="${h}" customHeight="1"` : ""}>${body}</row>`;
    }).join("");
    const merges = sp.merges?.length
      ? `<mergeCells count="${sp.merges.length}">${sp.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${cols}<sheetData>${rows}</sheetData>${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  };

  const files: { name: string; data: Buffer }[] = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`, "utf8"),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`, "utf8"),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`, "utf8"),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`, "utf8"),
    },
    { name: "xl/styles.xml", data: Buffer.from(STYLES, "utf8") },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(s), "utf8") })),
  ];

  return zip(files);
}
