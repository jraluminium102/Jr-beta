"use client";

/**
 * เครื่องคิดราคา 4.0 — คิดจาก "ต้นทุนจริง" (R4.0 cost engine)
 * ราคาขาย = ทุน × (1 + กำไร%) ปัดร้อย · แก้ราคาวัสดุที่เดียว ทุกรุ่นขยับตาม
 * engine/products/pricebook ก๊อปตรงจากแพ็คเกจส่งต่อ (ผ่าน verify 63/63) — ห้ามแก้ไฟล์ engine โดยไม่รัน scripts/verify-r40.mjs
 * แยกเอกเทศจากเครื่องคิดราคา R3.9 เดิม (/calculator) — ไม่แตะของเก่า
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht, sumDiscountLines, type DiscountLine } from "@/lib/money";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";

/** ตัวเลขจำนวน — ตัดทศนิยมเหลือ 2 ตำแหน่ง (จำนวนเส้นอลูเป็นทศนิยมได้ เช่น 1.22 เส้น) */
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
import type { Customer } from "@/lib/types";
// @ts-expect-error — engine เป็น ESM JS ล้วน (คงไฟล์เดิมเป๊ะเพื่อ parity 63/63)
import { computeCost } from "@/lib/calculator40/engine.mjs";
// @ts-expect-error — products เป็น ESM JS ล้วน
import { PRODUCTS, PRODUCTS_TODO } from "@/lib/calculator40/products.mjs";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";
import { applyPriceOverride, type PriceOverride } from "@/lib/calculator40/stock-link";
// ชั้นทับค่าสูตร (0134/หน้า /calculator40/link) — mutate PRODUCTS singleton ในที่ (ดูคอมเมนต์หัว line-overrides.ts)
import { applyOverridesInPlace, type LineOverride } from "@/lib/calculator40/line-overrides";
import OptionAdder from "@/components/quotation/OptionAdder";
import DiscountLinesEditor from "@/components/quotation/DiscountLinesEditor";
// @ts-expect-error — bootstrap เป็น ESM JS ล้วน (ก๊อปตรงจาก mockup index.html script ฝัง — ห้ามแก้กติกา)
import { applyBootstrap } from "@/lib/calculator40/bootstrap.mjs";
// @ts-expect-error — r39-data เป็นไฟล์ข้อมูล .json ที่ดึงจาก mockup (ราคาขาย R3.9 fallback)
import R39DATA from "@/lib/calculator40/r39-data.json";
// @ts-expect-error — mosquito helper เป็น ESM JS ล้วน
import { computeMosquitoR4, mosquitoTypeLabel } from "@/lib/calculator40/mosquito.mjs";
// ประตู/หน้าต่าง + พื้นล่าง — ใช้ตัวช่วยชุดเดียวกับห้องกระจก G6 (คำบนใบเสนอมีแหล่งเดียว)
import { isFixedPane, paneUseOf, quoteProductName, paneSill, SILL_OPTS, sillIsForm, noKindPrefix } from "@/lib/calculator40/room-desc";
import { computeRoofZipR4 } from "@/lib/calculator40/roof-zip.mjs";
import { withUniversalAddons } from "@/lib/calculator40/universal-addons";
import AddonsSection from "@/components/calculator40/AddonsSection";
import { ALU_COLOR_LABEL, resolveAluColor, aluColorKeysFor } from "@/lib/calculator40/alu-colors";
// กติกาจำนวนบานต่อรูปแบบ (เปิดคู่กลาง = 4/6 + คำอธิบายบนหน้าจอ) — ใช้ร่วมกับห้องกระจก
import { formRule, formNote, allowedPanes, snapPanes } from "@/lib/calculator40/form-rules";
// ชื่อสีในสโตร์ของสีที่เลือก — ส่งเข้า engine เพื่อหยิบ "ราคาเส้นตามสีจริงในสโตร์"
import { stockColorOfCalc } from "@/lib/calculator40/stock-link";
// อุปกรณ์ "ค่าของ" ดึงรายการจากใบตัดชุดเดียวกัน (รหัสสโตร์ตรงกับที่ช่างเบิกจริง)
import { cutHardwareLines, HANDLE_FIELDS, HW_FROM_CUTLIST } from "@/lib/calculator40/hardware-from-cutlist";
import { groupGlass, allGlassKeys } from "@/lib/calculator40/glass-cats";
import { computeServices, EMPTY_SERVICES, type ServiceInput } from "@/lib/calculator40/services";
import SubPanesSection, { subDesc, subPrice, type SubPane } from "@/components/calculator40/SubPanesSection";
import RoomComposer, { type RoomTotals } from "@/components/calculator40/RoomComposer";
import QuoteFormPreview, { type PreviewItem } from "@/components/calculator40/QuoteFormPreview";
import RoofSidesEditor, { parseSides, flattenSides, type RoofSidesValue } from "@/components/calculator40/RoofSidesEditor";
import { cutAluLines, cutRoofConsumLines, cutUncodedLines, multiRoofArea, ALU_FROM_CUTLIST } from "@/lib/calculator40/alu-from-cutlist";
import { cutInputFromRecipe } from "@/lib/cutlist/from-recipe";
import { RM } from "@/lib/calculator40/products.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

// bootstrap (fallback R3.9 products + auto-addons ต่อรุ่น G1/G2 + colorKeys) — รันครั้งเดียวตอนโหลดโมดูล
// idempotent ในตัว (applyBootstrap เช็ค PRODUCTS.__r39BootstrapApplied) กัน HMR/re-import ซ้ำพัง
applyBootstrap(PRODUCTS, R39DATA);

const GROUPS: { g: number; label: string }[] = [
  { g: 1, label: "G1 บาน" },
  { g: 2, label: "G2 ระแนง·รั้ว·ราว" },
  { g: 3, label: "G3 หลังคา·ฝ้า·ผนัง" },
  { g: 4, label: "G4 ตู้" },
  { g: 5, label: "G5 มุ้ง" },
  { g: 6, label: "G6 ห้องกระจก" },
  { g: 7, label: "G7 ม่านซิป" },
];

const COLOR_LABEL: Record<string, string> = {
  white: "อบขาว/ดำ", sahara: "เทาซาฮาร่า", special: "สีอบพิเศษ",
  woodSpecial: "ลายไม้อบพิเศษ", woodStock: "ลายไม้สต็อค",
};

// บรรทัดสีอลูฯ ในใบเสนอ — "อลูมิเนียม สี<ชื่อสีที่เลือก>" (เจ้าของสั่ง 18 ก.ค.2569 · เดิม "สีอลูมิเนียม: อบขาว")
// รวมไว้จุดเดียวเพราะสร้างข้อความนี้ 2 ที่ (ห้องกระจก + รายการปกติ) ต้องตรงกันเสมอ
const aluColorLine = (color: string): string =>
  `- อลูมิเนียม สี${ALU_COLOR_LABEL[color] ?? COLOR_LABEL[color] ?? color}`;

// คำใบเสนอกระจก (เจ้าของสั่ง 17 ก.ค.69): "เขียว 6มม." → "- กระจกเขียว หนา 6 มม." (ทุกชนิดใช้ฟอร์มเดียวกัน)
//   แทนความหนา "Nมม." เป็น "หนา N มม." แล้วนำหน้าด้วย "กระจก" · สร้าง 2 ที่ (ห้องกระจก + รายการปกติ) ต้องตรงกัน
const glassLine = (glassType: string): string => {
  const s = String(glassType ?? "").trim();
  if (!s) return "- กระจก —";
  // #1 (17ก.ค.69): แผ่นคอมโพสิต/ลูกฟูก แทนกระจก → ไม่ขึ้นคำว่า "กระจก" (ไม่คิดกระจกอยู่แล้ว)
  if (s === "แผ่นคอมโพสิต") return "- แผ่นคอมโพสิต แทนกระจก";
  if (s === "แผ่นลูกฟูก") return "- แผ่นอลูลูกฟูก แทนกระจก";
  if (s === 'เกล็ด Z 1"' || s === 'เกล็ด Z 1.6"') return "- " + s + " แทนกระจก";  // 21ก.ค.69: เกล็ด Z แทนกระจก (ราคาตามสีอลูหลัก)
  const withThk = s.replace(/\s*(\d+(?:\.\d+)?)\s*มม\.?/g, " หนา $1 มม.").replace(/\s+/g, " ").trim();
  return `- กระจก${withThk}`;
};

// สเปก label-only ที่เป็น "ค่ามาตรฐาน" → ไม่ต้องพิมพ์ลงใบ [specOpt key, ค่าที่จะซ่อน]
// เจ้าของสั่งซ่อนเพิ่มได้เรื่อย ๆ — เติมคู่ใหม่ที่นี่
const SKIP_SPEC_DETAIL: [string, string][] = [
  ["bottomrail", "รางกันน้ำ"], // รางกันน้ำ = ค่าปกติ · "รางเตี้ย (งานใน)" ยังพิมพ์
];

type QuoteItem = {
  key: number;
  name: string;
  desc: string;       // ขนาด/รูปแบบ/สี/กระจก
  qty: number;        // จำนวนชุด
  perUnit: number;    // ราคาขาย+ติดตั้ง/ชุด
  cost: number;       // ทุน/ชุด (ไว้ดูกำไรรวม)
  prodId?: string;    // (เฟส B) product_id → สถิติ
  groupLabel?: string;// (เฟส B) หมวด → สถิติ (ลง category)
  heading?: string;   // หัวข้อชุด (group_label 0076 เช่น "ห้องนอน 1") — passthrough กันหายตอนแก้ผ่านเครื่องคิด (QA HIGH-3)
  // "สูตร" (0093) — ทุก input ที่กดตอนคิดข้อนี้ → คลิก ✏️ โหลดกลับเข้าเครื่องคิดแก้ได้ · null = ข้อพิมพ์มือ/ใบเก่า/ค่าบริการ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recipe?: any;
};

type CustomerOption = Pick<Customer, "id" | "name" | "job" | "phone" | "address" | "contact_person">;

export default function Calculator40Client({ customers = [], priceOverride, lineOverrides }: { customers?: CustomerOption[]; priceOverride?: PriceOverride | null; lineOverrides?: LineOverride[] | null }) {
  // แก้ในหน้า /calculator40/link (รหัส/จำนวน) → ต้องมีผลจริงที่นี่ ไม่ใช่ dead code
  //   mutate PRODUCTS singleton ในที่ (เหมือน applyBootstrap ข้างบน) เพราะ PRODUCTS ถูกใช้ตรง ๆ
  //   กระจายอยู่หลายสิบจุดทั่วไฟล์นี้ — ไล่แก้ให้ทุกจุดถือ effProducts เสี่ยงเกินไป
  applyOverridesInPlace(PRODUCTS, lineOverrides, "calc");
  const router = useRouter();
  // ผูกลูกค้าจากทะเบียน (เฟส B)
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [bridgeJobId, setBridgeJobId] = useState<string | null>(null); // งานที่ส่งมาจากเช็คลิสต์ (ปุ่ม "สร้างในระบบ") → ผูกตอนออกใบเสนอ
  const [custQuery, setCustQuery] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const custRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (custRef.current && !custRef.current.contains(e.target as Node)) setCustOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // รับ "ลูกค้า+งาน" ที่ส่งมาจากเช็คลิสต์ (ปุ่ม "สร้างในระบบ" → มาที่เครื่องคิดราคา 4.0)
  // → เลือกลูกค้าให้อัตโนมัติ + จำ job_id ไว้ผูกตอนออกใบเสนอ (จับเฉพาะ bridge ที่ items ว่าง กัน payload ที่ calc เขียนเอง)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("jr_quote_items");
      if (!raw) return;
      const p = JSON.parse(raw) as { customer_id?: number | null; job_id?: string; items?: unknown[] };
      if (p && Array.isArray(p.items) && p.items.length === 0) {
        if (p.customer_id != null) setCustomerId(Number(p.customer_id));
        if (p.job_id) setBridgeJobId(String(p.job_id));
        sessionStorage.removeItem("jr_quote_items"); // consume แล้ว กันเด้งลูกค้าเก่าค้างครั้งถัดไป
      }
    } catch { /* ignore */ }
  }, []);
  // pricebook = โครงสร้าง/สูตร + ราคาจริงจากสต๊อก (ทับด้วย priceOverride ตอนโหลด → ลิงค์สดกับหน้า stock)
  // แก้ ⚙️ ในหน้า = in-memory ชั่วคราว (รีเฟรชกลับค่าสต๊อก) — แก้ราคาถาวรทำที่หน้า stock
  const [pb, setPb] = useState<any>(() => applyPriceOverride(JSON.parse(JSON.stringify(PRICEBOOK)), priceOverride));
  const [group, setGroup] = useState(1);
  const [prodId, setProdId] = useState<string>("sms_slide");
  // ตัวเลือกที่ส่งต่อเข้าใบตัด (มือจับ ยี่ห้อ/สี/ชนิด) — ชุดเดียวกับหน้าใบตัด ไม่แยกรายการกัน
  const [cutSel, setCutSel] = useState<Record<string, string>>(
    Object.fromEntries(HANDLE_FIELDS.map((f) => [f.key, f.def])));
  const [showCost, setShowCost] = useState(false);   // โหมดดูทุน/กำไร
  const [adminOpen, setAdminOpen] = useState(false); // แผงแก้ราคา
  const [linesOpen, setLinesOpen] = useState(false);
  const [howOpen, setHowOpen] = useState<string | null>(null);   // กางวิธีคิดก้อนไหนอยู่ (ค่าของ/ค่าผลิต/ค่าติดตั้ง)

  // อินพุตต่อรายการ
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [p, setP] = useState("");
  const [form, setForm] = useState<string>("");
  const [color, setColor] = useState("white");
  const [glassType, setGlassType] = useState<string>("");
  const [material, setMaterial] = useState<string>("");
  const [spec, setSpec] = useState<Record<string, string>>({});
  const [addons, setAddons] = useState<Record<string, any>>({});
  const [fixedPanes, setFixedPanes] = useState(0); // บานติดตาย (ไม่เลื่อน/ไม่เปิด) — ลด movePanes ของมุ้ง + ขึ้นใบ
  const [profit, setProfit] = useState("100");        // กำไรค่าวัสดุ % (ชื่อเดิม — เก็บลงสูตรของข้อ)
  const [profitProd, setProfitProd] = useState("100"); // กำไรค่าผลิต %
  const [profitInst, setProfitInst] = useState("200"); // กำไรค่าติดตั้ง %
  // โหมดกำไร: ค่าตั้งต้น = "ตามไฟล์ถอดทุน" (เป้ากำไรสุทธิ + ค่าดำเนินการ 30% · สูตรเดียวกับ Excel)
  //   กดแก้ % เอง = สลับเป็นโหมดกรอกเอง (ของเดิม) · เจ้าของสั่ง 3 ก.ย.69 "เอาตามไฟล์ ทำทั้งหมด"
  const [profitManual, setProfitManual] = useState(false);
  // ค่าแรงที่คิดลงใบเสนอ: "all" = ผลิต+ติดตั้ง (ค่ามาตรฐาน) · "mfg" = ค่าแรงผลิตอย่างเดียว (ขายส่ง JR ไม่ไปติดตั้ง)
  const [laborMode, setLaborMode] = useState<"all" | "mfg">("all");
  // ประตู/หน้าต่าง ที่จะเขียนลงใบเสนอ (เจ้าของสั่ง 7 ส.ค.69 ให้มีทุกชุดที่เป็นบาน ไม่ใช่แค่ห้องกระจก)
  //   "auto" = ให้ระบบเดาจากรุ่น/ความสูง · เลือกเองแล้วชนะการเดาเสมอ
  const [useSel, setUseSel] = useState<"auto" | "door" | "window">("auto");
  const [sillSel, setSillSel] = useState("");   // พื้นล่างประตู · "" = ใช้ค่าตั้งต้นตามรุ่น
  const [sets, setSets] = useState("1");
  // G4 ตู้: kindOpts (ประเภทตู้/ชนิดชั้น/กระจกหน้าบาน/สีหน้าบาน/เกรดกระจกชั้น ฯลฯ) — ตรง app.js calc() บรรทัด 217
  const [kind, setKind] = useState<Record<string, string>>({});
  const [faceColorCode, setFaceColorCode] = useState(""); // รหัสสีหน้าบานพิเศษ FT → ขึ้นใบ (opt.faceColorCode)
  const [depth, setDepth] = useState(""); // ความลึกตู้ (ม.) — เว้น = prod.defDepth
  const [shelves, setShelves] = useState(""); // จำนวนชั้น — เว้น = อัตโนมัติตามสูง
  const [cabSides, setCabSides] = useState<Record<string, { on: boolean; mat: string }>>({
    left: { on: true, mat: "alu" }, right: { on: true, mat: "alu" }, back: { on: false, mat: "alu" },
  });
  // G3 หลังคา: สีวัสดุมุง (label พิมพ์ลงใบ ไม่กระทบราคา) + หลังคาหลายช่วง (ขยัก · คิด computeCost ต่อช่วงจริง)
  const [sheetColor, setSheetColor] = useState("");
  const [roofSegs, setRoofSegs] = useState<{ w: number; h: number }[]>([]);
  // หลังคาหลายด้าน — เก็บเป็น array (ลบด้านกลางแล้วรอยต่อยุบตาม) แบนเป็นคีย์ side1W/joint1 ตอนคิดราคา
  const [roofSides, setRoofSides] = useState<RoofSidesValue>({ sides: [], joints: [] });
  // G1 ผสมบาน — เพิ่มบานหลายชนิดในชุดเดียว (คิดราคาตามชนิดจริง สี/กระจกตามบานหลัก) ตรง app.js SUB_GROUPS/renderSubPanes
  const [subs, setSubs] = useState<SubPane[]>([]);
  // G6 ห้องกระจก (composite) — RoomComposer คิดราคาเองทั้งก้อน (ผลรวมด้าน+ฝ้า+หลังคา) แล้ว callback กลับมาที่นี่
  const [roomTotals, setRoomTotals] = useState<RoomTotals | null>(null);
  const [g6HideSidePrice, setG6HideSidePrice] = useState(false); // ซ่อนราคารายด้านในใบเสนอ (G6)
  // G6 save/restore (0093): เก็บ state ห้องล่าสุดไว้ใส่สูตร + จุดตั้งต้นตอนโหลดสูตรกลับ (remount ด้วย roomSeed)
  const roomStateRef = useRef<any>(null);
  const [roomInitial, setRoomInitial] = useState<any>(null);
  const [roomSeed, setRoomSeed] = useState(0);

  // ใบเสนอราคาอย่างย่อ
  const [quote, setQuote] = useState<QuoteItem[]>([]);
  const [keySeq, setKeySeq] = useState(1);
  // เตือน "มีของยังไม่บันทึก" (เจ้าของสั่ง 25 ส.ค.69) — เทียบ quote ปัจจุบันกับ baseline (snapshot ล่าสุดที่ "ปลอดภัยแล้ว":
  //   โหลดใบเดิมมาแก้ / ล้างรายการ / ส่งออกใบเสนอสำเร็จ) + กันไว้อีกชั้นถ้ากำลังกรอกขนาด (w/h) ของข้อที่ยังไม่กด "เพิ่ม"
  //   ไม่รวม sessionStorage restore (?restore=1) — ตั้งใจให้ยัง dirty ต่อ กันเหนียวกรณีไม่ได้กดกลับมาจริง
  const quoteBaselineRef = useRef<string>("[]");
  // ข้อที่กำลังแก้ (คลิก ✏️ ในรายการ) — กด "อัปเดตข้อนี้" = แทนที่เดิม ตำแหน่งเดิม (0093)
  const [editingKey, setEditingKey] = useState<number | null>(null);
  // โหมดแก้ใบเสนอเดิม (?edit=<id>) — โหลดใบ+สูตรเข้ามา แก้ แล้วบันทึกกลับใบเดิม (เลือก Rev ได้)
  const [editingQ, setEditingQ] = useState<{ id: number; code: string; status: string; revision_no: number; revision_label: string } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [revAction, setRevAction] = useState<"none" | "rev" | "rev_keep">("none");
  const [revLabel, setRevLabel] = useState("Rev01");
  // ย้อนกลับจากใบเสนอราคามาแก้ (?restore=1) → คืนรายการที่ส่งไปล่าสุด
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("restore") !== "1") return;
    try {
      const raw = sessionStorage.getItem("jr_calc_quote");
      const arr = raw ? (JSON.parse(raw) as QuoteItem[]) : [];
      if (Array.isArray(arr) && arr.length) {
        setQuote(arr);
        setKeySeq(Math.max(1, ...arr.map((x) => Number(x.key) || 0)) + 1);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // โหมดแก้ใบเสนอเดิม (?edit=<id>) — โหลดใบ + รายการ + สูตร (calc_recipe) เข้าเครื่องคิด (0093)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qid = new URLSearchParams(window.location.search).get("edit");
    if (!qid) return;
    fetch(`/api/quotations/${qid}`)
      .then((r) => r.json())
      .then((json) => {
        const d = json?.data;
        if (!d?.id) return;
        const revNo = Number(d.revision_no) || 0;
        setEditingQ({ id: d.id, code: d.code, status: d.status, revision_no: revNo, revision_label: String(d.revision_label ?? "") });
        if (d.customer_id != null) setCustomerId(Number(d.customer_id));
        setQVat(Number(d.vat_rate) || 0);
        // ส่วนลด: จาก breakdown เดิม (0105) · ไม่มี = แปลงส่วนลดเดี่ยวเดิมเป็น 1 ข้อ
        setQDiscounts(Array.isArray(d.discounts) && d.discounts.length
          ? d.discounts
          : (Number(d.discount_amt) > 0 ? [{ label: String(d.discount_label ?? ""), amt: Number(d.discount_amt) }] : []));
        setQWht(Number(d.wht_rate) || 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const its = ((d.quotation_items ?? []) as any[]).slice().sort((a, b) => a.sort_order - b.sort_order);
        const loadedItems = its.map((it, i) => ({
          key: i + 1, name: it.name, desc: String(it.detail ?? ""), qty: Number(it.qty) || 1,
          perUnit: Number(it.unit_price) || 0, cost: 0,
          prodId: it.product_id || undefined, groupLabel: it.category || "",
          heading: it.group_label || "", // หัวข้อชุด (0076) — เก็บไว้ส่งกลับ ไม่ให้หายตอนเซฟ
          recipe: it.calc_recipe ?? null,
        }));
        setQuote(loadedItems);
        quoteBaselineRef.current = JSON.stringify(loadedItems); // โหลดใบเดิม = "ปลอดภัย" ยังไม่แก้ → ไม่เตือนจนกว่าจะแก้จริง
        setKeySeq(its.length + 1);
        setRevLabel(`Rev${String(revNo + 1).padStart(2, "0")}`);
        // ใบที่ส่งลูกค้าแล้ว → แนะนำนับ Rev (แก้หลังส่ง = ควรมีร่องรอย) · ร่าง → ทับเฉยๆ
        if (d.status === "sent" || d.status === "approved") setRevAction("rev");
      })
      .catch(() => { /* ผู้ใช้เห็นหน้าเปล่า + แก้ใหม่ได้ ไม่ต้อง crash */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ค่าบริการเพิ่มเติมทั้งใบ (นั่งร้าน/เดินทาง/ขนส่ง/ค่าไฟ/ความเสี่ยง/รื้อ) — พาริตี้ R3.9
  const [svc, setSvc] = useState<ServiceInput>(EMPTY_SERVICES);
  const [svcOpen, setSvcOpen] = useState(false);
  // footer ใบเสนอ (VAT/ส่วนลด/หัก ณ ที่จ่าย) — ให้พรีวิวฟอร์มจริงคิดยอดครบเหมือนใบพิมพ์
  const [qVat, setQVat] = useState(7);
  // ส่วนลดหลายรายการ (0105) — บาทเป็นตัวตั้งจริง (บัญชีสั่ง กัน round-trip drift)
  const [qDiscounts, setQDiscounts] = useState<DiscountLine[]>([]);
  const [qWht, setQWht] = useState(0);
  const [issueDate] = useState(() => new Date().toISOString().slice(0, 10));

  // dirty = มีรายการในใบที่ต่างจาก baseline (เพิ่ม/แก้/ลบข้อ ยังไม่ส่งออก) หรือกำลังกรอกขนาดข้อใหม่ (w/h) ที่ยังไม่กด "เพิ่ม"
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDirty(JSON.stringify(quote) !== quoteBaselineRef.current || w.trim() !== "" || h.trim() !== "");
  }, [quote, w, h]);
  useUnsavedWarning(dirty);

  // เพิ่ม add-on universal ที่ชั้น app (augment · ไม่แตะ products.mjs/verify-r40 · ไม่เลือก → computeAddon null = ราคาไม่ขยับ)
  //   - "งานไฟ"(elec) + "บานล่างทึบ"(solid_panel) ให้ทุกงาน (เจ้าของสั่ง 17ก.ค.69)
  //     ยกเว้นม่านซิป (sellZip) — ไม่เกี่ยวกับตัวม่าน (เจ้าของสั่ง 29ก.ค.69 · เอา "ออปชั่นใช้บ่อย" ออกจากม่านซิป)
  //   - "ม่านซิปบนหลังคา"(roof_zip) เฉพาะรุ่นหลังคา (roof/roof_gable/roof_slide)
  const prodRaw: any = (PRODUCTS as any)[prodId];
  const prod: any = withUniversalAddons(prodRaw);
  // pickerHide: true = รุ่นที่ไม่โผล่การ์ดแยกในลิสต์ (เข้าถึงผ่านกลไกอื่น เช่น roofShape switcher ของ "หลังคา"
  // หรือ screen_ready ที่ใช้เฉพาะภายใน computeMosquitoR4) — ตรง mockup app.js markActive()/renderList (กรอง p.pickerHide)
  const prodList = useMemo(
    () => Object.values(PRODUCTS as Record<string, any>).filter((x: any) => x && x.group === group && !x.pickerHide),
    [group]
  );
  const todoList = useMemo(
    () => ((PRODUCTS_TODO as any[]) || []).filter((t: any) => t.group === group),
    [group]
  );

  /** ค่ากำไรตั้งต้นของรุ่น — มาจากไฟล์ถอดทุน (บล็อก "⚙ ตั้งค่ากำไร" ท้ายชีตคิดทุน) */
  function defProfit(id: string) {
    const t = (pb as any)?.PROFIT ?? {};
    return t[id] ?? t.__default ?? { mat: 100, prod: 100, inst: 200 };
  }
  function pickProduct(x: any) {
    setProdId(x.id);
    const dp = defProfit(x.id);
    setProfit(String(dp.mat)); setProfitProd(String(dp.prod)); setProfitInst(String(dp.inst));
    setW(String(x.defaults?.w ?? 200));
    setH(String(x.defaults?.h ?? 200));
    setP(String(x.defaults?.p ?? 1));
    setForm(x.defForm ?? (x.forms?.[0] ?? ""));
    setColor("white");
    setGlassType(x.defGlass ?? (x.composite ? "เขียว 6มม." : ""));
    setMaterial(x.defMaterial ?? (x.materials?.[0] ?? ""));
    const s: Record<string, string> = {};
    (x.specOpts ?? []).forEach((o: any) => { s[o.key] = o.def ?? o.opts?.[0] ?? ""; });
    setSpec(s);
    setUseSel("auto"); setSillSel("");   // เปลี่ยนรุ่น → กลับไปให้ระบบเดา ประตู/หน้าต่าง + พื้นล่าง
    setAddons({}); // เปลี่ยนรุ่น → เคลียร์ของเสริม (ของเสริมผูกกับ addon id เฉพาะรุ่น)
    setFixedPanes(0);
    // G4 kindOpts default ต่อ key (ตรง defCfg ของ mockup)
    const k: Record<string, string> = {};
    (x.kindOpts ?? []).forEach((ko: any) => { k[ko.key] = ko.def ?? (ko.opts?.[0]?.[0] ?? ""); });
    setKind(k);
    setFaceColorCode("");
    setDepth("");
    setShelves("");
    setCabSides({ left: { on: true, mat: "alu" }, right: { on: true, mat: "alu" }, back: { on: false, mat: "alu" } });
    setSheetColor("");
    setRoofSegs([]);
    // หลังคาหลายด้าน → ตั้งด้านเริ่มต้นจาก specOpts ของรุ่น (แหล่งเดียวกับฝั่งใบตัด)
    setRoofSides(x.multiSide ? parseSides(s, x.multiSide, x.multiSide === "d" ? "ติดบ้าน" : "ชนผนัง") : { sides: [], joints: [] });
    setSubs([]); // เปลี่ยนรุ่น → เคลียร์บานย่อย (ผสมบานผูกกับบานหลักที่กำลังตั้งค่าอยู่)
  }

  // จำนวนบานเลื่อน/เปิดจริง (หักบานติดตาย) — ใช้เป็น default จำนวนบานมุ้ง (ตรง app.js c.p - c.fixedPanes)
  const movePanes = Math.max(1, (Number(p) || prod?.defaults?.p || 1) - (fixedPanes || 0));

  // ดัดจำนวนบานให้ตรงกติกาของรูปแบบที่เลือก (เปิดคู่กลาง = 4 หรือ 6 เท่านั้น)
  //   สลับมาเปิดคู่กลางตอนอยู่ 3 บาน → เด้งเป็น 4 ให้เลย ไม่ปล่อยให้คิดราคาแบบล้อ 0 ตัว
  useEffect(() => {
    if (!prod || !formRule(prod, form)?.panes?.length) return;
    const cur = Number(p) || prod.defaults?.p || 1;
    const snapped = snapPanes(prod, form, cur);
    if (snapped !== cur) setP(String(snapped));
  }, [prod, form, p]);

  // clamp บานติดตาย เมื่อจำนวนบานเปลี่ยน (ตรง app.js: fixedPanes = max(0, min(p-1, fixedPanes)))
  useEffect(() => {
    const pCount = Number(p) || prod?.defaults?.p || 1;
    setFixedPanes((v) => Math.max(0, Math.min(pCount - 1, v)));
  }, [p, prod]);

  // แก้ spec[key] ที่ค้างค่าเดิมเมื่อ optsByMaterial กรองตัวเลือกออกไปแล้ว (เช่น เปลี่ยนผ้ามุ้ง → สีที่เคยเลือกไม่มีในผ้าใหม่)
  // ตรง app.js ~1468: if (!opts.includes(c.spec[so.key])) c.spec[so.key] = def ?? opts[0]
  useEffect(() => {
    if (!prod?.specOpts?.length) return;
    setSpec((s) => {
      let changed = false;
      const next = { ...s };
      prod.specOpts.forEach((o: any) => {
        if (o.type === 'number') return;   // ช่องตัวเลข (เช่น ระยะ@) ไม่มี opts — ค่าเป็นตัวเลขอิสระ ไม่ต้อง normalize
        const opts: string[] = (o.optsByMaterial && o.optsByMaterial[material]) || o.opts;
        if (!opts) return;                  // กันพัง: specOpt ที่ไม่มี opts
        if (!opts.includes(next[o.key])) {
          next[o.key] = o.def && opts.includes(o.def) ? o.def : opts[0];
          changed = true;
        }
      });
      return changed ? next : s;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, prod]);

  // สีวัสดุมุงหลังคา (sheetColors) — auto เลือกสีแรกของวัสดุใหม่ ถ้าสีเดิมไม่มีในชุดสีของวัสดุนี้ ตรง app.js ~1251-1259
  const roofSheetColors: { n: string; dot: string }[] = useMemo(() => {
    if (!prod?.sheetColors || !material) return [];
    let sc = prod.sheetColors[material];
    if (typeof sc === "string") sc = (prod.sheetColorSets || {})[sc] || [];
    return sc || [];
  }, [prod, material]);
  useEffect(() => {
    if (!roofSheetColors.length) { setSheetColor(""); return; }
    if (!roofSheetColors.some((x) => x.n === sheetColor)) setSheetColor(roofSheetColors[0].n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofSheetColors]);

  // คิดราคาสด
  const result = useMemo(() => {
    if (!prod) return null;
    // ห้องกระจก (G6 composite) — คิดราคาผ่าน RoomComposer (ประกอบด้าน/ฝ้า/หลังคา ด้วย R4.0 cost-engine จริงต่อชิ้น)
    // RoomComposer callback (onTotal) → roomTotals · ที่นี่แค่ห่อผลลัพธ์ให้เข้ากับ shape { sell, cost } เดิมที่ UI ใช้ร่วม
    if (prod.composite) {
      if (!roomTotals || roomTotals.total <= 0) return { error: "กำลังตั้งค่าห้อง — ใส่ขนาด/เลือกชนิดบานอย่างน้อย 1 ด้านก่อน" } as any;
      return {
        input: { area: 0 }, aluKg: 0,
        sell: { beforeLabor: roomTotals.total, mfgOnly: roomTotals.total, mfgOnlyNet: roomTotals.total, withInstall: roomTotals.total },
        cost: { total: 0, alu: 0, bake: 0, openOven: 0, glass: 0, hardware: 0, consum: 0 },
        profit: 0, labor: { prod: 0, install: 0 }, lines: [],
        isRoom: true,
      } as any;
    }
    try {
      const wCm = Number(w) || prod.defaults?.w || 200;
      const hCm = Number(h) || prod.defaults?.h || 200;
      const pCount = Number(p) || prod.defaults?.p || 1;
      const formVal = form || prod.defForm;
      // หลังคาหลายด้าน: แบน sides[]/joints[] เป็นคีย์ side1W/side1P/joint1… ที่เครื่องคิด+ใบตัดใช้ร่วมกัน
      const specForCalc = prod.multiSide
        ? { ...spec, ...flattenSides(roofSides, prod.multiSide, prod.multiSide === "d" ? "ติดบ้าน" : "ชนผนัง") }
        : spec;
      // กำไรแยก 3 ส่วน ตามไฟล์ถอดทุน v9 (บล็อก "⚙ ตั้งค่ากำไร")
      // ⚠ ห้ามใช้ ||  — พิมพ์ 0% แล้ว 0||100 = 100 (กรอกกำไร 0 ไม่ได้ ราคาเด้งเป็น 2 เท่าเงียบ ๆ)
      //   เจอ 28 ส.ค.69: หลังคา/ระแนง 9 รุ่นตั้งกำไรค่าของ 0 ในตาราง แต่เว็บคิด 100 มาตลอด
      const mNum = Number(profit);
      const profitPct = Number.isFinite(mNum) && profit !== "" ? mNum : 100;   // ค่าวัสดุ — ชื่อเดิม ใช้กับสูตรเก่า (ระแนง/R3.9)
      const pProd = Number(profitProd) || 0;
      const pInst = Number(profitInst) || 0;
      // สีอลู: ผู้ใช้เลือก "ชื่อสีจริง" (13 สี) → แปลงเป็นหมวดค่าอบ (bake) สำหรับคิดราคา + ชื่อสีพิมพ์ลงใบ
      const rc = resolveAluColor(color);
      const opt: any = {
        w: wCm,
        h: hCm,
        p: pCount,
        form: formVal,
        color: rc.bake,
        colorName: rc.label,
        stockColor: stockColorOfCalc(color),   // สีจริงในสโตร์ (แยก อบขาว/ดำ ออกจากกัน)
        colorKey: color,                       // คีย์สีจริง → ราคาเส้นแยกสีจากไฟล์ถอดทุน (ALUCOLOR_KEY)
        profitPct,
        profitMat: profitPct, profitProd: pProd, profitInst: pInst,
        profitManual,   // false = ใช้เป้ากำไรจากไฟล์ (PB.SELL) · true = ใช้ % ที่กรอกเอง
        spec: specForCalc,
        addons,
      };
      // ── หลังคาหลายด้าน: เส้นอลู + แผ่นมุง + พื้นที่ ดึงจากเอนจินใบตัดตรง ๆ (ตรงกันโดยโครงสร้าง) ──
      if (ALU_FROM_CUTLIST[prod.id]) {
        const map = cutInputFromRecipe({
          kind: "std", prodId: prod.id, w: wCm, h: hCm, p: pCount, form: formVal,
          spec: specForCalc, material, color,
        }, { rawCompare: true });
        if (map) {
          const ci = map.input as Record<string, unknown>;
          const ar = multiRoofArea(prod.id, ci);           // พื้นที่รวมทุกด้าน (ตร.ม.)
          const al = cutAluLines({ prodId: prod.id, cutInput: ci });
          if (al?.length) opt.aluLines = al;
          const cl = cutRoofConsumLines({ prodId: prod.id, cutInput: ci, material: String(material || "ไวนิล"), rm: RM as never, planArea: ar });
          if (cl?.length) opt.consumLines = cl;
          // แถวใบตัดที่ไม่มีรหัสสโตร์ (ราง/เสารับ/ฉาก) — ของจริงที่ต้องจ่าย ห้ามหล่นหาย
          const un = cutUncodedLines({ prodId: prod.id, cutInput: ci });
          if (un?.length) opt.consumLines = [...(opt.consumLines ?? prod.consum ?? []), ...un];
          // หลังคาหลายด้าน: ส่งพื้นที่เสมอแม้เป็น 0 — ไม่งั้นตกไปใช้ กว้าง×สูง ที่ค้างในช่องที่ซ่อนไป
          if (ar > 0 || prod.multiSide) opt.areaOverride = ar;
        }
      }
      // อุปกรณ์จากใบตัด (รุ่นที่เปิดแล้ว) → engine ใช้แทนรายการเดิม + คิดราคาจากรหัสสโตร์
      const hwl = cutHardwareLines({ prodId: prod.id, w: wCm, h: hCm, p: pCount, form: formVal, spec, cut: cutSel });
      if (hwl?.length) opt.hardwareLines = hwl;
      // รุ่นเปิดผูกใบตัดแล้ว แต่ "รูปแบบ/จำนวนบานนี้" ไฟล์ยังไม่มีสูตรตัด (เช่น เปิดคู่กลาง ≠ 4 บาน
      //   ชีตใบตัดล็อก 4 บานตายตัว: ขวางบน = (W−35.3)/4) → คิดราคาได้ปกติ แต่ค่าของใช้รายการเดิม
      opt.hwNoCutSpec = HW_FROM_CUTLIST.has(prod.id) && !hwl?.length;
      if (glassType) opt.glassType = glassType;
      if (material) opt.material = material;
      // G4 kindOpts (ประเภทตู้/ชนิดชั้น/กระจกหน้าบาน/สีหน้าบาน/เกรดกระจกชั้น ฯลฯ) → engine อ่าน opt[key] ตรง ๆ ตรง app.js calc() บรรทัด 217
      (prod.kindOpts ?? []).forEach((ko: any) => { if (kind[ko.key] != null) opt[ko.key] = kind[ko.key]; });
      if (faceColorCode) opt.faceColorCode = faceColorCode; // รหัสสีหน้าบานพิเศษ FT → ขึ้นใบ (ไม่กระทบราคา)
      if (depth !== "") opt.depth = Number(depth) || undefined; // ความลึกตู้ (ม.) — เว้น = prod.defDepth
      if (shelves !== "") opt.shelves = Number(shelves) || undefined; // จำนวนชั้น — เว้น = อัตโนมัติตามสูง
      if (prod.sellCabinet && !prod.faceOnly) opt.cabSides = cabSides; // กั้นด้านตู้ ซ้าย/ขวา/หลัง (เฉพาะตู้เต็ม ไม่ใช่ฝาตู้อย่างเดียว)
      // มือจับดิจิตอล nc (บานเปิดยูโร +โช้ค 5,000) — engine อ่านจาก opt.digiNc ตรง ๆ (ไม่ใช่ opt.addons.dgNc) ตรง app.js A.dgNc
      if (addons?.dgNc) opt.digiNc = true;
      // จำนวนชุดมือจับ (cmech/stainless/digihandle) — เจ้าของเคาะ 24ส.ค.69 · engine อ่านจาก opt.handleQty ตรง ๆ (เว้น/1 = พฤติกรรมเดิม)
      if (addons?.handleQty > 1) opt.handleQty = addons.handleQty;
      // มุ้งบวกบาน R4.0 — คิดจากรุ่นมุ้งจริง (screen/screen_big/screen_ready) แล้วส่งเข้า opt.mosquitoR4
      // ตรง app.js ~232-235: computeMosquitoR4(c.addons||{}, {wCm,hCm,movePanes,form}, pb, profitPct, installProfitPct)
      const mqR4 = computeMosquitoR4(
        PRODUCTS,
        addons || {},
        { wCm, hCm, movePanes: Math.max(1, pCount - (fixedPanes || 0)), form: formVal },
        pb,
        profitPct,
        profitPct
      );
      if (mqR4) opt.mosquitoR4 = mqR4;
      // ม่านซิปบนหลังคา (Skylight 100/120) — คิดจากรุ่นม่านซิปจริง (computeCost) แล้วส่งเข้า opt.roofZipR4 (แบบ mosquito)
      const rzR4 = computeRoofZipR4(addons || {}, { wCm, hCm }, pb, profitPct);
      if (rzR4) opt.roofZipR4 = rzR4;
      // สีวัสดุมุงหลังคา (label พิมพ์ลงใบ ไม่กระทบราคา) — ตรง app.js calc() บรรทัด 212
      if (prod.sheetColors) { opt.sheetColor = sheetColor || ""; opt.roofMat = true; }
      const r = computeCost(pb, prod, opt);
      // รวม "รายการเสริม" (ผสมบาน G1 + หลังคาหลายช่วง G3) เข้า subLines/subSell/subCost เดียวกัน
      // ตรง app.js calc() บรรทัด 236-256: sl/sSell/sCost สะสมร่วมกัน ไม่แยก array คนละชุด
      const sl: { desc: string; amt: number }[] = [];
      let sSell = 0, sCost = 0;
      // ── ผสมบาน (G1) — คิดราคาตามชนิดจริง (สี/กระจกตามบานหลัก) ตรง app.js calc() บรรทัด 236-245 ──
      if (subs.length) {
        subs.forEach((s) => {
          const amt = subPrice(s, pb, color, glassType, profitPct);
          if (amt <= 0) return;
          sl.push({ desc: subDesc(s), amt });
          sSell += amt;
          sCost += Math.round(amt / (1 + (profitPct || 100) / 100)); // ทุนบานย่อย ≈ ถอดจาก markup ปัจจุบัน (ตรง app.js sellToCost)
        });
      }
      // ── หลังคาหลายช่วง (ขยัก) — เลิกใช้แล้ว (เจ้าของสั่งถอด 27 ส.ค.69) ──
      //   คิดแต่ละช่วงเป็นหลังคาเดี่ยวเต็มใบแล้วบวกกัน → กล่อง 4×4 ตัวขอบ/ตะเข้ ไม่เคยถูกคิดเงิน
      //   ทรงหักมุมให้ใช้ "กันสาดหลายด้าน / กลาสเฮ้าส์หลายด้าน / จั่วหลายด้าน" แทน (ดึงของจากใบตัดจริง)
      //   ⚠ เก็บทางคิดไว้ให้ "ใบเสนอเก่า" ที่บันทึก roofSegs ไว้แล้ว เปิดกลับมาต้องได้ราคาเท่าเดิม
      //     (ไม่ผูก prod.roofSegments แล้ว เพราะถอดธงออกจากรุ่นหลังคาไปแล้ว)
      if (roofSegs.length) {
        roofSegs.forEach((sg, i) => {
          const sw = (+sg.w || 0) * 100, sh = (+sg.h || 0) * 100;
          if (!(sw > 0 && sh > 0)) return;
          const sr: any = computeCost(pb, prod, {
            w: sw, h: sh, p: 1, form: formVal, material, color: rc.bake, stockColor: stockColorOfCalc(color), colorKey: color, addons: {}, profitPct, installProfitPct: profitPct,
          });
          const sAmt = laborMode === "mfg" ? sr.sell.mfgOnlyNet : sr.sell.withInstall;   // ขายส่ง = ราคาหลังลด
          sl.push({ desc: `หลังคาช่วง ${i + 2} (${sg.w || 0}×${sg.h || 0}ม. · ${material})`, amt: sAmt });
          sSell += sAmt;
          sCost += sr.cost.total;
        });
      }
      if (sl.length) {
        (r as any).subLines = sl;
        (r as any).subSell = sSell;
        (r as any).subCost = sCost;
      }
      return r;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) } as any;
    }
  }, [pb, prod, w, h, p, form, color, glassType, material, spec, profit, profitProd, profitInst, addons, fixedPanes, kind, faceColorCode, depth, shelves, cabSides, sheetColor, roofSegs, subs, roomTotals, laborMode, cutSel]);

  const ok = result && !("error" in result);
  // ── ประตู/หน้าต่าง (เจ้าของสั่ง 7 ส.ค.69 ให้มีทุกชุดที่เป็นบาน) ─────────────
  //   โชว์เฉพาะกลุ่มบาน (G1) ที่ไม่ใช่กระจกติดตายเสมอ · ห้องกระจกมีตัวเลือกของตัวเองต่อบานอยู่แล้ว
  const paneKindOn = !!prod && prod.group === 1 && !prod.composite && !isFixedPane(prod.id) && !noKindPrefix(prod.id);
  //   ไม่เลือก = เดาจากรุ่น/ความสูง (ซม.) · เลือกเองชนะการเดาเสมอ
  //   ไม่เลือก = ค่าตั้งต้นตามชนิดรุ่น · ⚠ ไม่ดูขนาดเลย (เจ้าของสั่ง — หน้าต่างบางอันก็สูง)
  const paneKind = paneKindOn ? paneUseOf(prod.id, useSel === "auto" ? undefined : useSel) : "fixed";
  // #1 (17ก.ค.69): เพิ่มตัวเลือก "แผ่นคอมโพสิต/ลูกฟูก แทนกระจก" ทุกที่ที่เลือกกระจก · engine special-case (ไม่คิดกระจก)
  const glassKeys = useMemo(() => allGlassKeys(pb), [pb]);

  // "สูตร" ของข้อปัจจุบัน (0093) — เก็บทุก input เพื่อโหลดกลับมาแก้ทีหลัง (คลิก ✏️ ในรายการ)
  function buildRecipe(): any {
    if (!prod) return null;
    if (prod.composite) {
      return {
        v: 1, kind: "room", prodId: prod.id, group: prod.group,
        color, glassType, profit, g6HideSidePrice,
        room: roomStateRef.current ?? null, // state ทั้งห้อง (ด้าน/ช่อง/บาน/หลังคา/ฝ้า/พื้น ฯลฯ) จาก RoomComposer
      };
    }
    return {
      v: 1, kind: "std", prodId: prod.id, group: prod.group,
      w, h, p, form, color, glassType, material,
      spec, addons, fixedPanes, profit, profitProd, profitInst, laborMode, useSel, sillSel, cutSel,
      kindOpts: kind, faceColorCode, depth, shelves, cabSides, sheetColor, roofSegs, subs,
    };
  }

  // เพิ่มข้อใหม่ หรือ (ถ้ากำลังแก้ ✏️) แทนที่ข้อเดิม ตำแหน่งเดิม key เดิม
  // ถ้าข้อที่กำลังแก้ถูกลบไปแล้ว (เช่น ลบผ่านฟอร์มพรีวิว) → ต่อท้ายแทน ไม่หายเงียบ (QA HIGH-1)
  function pushQuoteItem(item: Omit<QuoteItem, "key">) {
    if (editingKey != null) {
      const stillThere = quote.some((x) => x.key === editingKey);
      if (stillThere) {
        setQuote((q) => q.map((x) => (x.key === editingKey ? { ...item, key: editingKey } : x)));
      } else {
        setQuote((q) => [...q, { ...item, key: keySeq }]);
        setKeySeq((k) => k + 1);
      }
      setEditingKey(null);
    } else {
      setQuote((q) => [...q, { ...item, key: keySeq }]);
      setKeySeq((k) => k + 1);
    }
  }

  function addToQuote() {
    if (!ok || !prod) return;
    const n = Math.max(1, Number(sets) || 1);
    // ห้องกระจก (G6 composite) — RoomComposer คิดราคารวมทั้งก้อนแล้ว ขึ้นใบเป็นรายการเดียว (แยกรายด้าน/ฝ้า/หลังคาอยู่ในหน้าสรุปของ composer)
    if (prod.composite) {
      const rt = roomTotals!;
      // โครงเหมือน G1: "งานรายด้าน/หลังคา/ฝ้า" เป็นบุลเล็ตหลักก่อน → แล้วหัว "รายละเอียดงาน" = สี/กระจก (สเปค)
      const dd = rt.sideDescs ?? [];
      const showP = !g6HideSidePrice; // ปุ่มซ่อนราคารายด้าน
      // ไม่ใส่ ":" หลังชื่อด้าน — เจ้าของสั่ง 7 ส.ค.69 ให้เว้นวรรคแทน
      const lines: string[] = rt.sides.map((s, i) => `- ด้าน ${String.fromCharCode(65 + i)} ${dd[i] || "—"}${showP && s > 0 ? ` (ราคา ${baht(s)}฿)` : ""}`);
      if (rt.roof > 0) lines.push(`- ${rt.roofDesc || "หลังคา"}${showP ? ` (${baht(rt.roof)}฿)` : ""}`);
      if (rt.ceil > 0) lines.push(`- ${rt.ceilDesc || "ฝ้า"}${showP ? ` (${baht(rt.ceil)}฿)` : ""}`);
      if (rt.floor > 0) lines.push(`- พื้น${showP ? ` (${baht(rt.floor)}฿)` : ""}`);
      if (rt.fan > 0) lines.push(`- พัดลม/ระบายอากาศ${showP ? ` (${baht(rt.fan)}฿)` : ""}`);
      if (rt.services > 0) lines.push(`- งานบริการเพิ่มเติม${showP ? ` (${baht(rt.services)}฿)` : ""}`);
      if (rt.svc > 0) lines.push(`- รื้อ/ป้องกันหน้างาน${showP ? ` (${baht(rt.svc)}฿)` : ""}`);
      lines.push("รายละเอียดงาน");
      lines.push(aluColorLine(color));
      lines.push(glassLine(glassType));
      (rt.specLines ?? []).forEach((s) => lines.push(`- ${s}`)); // มุ้ง / หลังคา / รางน้ำ ฯลฯ
      pushQuoteItem({
        name: prod.name,
        desc: lines.join("\n"),
        qty: n, perUnit: rt.total, cost: 0,
        prodId: prod.id, groupLabel: "ห้องกระจก",
        recipe: buildRecipe(),
      });
      return;
    }
    // subLines (ผสมบาน G1 + หลังคาหลายช่วง G3) — บวกรวมเข้ายอด/ทุน ของรายการเดียวกัน ตรง app.js (แยกจาก main แต่ไม่แยกบรรทัดในใบย่อยนี้)
    const subSell = (result as any).subSell || 0;
    const subCost = (result as any).subCost || 0;
    const subDescs: string[] = ((result as any).subLines || []).map((l: any) => l.desc);
    // ── รูปแบบรายละเอียดแบบเครื่องเดิม R3.9: ชื่อ+รูปแบบ+ขนาด(ม.) เป็นหัว · บุลเล็ตออปชั่น · "รายละเอียดงาน" + สี/กระจก ──
    const fmtM = (cm: number) => (Math.round(cm) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
    const nBan = Number(p) || prod.defaults?.p || 1;
    // ชนิดมุ้งที่เลือก → ขึ้นในชื่อ "(มีมุ้ง...)" + รายละเอียดงาน (ผ้ามุ้ง) · ชื่อชนิดใช้แหล่งเดียวกับ G6 (mosquitoTypeLabel)
    const mqType = mosquitoTypeLabel((addons as any)?.mosquito);
    // ชื่อบรรยาย: prod.saleName (แทน {form} = รูปแบบที่เลือก) · ไม่มี → ชื่อรุ่นเดิม + (รูปแบบ)
    const baseName: string = prod.saleName
      ? String(prod.saleName).replace(/\{form\}/g, form || "")
      : `${prod.name}` + (prod.forms?.length && form && !/^(อิสระ|มาตรฐาน|std)$/.test(form) ? ` (${form})` : "");
    // ประตู/หน้าต่าง — คำนำหน้าชื่อ + พื้นล่าง (เฉพาะประตู) · แหล่งคำเดียวกับห้องกระจก
    //   รุ่นที่มี saleName เขียนชื่อขายไว้เองแล้ว (ตู้/ม่านซิป/ของสำเร็จ) ไม่ต้องเติมคำนำหน้า
    // ใช้กับทุกรุ่น (รวมที่มี saleName) — quoteProductName ตัดคำนำหน้าเดิมทิ้งให้แล้ว
    const nameWithKind = paneKindOn ? quoteProductName(prod.id, paneKind, baseName) : baseName;
    const itemName = nameWithKind
      + (nBan > 1 ? ` แบ่ง ${nBan} บาน` : "")
      // รุ่นที่ "รูปแบบ" คือธรณีอยู่แล้ว (บานเปิด/หมุน/โซลิด) ไม่ต้องขึ้นพื้นล่างซ้ำอีกวงเล็บ
      + (paneKindOn && paneKind === "door" && !sillIsForm(prod.id) ? ` (${paneSill({ typeKey: prod.id, w: 0, h: 0, n: 1, sill: sillSel || undefined })})` : "")
      + (mqType ? ` (มีมุ้ง${mqType})` : "")
      + ` (${fmtM(Number(w) || prod.defaults?.w || 0)} × ${fmtM(Number(h) || prod.defaults?.h || 0)} ม.)`;
    // ── "รายการ" (บน · บุลเล็ตงานที่ทำ) ──────────────────────────────────────
    // ทุก option ที่ผู้ใช้เลือก "และคิดเงินแล้ว" ต้องขึ้นในใบ (ตรงโจทย์เจ้าของ)
    // - subDescs = ผสมบาน G1 / หลังคาหลายช่วง G3 (เดิม)
    // - บานติดตาย · addon (มุ้ง/มือจับ/โช้ค/มอเตอร์/รางน้ำ/ครอบวงกบ ฯลฯ จาก result.lines)
    // - รุ่น override (ตู้ G4 / ม่านซิป G7 / ของขายตรง/R3.9) engine แทน lines เป็นคำอธิบายลูกค้าแล้ว → ดึงทั้งชุด
    const workLines = subDescs.map((d) => `- ${d}`);
    // บานติดตาย (ไม่เลื่อน/ไม่เปิด) — ขึ้นใบ (เดิมคิด movePanes แต่ไม่พิมพ์)
    if ((fixedPanes || 0) > 0) {
      const isOpen = /เปิด|เฟี้ยม|กระทุ้ง|หมุน|ยก|ประตู|PC|Velora/i.test(prod.name || "");
      // เคสพิเศษ ติดตาย 1 + เลื่อน 1 (เจ้าของสั่ง 18 ก.ค.2569): ลูกค้าเข้าใจง่ายกว่าคำว่า "บานติดตาย N บาน"
      if (!isOpen && fixedPanes === 1 && movePanes === 1) {
        workLines.push("- หน้าต่างบานเลื่อน พร้อมกระจกติดตายด้านข้าง");
      } else {
        workLines.push(`- บานติดตาย ${fixedPanes} บาน (ที่เหลือ ${movePanes} บาน${isOpen ? "เปิด" : "เลื่อน"})`);
      }
    }
    // ดึงบรรทัดออปชั่นจาก engine (คิดเงินแล้ว) — normal: เฉพาะ addon · override: ทั้งหมด (ยกเว้น warn/ค่าแรง)
    const isOverride = !!(prod.sellCabinet || prod.sellZip || prod.sellR39 || prod.sellDirect);
    const cleanTag = (s: string) => String(s ?? "").replace(/\s*\((?:R3\.9|R4\.0)\)\s*$/, "").trim();
    // มุ้ง — ย้ายไปเขียนใน "รายละเอียดงาน" (พร้อมผ้ามุ้ง/ชนิด) + ขึ้นในชื่อ "(มีมุ้ง...)" · ไม่ซ้ำเป็นบุลเล็ตงาน
    const mqLineObj = ((result as any).lines || []).find((l: any) => l?.cat === "addon" && /^(มุ้ง|ม่าน)/.test(l.name || ""));
    const mqDetail = mqLineObj ? cleanTag(mqLineObj.name) : "";
    ((result as any).lines || []).forEach((l: any) => {
      if (!l || !l.name || l.cat === "warn" || l.cat === "labor") return;
      if (l.cat === "addon" && /^(มุ้ง|ม่าน)/.test(l.name)) return; // มุ้ง จัดการแยก (ชื่อ + รายละเอียดงาน)
      if (isOverride || l.cat === "addon") workLines.push(`- ${cleanTag(l.name)}`);
    });
    // specOpts ที่ผู้ใช้เลือกทุกตัว (รวมค่า default = สเปกที่ลูกค้าควรเห็น) → priced เข้า "รายการ" · label-only เข้า "รายละเอียดงาน"
    // ยกเว้น type:'number' (ช่องกรอกราคาเอง ฿/ตร.ม. — ไม่ใช่ option ลูกค้า · ไปเป็นบรรทัดราคาแล้ว)
    const specDetailLines: string[] = [];
    (prod.specOpts ?? []).forEach((o: any) => {
      if (o.type === "number") return;
      const v = spec[o.key];
      if (v == null || v === "") return;
      // ค่ามาตรฐานที่ "เป็นค่าปกติอยู่แล้ว" ไม่ต้องพิมพ์ลงใบ (เจ้าของสั่ง 18 ก.ค.2569)
      //   ราง: รางกันน้ำ = ค่ามาตรฐาน ไม่ต้องขึ้น · แต่ "รางเตี้ย (งานใน)" ยังต้องขึ้น (งานในต้องระบุ)
      //   เติมคู่ [key, value] ใหม่ที่นี่ได้เรื่อย ๆ ถ้าเจ้าของสั่งซ่อนค่าอื่น
      if (SKIP_SPEC_DETAIL.some(([k, val]) => k === o.key && val === v)) return;
      // ฟิลด์ "[สลับ]" ใช้เฉพาะระแนงสลับ — ไม่ใช่ระแนงผสมแล้วยังพิมพ์ลงใบ = ลูกค้าอ่านแล้วงง (และสูตรก็ไม่ได้คิดเงินให้)
      const isAlt = typeof o.label === "string" && o.label.startsWith("[สลับ]");
      if (isAlt && spec.gslat !== "ระแนงสลับ") return;
      const lb = String(o.label).replace(/^\[สลับ\]\s*/, "");   // ป้าย [สลับ] เป็นของหลังบ้าน ไม่ต้องพิมพ์ให้ลูกค้าเห็น
      const vt = o.labels?.[v] ?? v;                            // โชว์หน่วยตามที่ตั้งไว้ (กล่อง 1×1.6″ · 1×5 ซม.) ไม่ใช่คีย์ดิบ
      if (o.priced) workLines.push(`- ${lb}: ${vt}`);
      else specDetailLines.push(`- ${lb}: ${vt}`);
    });
    // ── "รายละเอียดงาน" (ล่าง · คุณสมบัติวัสดุ/ผิว) ──
    const jobLines = [aluColorLine(color)];
    if (glassType) jobLines.push(glassLine(glassType));
    if (material) jobLines.push(`- วัสดุ: ${prod.materialLabels?.[material] ?? material}`);
    if (sheetColor) jobLines.push(`- วัสดุมุง: ${sheetColor}`);
    if (mqDetail) jobLines.push(`- ${mqDetail}`); // มุ้ง + ผ้ามุ้ง (ตามที่เลือก)
    specDetailLines.forEach((l) => jobLines.push(l));
    // ขายส่ง (ไม่ไปติดตั้ง) — ต้องเขียนลงใบให้ชัด ไม่งั้นลูกค้าเข้าใจว่ารวมติดตั้ง
    if (laborMode === "mfg") jobLines.push("- ราคานี้ไม่รวมค่าติดตั้ง (ส่งของอย่างเดียว)");
    const desc = [...workLines, "รายละเอียดงาน", ...jobLines].join("\n");
    pushQuoteItem({
      name: itemName, desc, qty: n,
      perUnit: (laborMode === "mfg" ? result.sell.mfgOnlyNet : result.sell.withInstall) + subSell, cost: result.cost.total + subCost,
      prodId: prod.id, groupLabel: GROUPS.find((g) => g.g === prod.group)?.label ?? "",
      recipe: buildRecipe(),
    });
  }

  // ── (0093) แก้/ก็อป/เลื่อน ข้อในรายการ ──────────────────────────────────
  // ✏️ โหลดสูตรของข้อกลับเข้าเครื่องคิด (ขนาด/รูปแบบ/สี/กระจก/option ที่บันทึกไว้) → แก้ → "อัปเดตข้อนี้"
  function editQuoteItem(it: QuoteItem) {
    const r = it.recipe;
    const px = r ? (PRODUCTS as any)[r.prodId] : null;
    if (!r || !px) return; // ไม่มีสูตร (ข้อพิมพ์มือ/ใบเก่า/ค่าบริการ) — แก้ข้อความในฟอร์มขวาได้อย่างเดียว
    setGroup(px.group ?? r.group ?? 1);
    setProdId(r.prodId);
    setSets(String(it.qty || 1));
    setColor(r.color ?? "white");
    setGlassType(r.glassType ?? (px.defGlass ?? ""));
    setProfit(String(r.profit ?? "100"));
    // ใบเก่าไม่มี 2 ช่องนี้ → ใช้กำไรเดิมทั้งก้อน (ผลเท่าของเดิมเป๊ะ)
    setProfitProd(String(r.profitProd ?? r.profit ?? "100"));
    setProfitInst(String(r.profitInst ?? r.profit ?? "200"));
    setLaborMode(r.laborMode === "mfg" ? "mfg" : "all");   // ใบเก่าไม่มีฟิลด์นี้ = คิดค่าแรงรวม (ค่าเดิมของระบบ)
    setUseSel(r.useSel === "door" || r.useSel === "window" ? r.useSel : "auto");  // ใบเก่า = ให้ระบบเดาเหมือนเดิม
    setSillSel(typeof r.sillSel === "string" ? r.sillSel : "");
    // ตัวเลือกมือจับ (ยี่ห้อ/สี/ชนิด) — ใบเก่าไม่มี = ใช้ค่าตั้งต้น (ผลเท่าเดิม)
    setCutSel({ ...Object.fromEntries(HANDLE_FIELDS.map((f) => [f.key, f.def])), ...(r.cutSel ?? {}) });
    if (r.kind === "room") {
      setG6HideSidePrice(!!r.g6HideSidePrice);
      setRoomInitial(r.room ?? null);
      setRoomSeed((s) => s + 1); // remount RoomComposer ด้วย state ที่บันทึกไว้
    } else {
      setW(String(r.w ?? px.defaults?.w ?? ""));
      setH(String(r.h ?? px.defaults?.h ?? ""));
      setP(String(r.p ?? px.defaults?.p ?? 1));
      setForm(r.form ?? px.defForm ?? "");
      setMaterial(r.material ?? px.defMaterial ?? (px.materials?.[0] ?? ""));
      setSpec(r.spec ?? {});
      setAddons(r.addons ?? {});
      setFixedPanes(Number(r.fixedPanes) || 0);
      setKind(r.kindOpts ?? {});
      setFaceColorCode(r.faceColorCode ?? "");
      setDepth(String(r.depth ?? ""));
      setShelves(String(r.shelves ?? ""));
      setCabSides(r.cabSides ?? { left: { on: true, mat: "alu" }, right: { on: true, mat: "alu" }, back: { on: false, mat: "alu" } });
      setSheetColor(r.sheetColor ?? "");
      setRoofSegs(Array.isArray(r.roofSegs) ? r.roofSegs : []);
      setSubs(Array.isArray(r.subs) ? r.subs : []);
    }
    setEditingKey(it.key);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // 📋 ก็อปข้อ (พร้อมสูตร) แทรกถัดจากต้นฉบับ — งานคล้ายๆ ก็อปแล้วกด ✏️ ปรับนิดหน่อย
  function copyQuoteItem(key: number) {
    setQuote((q) => {
      const i = q.findIndex((x) => x.key === key);
      if (i < 0) return q;
      const arr = [...q];
      arr.splice(i + 1, 0, { ...q[i], key: keySeq });
      return arr;
    });
    setKeySeq((k) => k + 1);
  }
  // ⬆⬇ เลื่อนข้ออิสระ
  function moveQuoteItem(key: number, dir: -1 | 1) {
    setQuote((q) => {
      const i = q.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= q.length) return q;
      const arr = [...q];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }
  function cancelEditItem() { setEditingKey(null); }

  // บันทึกกลับใบเดิม (?edit=) — PATCH ใบเดิม + เลือก Rev (guard ฝั่ง server: มีบิล active = 409 ให้ยกเลิกบิลก่อน)
  async function saveBackToQuotation() {
    if (!editingQ || quote.length === 0) return;
    setSaveBusy(true);
    setSaveErr("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = quote.map((it, i) => ({
      name: it.name, detail: it.desc, qty: it.qty, unit_price: it.perUnit,
      sort_order: i, category: it.groupLabel ?? "", product_id: it.prodId ?? "",
      group_label: it.heading ?? "", // หัวข้อชุด (0076) — ส่งกลับครบ ไม่หาย (QA HIGH-3)
      calc_recipe: it.recipe ?? null,
    }));
    // ค่าบริการที่ตั้งเพิ่มในหน้านี้ (svc panel) — ต่อท้าย (ค่าบริการเดิมของใบอยู่ใน quote แล้วตอนโหลด)
    svcResult.lines.filter((l) => l.amount > 0).forEach((l) => {
      items.push({ name: l.name, detail: "", qty: 1, unit_price: l.amount, sort_order: items.length, category: "ค่าบริการ", product_id: "", group_label: "", calc_recipe: null });
    });
    try {
      const res = await fetch(`/api/quotations/${editingQ.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items, vat_rate: qVat, wht_rate: qWht,
          discounts: qDiscounts,   // ส่วนลดหลายรายการ (0105) — server รวมเป็น discount_amt เดียว
          ...(revAction !== "none" ? { revision_action: revAction, revision_label: revLabel.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) { quoteBaselineRef.current = JSON.stringify(quote); router.push(`/quotations/${editingQ.id}`); return; }
      setSaveErr(json?.error ?? `บันทึกไม่สำเร็จ (${res.status})`);
    } catch {
      setSaveErr("เชื่อมต่อไม่สำเร็จ — ลองอีกครั้ง");
    } finally {
      setSaveBusy(false);
    }
  }

  // ── เฟส B: ผูกลูกค้า + ส่งออกใบเสนอราคาจริง (ตรง flow เครื่องเดิม → /quotations/new?from=calc) ──
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const custFiltered = custQuery.trim()
    ? customers.filter((c) => {
        const q = custQuery.trim().toLowerCase();
        const last4 = (c.phone ?? "").replace(/\D/g, "").slice(-4);
        return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q) || last4.includes(q) || (c.address ?? "").toLowerCase().includes(q);
      })
    : customers;

  function sendToQuotation() {
    if (quote.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = quote.map((it) => ({
      name: it.name,
      detail: it.desc,
      qty: it.qty,
      unit_price: it.perUnit,
      category: it.groupLabel ?? "",
      product_id: it.prodId ?? "",
      calc_recipe: it.recipe ?? null, // สูตร (0093) → เก็บลงใบ เพื่อกลับมาแก้ในเครื่องคิดได้
    }));
    // ค่าบริการเพิ่มเติม → ต่อท้ายเป็นบรรทัดในใบเสนอราคา (เฉพาะที่ > 0)
    svcResult.lines.filter((l) => l.amount > 0).forEach((l) => {
      items.push({ name: l.name, detail: "", qty: 1, unit_price: l.amount, category: "ค่าบริการ", product_id: "", calc_recipe: null });
    });
    const payload = {
      items,
      customer: selectedCustomer?.name ?? "",
      customer_id: customerId,
      ...(qDiscounts.length ? { discounts: qDiscounts } : {}), // ส่วนลดหลายรายการ (0105) — ยกไปใบใหม่ด้วย
      ...(bridgeJobId ? { job_id: bridgeJobId } : {}), // ผูกงานที่ส่งมาจากเช็คลิสต์ (ถ้ามี)
    };
    try {
      sessionStorage.setItem("jr_quote_items", JSON.stringify(payload));
      sessionStorage.setItem("jr_calc_quote", JSON.stringify(quote)); // เก็บไว้ให้ย้อนกลับมาแก้ในเครื่องคิดราคาได้
    } catch { /* ignore */ }
    quoteBaselineRef.current = JSON.stringify(quote); // ส่งออกแล้ว (อยู่ใน sessionStorage แล้ว) — เลิกเตือน
    router.push("/quotations/new?from=calc");
  }

  const quoteTotal = quote.reduce((s, it) => s + it.perUnit * it.qty, 0);
  const quoteCost = quote.reduce((s, it) => s + it.cost * it.qty, 0);
  const svcResult = useMemo(() => computeServices(svc, quoteTotal), [svc, quoteTotal]);
  const grandTotal = quoteTotal + svcResult.total;

  // ── พรีวิว "ฟอร์มใบเสนอราคาจริง" (A4) — รายการสินค้า (แก้ inline) + ค่าบริการ (ล็อก) ──
  // ไม่ใส่ groupLabel ในพรีวิว — ชื่อกลุ่มภายใน (G1 บาน ฯลฯ) ไม่ต้องโผล่หัวข้อในใบให้ลูกค้า
  // (หมวดยังส่งไปสถิติผ่าน it.groupLabel ตอนออกใบเสนอราคาเหมือนเดิม)
  const previewItems: PreviewItem[] = [
    ...quote.map((it) => ({ key: it.key, name: it.name, detail: it.desc, qty: it.qty, unitPrice: it.perUnit })),
    ...svcResult.lines.filter((l) => l.amount > 0).map((l, i) => ({
      key: -(i + 1), name: l.name, detail: "", qty: 1, unitPrice: l.amount, locked: true,
    })),
  ];
  // ยอดก่อนส่วนลด (ฐานคิด % ของแต่ละข้อ)
  const previewSubtotal = previewItems.reduce((s, it) => s + (it.qty || 0) * (it.unitPrice || 0), 0);
  const discountBaht = sumDiscountLines(previewSubtotal, qDiscounts);   // ยอดรวมส่วนลดทุกข้อ
  function editPreviewItem(key: number, patch: Partial<PreviewItem>) {
    if (key < 0) return; // ค่าบริการ (แก้ที่แผงค่าบริการ)
    setQuote((q) => q.map((x) => x.key === key ? {
      ...x,
      ...(patch.name != null ? { name: patch.name } : {}),
      ...(patch.detail != null ? { desc: patch.detail } : {}),
      ...(patch.qty != null ? { qty: patch.qty } : {}),
      ...(patch.unitPrice != null ? { perUnit: patch.unitPrice } : {}),
    } : x));
  }
  function removePreviewItem(key: number) {
    if (key < 0) return;
    setQuote((q) => q.filter((x) => x.key !== key));
    // ลบข้อที่กำลังแก้อยู่ (✏️) → เลิกโหมดแก้ กันกด "อัปเดตข้อ" แล้วหายเงียบ (QA HIGH-1)
    if (key === editingKey) setEditingKey(null);
  }
  const previewCustomer = {
    name: selectedCustomer?.name ?? "",
    address: selectedCustomer?.address ?? "",
    phone: selectedCustomer?.phone ?? "",
    job: selectedCustomer?.job ?? "",
    contact_person: selectedCustomer?.contact_person ?? "",
    kind: "INDIVIDUAL",
  };
  function printRealForm() {
    // พิมพ์เฉพาะฟอร์ม A4 (พรีวิว) — print CSS ซ่อนส่วนอื่น
    window.print();
  }

  function printQuote() {
    const rows = quote.map((it, i) =>
      `<tr><td>${i + 1}</td><td>${it.name}<div class="d">${it.desc.replace(/รายละเอียดงาน/g, '<b style="color:#b3151d">รายละเอียดงาน</b>')}</div></td><td class="r">${it.qty}</td><td class="r">${baht(it.perUnit)}</td><td class="r">${baht(it.perUnit * it.qty)}</td></tr>`
    ).join("");
    const svcRows = svcResult.lines.filter((l) => l.amount > 0)
      .map((l) => `<tr><td></td><td>${l.name}</td><td class="r">1</td><td class="r">${baht(l.amount)}</td><td class="r">${baht(l.amount)}</td></tr>`).join("");
    const grandRow = svcResult.total > 0
      ? `<tr class="t"><td colspan="4" class="r">รวมทั้งสิ้น (สินค้า + บริการ)</td><td class="r">฿${baht(grandTotal)}</td></tr>`
      : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ใบเสนอราคา (R4.0)</title><style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#1f2937}h2{color:#b3151d;margin:0 0 2px}
      table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#fdecec;color:#7d0f15}
      .r{text-align:right}.d{font-size:11px;color:#6b7280;white-space:pre-line;line-height:1.5;margin-top:2px}.t{font-weight:700}
      .note{margin-top:14px;font-size:11px;color:#9ca3af}</style></head><body>
      <h2>ใบเสนอราคา (ร่าง — เครื่องคิดราคา 4.0)</h2>
      <div style="font-size:12px;color:#6b7280">ราคารวมติดตั้ง · ยังไม่ใช่เอกสารทางการ — ออกใบเสนอราคาจริงที่เมนูใบเสนอราคา</div>
      <table><thead><tr><th>#</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ราคา/ชุด</th><th class="r">รวม</th></tr></thead>
      <tbody>${rows}${svcRows}</tbody>
      <tfoot><tr class="t"><td colspan="4" class="r">${svcResult.total > 0 ? "รวมค่าสินค้า/งาน" : "รวมทั้งสิ้น"}</td><td class="r">฿${baht(quoteTotal)}</td></tr>${grandRow}</tfoot></table>
      <div class="note">คิดโดยเครื่องคิดราคา R4.0 (ต้นทุนจริง × กำไร) · ${new Date().toLocaleDateString("th-TH")}</div>
      <script>window.print()</script></body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  // ── แผงแก้ราคา (in-memory) ──
  function setAlu(brand: string, v: string) {
    setPb((old: any) => ({ ...old, ALU: { ...old.ALU, [brand]: Number(v) || 0 } }));
  }
  function setBake(k: string, v: string) {
    setPb((old: any) => ({ ...old, BAKE: { ...old.BAKE, [k]: Number(v) || 0 } }));
  }
  function setGlassPrice(k: string, v: string) {
    setPb((old: any) => ({ ...old, GLASS: { ...old.GLASS, [k]: Number(v) || 0 } }));
  }
  const [glassSearch, setGlassSearch] = useState("");

  return (
    <div className="space-y-5">
      {/* พิมพ์ "ฟอร์มนี้" → ซ่อนทุกอย่างยกเว้นฟอร์ม A4 (.qfp-a4) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (min-width: 1536px) { .qfp-scale { zoom: 0.72; } }
        @media print { .qfp-scale { zoom: 1 !important; } body * { visibility: hidden !important; } .qfp-a4, .qfp-a4 * { visibility: visible !important; } .qfp-a4 { position: absolute !important; left: 0; top: 0; box-shadow: none !important; } .no-print { display: none !important; } }
      ` }} />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calculator" size={18} />
          </span>
          คิดราคา 4.0 <Badge tone="emerald">ต้นทุนจริง</Badge>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCost((v) => !v)}
            className={`press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold ${showCost ? "text-white bg-brand shadow-brand" : "glass-soft text-ink-2"}`}>
            💰 {showCost ? "ซ่อนทุน/กำไร" : "ดูทุน/กำไร"}
          </button>
          <button onClick={() => setAdminOpen((v) => !v)}
            className={`press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold ${adminOpen ? "text-white bg-brand shadow-brand" : "glass-soft text-ink-2"}`}>
            ⚙️ แก้ราคา
          </button>
          {/* รวม "ตรวจผูกสโตร์" + "เทียบกับใบตัด" เป็นหน้าเดียวแล้ว (เจ้าของสั่ง 1 ก.ย.69) — 3 ช่องความจริงในตารางเดียว */}
          <a href="/calculator40/compare"
            className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold glass-soft text-ink-2">
            🔗 ลิงก์ สโตร์/ใบตัด/คิดราคา
          </a>
        </div>
      </div>
      <p className="text-sm text-ink-3 -mt-3">
        ราคาขาย = ทุนจริง × (1 + กำไร%) ปัดร้อย — อลูขึ้นราคา แก้ที่ ⚙️ ทุกรุ่นขยับตามทันที · R3.9 เดิมยังใช้ได้ที่เมนูเครื่องคิดราคา
      </p>

      {/* ── ผูกลูกค้าจากทะเบียน (เฟส B — ออกใบเสนอราคาจริง) ── */}
      <div className="relative max-w-xl" ref={custRef}>
        <div className="flex items-center gap-1.5 glass-soft rounded-xl px-3 py-2.5">
          <Icon name="search" size={15} className="shrink-0 text-ink-3" />
          <input
            type="text" placeholder="ผูกลูกค้า (พิมพ์ชื่อ/เบอร์/พื้นที่) — ไว้ออกใบเสนอราคา"
            value={custQuery}
            onFocus={() => setCustOpen(true)}
            onChange={(e) => { setCustQuery(e.target.value); setCustOpen(true); if (customerId) setCustomerId(null); }}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm" />
          {customerId != null && (
            <button onClick={() => { setCustomerId(null); setCustQuery(""); }} className="shrink-0 text-ink-3 hover:text-red-600 text-xs">✕</button>
          )}
        </div>
        {selectedCustomer && (
          <p className="mt-1 text-xs text-green-700 font-medium flex items-center gap-1"><Icon name="check" size={13} /> ผูกแล้ว: {selectedCustomer.name}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}</p>
        )}
        {custOpen && custFiltered.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-lg">
            {custFiltered.slice(0, 30).map((c) => (
              <li key={c.id}
                onMouseDown={(e) => { e.preventDefault(); setCustomerId(c.id); setCustQuery(c.name); setCustOpen(false); }}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-brand/5 border-b border-black/5 last:border-0">
                {c.name}{c.job ? <span className="text-ink-3"> · {c.job}</span> : ""}
                <span className="float-right text-xs text-ink-3">{(c.phone ?? "").replace(/\D/g, "").slice(-4) || ""}</span>
                {c.address && <div className="text-[11px] text-ink-3 truncate">📍 {c.address}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── แผงแก้ราคา (in-memory เหมือน mockup — รีเฟรชคืนค่าเดิม) ── */}
      {adminOpen && (
        <Card className="p-5 border-2 border-brand/25">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-brand-dark">⚙️ ลองปรับราคา (ชั่วคราว — รีเฟรชแล้วคืนค่าจากสต๊อก)</h3>
            <button onClick={() => setPb(applyPriceOverride(JSON.parse(JSON.stringify(PRICEBOOK)), priceOverride))} className="press text-xs font-semibold glass-soft rounded-lg px-2.5 py-1.5 text-ink-2">↺ คืนค่าจากสต๊อก</button>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs font-semibold text-ink-3 mb-1.5">ราคาอลูมิเนียม (฿/กก.)</div>
              <div className="space-y-1.5">
                {Object.keys(pb.ALU).map((b) => (
                  <label key={b} className="flex items-center gap-2">
                    <span className="w-24 text-ink-2">{b}</span>
                    <input type="number" value={pb.ALU[b]} onChange={(e) => setAlu(b, e.target.value)}
                      className="glass-soft rounded-lg px-3 py-1.5 w-28 outline-none tabular-nums" />
                    <span className="text-xs text-ink-3">ฐาน {pb.ALU_BASE?.[b] ?? "—"}</span>
                  </label>
                ))}
              </div>
              <div className="text-xs font-semibold text-ink-3 mt-3 mb-1.5">ค่าอบสี (฿/กก.)</div>
              <div className="space-y-1.5">
                {Object.keys(pb.BAKE).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="w-32 text-ink-2">{COLOR_LABEL[k] ?? k}</span>
                    <input type="number" value={pb.BAKE[k]} onChange={(e) => setBake(k, e.target.value)}
                      className="glass-soft rounded-lg px-3 py-1.5 w-28 outline-none tabular-nums" />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-ink-3 mb-1.5">ราคากระจก (฿/ตร.ม.) — ค้นแล้วแก้</div>
              <input value={glassSearch} onChange={(e) => setGlassSearch(e.target.value)} placeholder="ค้นชื่อกระจก เช่น เทมเปอร์ 6"
                className="w-full glass-soft rounded-lg px-3 py-2 mb-2 outline-none" />
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {/* ⚠ แผงนี้ใช้ "เฉพาะกระจกที่มีราคาในตาราง" — ตัวเลือกแทนกระจก (คอมโพสิต/ลูกฟูก/เกล็ด Z)
                    ไม่มีใน pb.GLASS (engine คิดแยกเป็นแผ่น) ถ้าเอามาโชว์ช่องจะว่างและแก้แล้วสร้างรายการผี */}
                {Object.keys((pb.GLASS ?? {}) as Record<string, number>)
                  .filter((k) => k.toLowerCase().includes(glassSearch.toLowerCase())).slice(0, 25).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="flex-1 text-ink-2 text-xs truncate">{k}</span>
                    <input type="number" value={pb.GLASS[k]} onChange={(e) => setGlassPrice(k, e.target.value)}
                      className="glass-soft rounded-lg px-3 py-1.5 w-24 outline-none tabular-nums" />
                  </label>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-ink-3 mt-3">* ตรงนี้ใช้ <b>ลองปรับดูราคา</b>เฉยๆ (รีเฟรชแล้วหาย) — <b>ราคาจริงมาจากหน้า “เช็คสต๊อกวัสดุ”</b> แก้ราคาที่นั่นแล้วใบเสนอ 4.0 เปลี่ยนตามถาวร · อลูคิดจากเรตต่อโล/แบรนด์ (SMS/EURO…)</p>
        </Card>
      )}

      {/* ── เมนูประเภทบาน (กลุ่ม + รุ่น) — ไว้ด้านบน แนวนอน (ไม่อัดข้าง อ่านง่าย) ── */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {GROUPS.map((g) => (
            <button key={g.g} onClick={() => setGroup(g.g)}
              className={`press text-xs font-semibold rounded-full px-3.5 py-1.5 ${group === g.g ? "bg-brand text-white shadow-brand" : "glass-soft text-ink-2"}`}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {prodList.map((x: any) => (
            <button key={x.id} onClick={() => pickProduct(x)} aria-current={prodId === x.id}
              className={`press text-left rounded-xl px-3 py-2 flex items-center gap-2 ${prodId === x.id ? "text-white bg-brand shadow-brand" : "glass-soft hover:bg-white/70"}`}>
              <span className="text-base">{x.icon ?? "▫️"}</span>
              <span className="font-semibold text-sm">{x.name}</span>
              {x.isR39Fallback && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${prodId === x.id ? "bg-white/25 text-white" : "bg-amber-100 text-amber-800"}`}>R3.9</span>
              )}
            </button>
          ))}
          {todoList.map((t: any, i: number) => (
            <div key={i} className="rounded-xl px-3 py-2 text-xs text-ink-3 border border-dashed border-gray-300">⏳ {t.name}</div>
          ))}
          {prodList.length === 0 && todoList.length === 0 && <p className="text-sm text-ink-3 py-2">กลุ่มนี้ยังไม่มีรุ่น</p>}
        </div>
      </Card>

      {/* ── Split view: ซ้าย=ฟอร์มคิดราคา · ขวา=ฟอร์มใบเสนอราคาจริง (A4) พรีวิวสด ── */}
      <div className="flex flex-col 2xl:flex-row gap-4 2xl:items-start">
        {/* ── ซ้าย: ฟอร์มคิดราคา (ออปชั่น) ── */}
        <div className="flex-1 min-w-0">
        {/* ── ฟอร์ม + ราคา ── */}
        <Card className="p-6">
          {prod ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-brand-dark flex items-center gap-2">
                  {prod.icon} {prod.name}
                  {prod.isR39Fallback && <Badge tone="amber">ราคา R3.9 · ยังไม่ถอดทุน</Badge>}
                </h3>
                {prod.note && <span className="text-[11px] text-ink-3 max-w-[45%] text-right">{prod.note.slice(0, 90)}</span>}
              </div>

              {/* หลังคา: แถบเลือกทรง (กันสาด/จั่ว/เลื่อน) — สลับ prodId ไปยังรุ่นจริงที่ pickerHide (roof/roof_gable/roof_slide)
                  ตรง app.js renderRoofShapeBar ~1601-1611 (เลือกก่อน→วัสดุ) */}
              {prod.roofShape && (
                <div className="mt-4">
                  <div className="text-xs font-bold text-brand-dark mb-1.5">🏠 ทรงหลังคา & วัสดุมุง</div>
                  <label className="block">
                    <span className="text-xs font-medium text-ink-3">ทรงหลังคา <span className="text-brand font-semibold">(เลือกก่อน)</span></span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {/* กลาสเฮ้าส์ 2 รุ่น ย้ายไป G6 ห้องกระจกแล้ว (เจ้าของทัก 28 ส.ค.69) — แถบนี้เหลือแต่ทรงหลังคาจริง ๆ */}
                      {([["roof", "สโลปทางเดียว (กันสาด)"], ["roof_gable", "จั่ว สโลป 2 ทาง"], ["roof_slide", "หลังคาเลื่อน"],
                        ["roof_multi", "กันสาดหลายด้าน"], ["gable_multi", "จั่วหลายด้าน"]] as [string, string][])
                        .filter(([pid]) => (PRODUCTS as any)[pid])
                        .map(([pid, label]) => (
                          <button key={pid} type="button" onClick={() => { if (pid !== prodId) pickProduct((PRODUCTS as any)[pid]); }}
                            className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${prodId === pid ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                            {label}
                          </button>
                        ))}
                    </div>
                  </label>
                </div>
              )}

              {!prod.composite && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-4">
                  {/* หลังคา: กรอกเป็นเมตร + ป้าย "ยื่น" (เจ้าของขอ) · อื่น ๆ กรอก ซม. ป้าย "สูง" */}
                  {prod.multiSide === "d" ? (
                    // จั่วหลายด้าน: ยาวช่วงกรอกรายด้าน แต่ "ลึก 2 สโลป" ใช้ค่าเดียวทั้งหลัง = ช่องกว้างนี้
                    <MetersField label="กว้าง — ลึก 2 สโลป (ม.)" cm={w} onCm={setW} />
                  ) : prod.multiSide ? null : (prod.roofShape || prod.spanMeters) ? (
                    <>
                      <MetersField label="ความกว้าง (ม.)" cm={w} onCm={setW} />
                      <MetersField label="ยื่น (ม.)" cm={h} onCm={setH} />
                    </>
                  ) : (
                    <>
                      <Field label="กว้าง (ซม.)" value={w} onChange={setW} />
                      <Field label="สูง (ซม.)" value={h} onChange={setH} />
                    </>
                  )}
                  {(prod.maxP ?? 1) > 1 || (prod.defaults?.p ?? 1) > 1 ? (
                    // รูปแบบที่ล็อกจำนวนบาน (เปิดคู่กลาง = 4 หรือ 6) → ให้เลือกจากลิสต์ ไม่ให้พิมพ์เลขอื่น
                    //   เดิมพิมพ์ 2-3 ได้ แล้วสูตรหักบานติดตาย 2 ทิ้ง = ล้อ 0 ตัว แต่ราคายังออกสวย ๆ
                    formRule(prod, form)?.panes?.length ? (
                      <Select label="จำนวนบาน" value={String(p)} onChange={setP}
                        opts={allowedPanes(prod, form).map(String)}
                        labels={Object.fromEntries(allowedPanes(prod, form).map((v) => [String(v), `${v} บาน (เลื่อน ${v - 2} + ติดตาย 2)`]))} />
                    ) : (
                      <Field label={`จำนวนบาน${prod.minP ? ` (${prod.minP}–${prod.maxP})` : ""}`} value={p} onChange={setP} />
                    )
                  ) : <div />}
                  <Field label="กำไร ค่าของ %" value={profit} onChange={(v: string) => { setProfit(v); setProfitManual(true); }} />
                  <Field label="กำไร ค่าผลิต %" value={profitProd} onChange={(v: string) => { setProfitProd(v); setProfitManual(true); }} />
                  <Field label="กำไร ค่าติดตั้ง %" value={profitInst} onChange={(v: string) => { setProfitInst(v); setProfitManual(true); }} />
                </div>
              )}
              {/* ห้องกระจก (G6) — ไม่มีกว้าง/สูง/บานระดับห้อง (กำหนดต่อบาน/ต่อด้านใน RoomComposer) แต่ยังต้องมีกำไร% + สี/กระจกหลัก (ทุกบานในห้องใช้ร่วมกัน) */}
              {prod.composite && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-4">
                  <Field label="กำไร ค่าของ %" value={profit} onChange={(v: string) => { setProfit(v); setProfitManual(true); }} />
                  <Field label="กำไร ค่าผลิต %" value={profitProd} onChange={(v: string) => { setProfitProd(v); setProfitManual(true); }} />
                  <Field label="กำไร ค่าติดตั้ง %" value={profitInst} onChange={(v: string) => { setProfitInst(v); setProfitManual(true); }} />
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3">
                {/* ตัวเลือกเดียว = กดไม่ได้ ไม่ต้องโชว์ (เจ้าของท้วง 2 ก.ย.69 "จะสื่ออะไร งง") — แพตเทิร์นเดียวกับ SubPanesSection */}
                {prod.forms?.length > 1 && !prod.composite && (
                  <Select label="รูปแบบ" value={form} onChange={setForm} opts={prod.forms} />
                )}
                {/* คำอธิบายรูปแบบ (เช่น เปิดคู่กลาง = เลื่อน N−2 + ติดตาย 2) — ให้คนคิดราคาเข้าใจว่านับยังไง */}
                {formNote(prod, form) && (
                  <p className="col-span-2 md:col-span-3 text-[11px] text-brand-dark bg-brand/5 border border-brand/20 rounded-lg px-3 py-2 -mt-1">
                    ⓘ {formNote(prod, form)}
                  </p>
                )}
                {/* ประตู/หน้าต่าง — คุมคำขึ้นต้นชื่อรายการในใบเสนอ · "อัตโนมัติ" = เดาจากความสูง (≥1.9ม.=ประตู) */}
                {paneKindOn && (
                  <Select
                    label={`ประตู/หน้าต่าง${useSel === "auto" ? ` · เดาให้ = ${paneKind === "door" ? "ประตู" : "หน้าต่าง"}` : ""}`}
                    value={useSel} onChange={(v) => setUseSel(v as "auto" | "door" | "window")}
                    opts={["auto", "door", "window"]}
                    labels={{ auto: "อัตโนมัติ", door: "ประตู", window: "หน้าต่าง" }}
                  />
                )}
                {/* พื้นล่างของประตู — ข้อความบนใบเท่านั้น ไม่กระทบราคา (ค่าธรณีหลังเต่าอยู่ในของเสริม) */}
                {paneKindOn && paneKind === "door" && !sillIsForm(prod.id) && (
                  <Select
                    label="พื้นล่าง (ขึ้นในใบ)"
                    value={sillSel || paneSill({ typeKey: prod.id, w: 0, h: 0, n: 1 })}
                    onChange={setSillSel} opts={SILL_OPTS}
                  />
                )}
                <Select label="สีอลูมิเนียม" value={color} onChange={setColor}
                  opts={aluColorKeysFor(prod?.id)} labels={ALU_COLOR_LABEL} />
                {(prod.defGlass || prod.composite) && (
                  <GlassSelect label="กระจก (ทั้งห้อง)" value={glassType} onChange={setGlassType} opts={glassKeys} />
                )}
                {prod.materials?.length > 0 && (
                  <Select label={prod.materialLabel || "วัสดุ"} value={material} onChange={setMaterial} opts={prod.materials} labels={prod.materialLabels} />
                )}
                {/* ช่องรายด้าน/รอยต่อ ของหลังคาหลายด้าน ไม่โผล่ตรงนี้ — RoofSidesEditor คุมทั้งชุด (ไม่งั้นได้ 2 ที่กรอกชนกัน) */}
                {(prod.specOpts ?? []).filter((o: any) => !/^(side\d|joint\d)/.test(o.key)).map((o: any) => {
                  // ฟิลด์ label ขึ้นต้น "[สลับ]" ใช้เฉพาะตอนเลือก gslat='ระแนงสลับ' — ไม่งั้นล็อกไว้กันกดมั่ว (25 ส.ค.69)
                  const isAltField = typeof o.label === "string" && o.label.startsWith("[สลับ]");
                  const altLocked = isAltField && spec.gslat !== "ระแนงสลับ";
                  // specOpts type:'number' → ช่องกรอกตัวเลข (มิติเพิ่ม เช่น บานเปิด/ช่องปูน Shower · ลึกตู้)
                  if (o.type === 'number') {
                    return (
                      <label key={o.key} className="block">
                        <span className={altLocked ? "text-xs font-medium text-ink-3/40" : "text-xs font-medium text-ink-3"}>{o.label}</span>
                        <input type="number" step={o.step ?? 0.1} min={0} value={spec[o.key] ?? ""} placeholder={o.placeholder ?? ""}
                          onChange={(e) => setSpec((s) => ({ ...s, [o.key]: e.target.value }))}
                          disabled={altLocked}
                          className="mt-1.5 w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none tabular-nums text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40 disabled:cursor-not-allowed" />
                      </label>
                    );
                  }
                  // optsByMaterial: ตัวเลือกล็อกตามวัสดุที่เลือก (เช่น สีผ้ามุ้ง — ผ้ากันแมวมีแต่สีขาว) ตรง app.js ~1468
                  const opts: string[] = (o.optsByMaterial && o.optsByMaterial[material]) || o.opts;
                  const val = opts.includes(spec[o.key]) ? spec[o.key] : (o.def && opts.includes(o.def) ? o.def : opts[0]);
                  return (
                    <Select key={o.key} label={o.label} value={val ?? ""} onChange={(v) => setSpec((s) => ({ ...s, [o.key]: v }))} opts={opts} labels={o.labels} disabled={altLocked} />
                  );
                })}
                {/* มือจับ — ยี่ห้อ/สี/ชนิดต่อบาน · แต่ละคู่ = คนละรหัสสโตร์ ราคาจึงต่างกันได้จริง
                    ตัวเลือกชุดเดียวกับหน้าใบตัด (เจ้าของสั่ง 19 ส.ค.69) */}
                {HW_FROM_CUTLIST.has(prod.id) && HANDLE_FIELDS.map((o) => (
                  <Select key={o.key} label={o.label} value={cutSel[o.key] ?? o.def} opts={[...o.choices]}
                    onChange={(v) => setCutSel((c) => ({ ...c, [o.key]: v }))} />
                ))}
              </div>

              {/* อุปกรณ์จากใบตัด — รหัสไหนยังไม่ตั้งราคาในสโตร์ ต้องเห็นทันที
                  (ไม่งั้นค่าของหายเงียบ = เสนอราคาต่ำกว่าจริง) ระบบยังใช้ราคาเดิมไปก่อน */}
              {(result as any)?.hwMissing?.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ อุปกรณ์ {(result as any).hwMissing.length} รายการยังไม่มีราคาในสโตร์ — รายการที่มีราคาสำรองในสูตรจะใช้ราคานั้นไปก่อน ส่วนที่ไม่มีเลยจะคิดเป็น ฿0 (ค่าของต่ำกว่าจริง)
                  <div className="mt-1 font-mono text-[10px] leading-relaxed">
                    {(result as any).hwMissing.map((m: any) => `${m.sku || "ไม่มีรหัส"} ${m.name}`).join(" · ")}
                  </div>
                  <div className="mt-1">ตั้งราคาที่หน้าสโตร์แล้วรีเฟรชหน้านี้ ระบบจะสลับไปคิดจากรายการใบตัดให้เอง</div>
                </div>
              )}
              {(result as any)?.input && !(result as any)?.hwFromCutlist && HW_FROM_CUTLIST.has(prod.id) && (
                <p className="mt-2 text-[11px] text-ink-3 bg-line/20 border border-line rounded-lg px-3 py-2">
                  ⓘ รูปแบบ/จำนวนบานนี้ยังไม่มีสูตรใบตัดในไฟล์ — คิดราคาได้ปกติ แต่ &quot;ค่าของ&quot; ใช้รายการอุปกรณ์เดิมในสูตร
                  (ไม่ได้แตกรายรหัสเหมือนรูปแบบที่มีใบตัด)
                </p>
              )}
              {(result as any)?.hwFromCutlist && (
                <div className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  ✓ ค่าของ คิดจากรายการอุปกรณ์ในใบตัด (รหัสสโตร์ชุดเดียวกับที่ช่างเบิกจริง)
                  {(result as any).hwFileFallback?.length > 0 && (
                    <div className="mt-1 text-amber-800">
                      ⓘ {(result as any).hwFileFallback.length} รายการยังใช้ราคาจากไฟล์ถอดทุน (สโตร์ยังไม่ตั้งราคา) —
                      ตั้งราคาในสโตร์เมื่อไร ระบบใช้ของสโตร์ทันที
                      <div className="mt-0.5 font-mono text-[10px] leading-relaxed">
                        {(result as any).hwFileFallback.map((m: any) => `${m.sku} ${m.name}`).join(" · ")}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* รีมาร์คสี (สีชุบ/Aztec ฯลฯ ที่ยังใช้ราคา R3.9 อ้างอิง — รอถอดทุน 4.0) */}
              {resolveAluColor(color).note && (
                <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⓘ {resolveAluColor(color).note}
                </p>
              )}

              {/* สีวัสดุมุงหลังคา (label พิมพ์ลงใบ ไม่กระทบราคา) — ตรง app.js ~1250-1260 */}
              {roofSheetColors.length > 0 && (
                <div className="mt-3">
                  <label className="block">
                    <span className="text-xs font-medium text-ink-3">สีวัสดุมุง <span className="text-ink-3/70 font-normal">({roofSheetColors.length} สี · พิมพ์ลงใบ)</span></span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {roofSheetColors.map((x) => (
                        <button key={x.n} type="button" onClick={() => setSheetColor(x.n)}
                          className={`press inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 ${sheetColor === x.n ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                          <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: x.dot }} />
                          {x.n}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
              )}

              {/* kindOpts (G4 ตู้/ฝาตู้/shower) — ประเภทตู้/ชนิดชั้น/กระจกหน้าบาน/สีหน้าบาน ฯลฯ ตรง app.js renderKindOpts ~1116-1131
                  showIf/hideIf: โผล่/ซ่อนตามค่าของ kindOpt อื่น (เช่น เกรดกระจกชั้น โผล่เฉพาะ ชนิดชั้น=กระจก) */}
              {(prod.kindOpts ?? []).length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3">
                  {prod.kindOpts.map((ko: any) => {
                    if (ko.showIf && kind[ko.showIf.key] !== ko.showIf.val) return null;
                    if (ko.hideIf && kind[ko.hideIf.key] === ko.hideIf.val) return null;
                    const opts: string[] = ko.opts.map((pair: [string, string]) => pair[0]);
                    const labels: Record<string, string> = {};
                    ko.opts.forEach((pair: [string, string]) => { labels[pair[0]] = pair[1]; });
                    return (
                      <Select key={ko.key} label={ko.label} value={kind[ko.key] ?? ko.def ?? opts[0]}
                        onChange={(v) => setKind((s) => ({ ...s, [ko.key]: v }))} opts={opts} labels={labels} />
                    );
                  })}
                  {/* รหัสสีหน้าบานพิเศษ — โผล่เฉพาะเลือก "สีพิเศษ" (faceColor) · label พิมพ์ลงใบ ไม่กระทบราคา */}
                  {kind.faceColor === "special" && (
                    <label className="block">
                      <span className="text-xs font-medium text-ink-3">รหัสสีหน้าบานพิเศษ (พิมพ์ลงใบ)</span>
                      <input type="text" value={faceColorCode} onChange={(e) => setFaceColorCode(e.target.value)}
                        placeholder="เช่น RAL 9016"
                        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none" />
                    </label>
                  )}
                </div>
              )}

              {/* G4 ตู้: ความลึก + จำนวนชั้น + กั้นด้านตู้ — ตรง app.js calc() c.depth/c.shelves/c.cabSides */}
              {prod.sellCabinet && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <Field label="ความลึกตู้ (ม.)" value={depth} onChange={setDepth}
                      placeholder={String(prod.defDepth ?? (kind.kind === "shoe" ? 0.4 : 0.6))} />
                    {!prod.faceOnly && (
                      <Field label="จำนวนชั้น (เว้น=อัตโนมัติ)" value={shelves} onChange={setShelves} />
                    )}
                  </div>
                  {!prod.faceOnly && (
                    <div>
                      <div className="text-xs font-bold text-brand-dark mb-1.5">🧱 ผนัง / กั้นด้านตู้</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        {([["left", "กั้นด้านซ้าย"], ["right", "กั้นด้านขวา"], ["back", "กั้นด้านหลัง"]] as [string, string][]).map(([k, lbl]) => {
                          const side = cabSides[k] ?? { on: false, mat: "alu" };
                          const matOpts = ["none", "alu", "glass", "smart"];
                          const matLabels: Record<string, string> = { none: "ไม่กั้น", alu: "อลูทึบ", glass: "กระจก", smart: "สมาร์ทบอร์ด" };
                          const val = side.on ? side.mat : "none";
                          return (
                            <Select key={k} label={lbl} value={val} opts={matOpts} labels={matLabels}
                              onChange={(v) => setCabSides((s) => ({ ...s, [k]: v === "none" ? { on: false, mat: "alu" } : { on: true, mat: v } }))} />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* บานติดตาย (ไม่เลื่อน/ไม่เปิด) — ตรง app.js ~1104-1114 · ลด movePanes ของมุ้ง + ขึ้นใบ */}
              {prod.group === 1 && !prod.composite && !prod.sellDirect && !prod.pFromForm &&
                (Number(p) || prod.defaults?.p || 1) > 1 && !/ติดตาย|ดัดโค้ง/.test(prod.name || "") && (
                <div className="mt-3">
                  <label className="block">
                    <span className="text-xs font-medium text-ink-3">
                      บานติดตาย (ไม่{/เปิด|เฟี้ยม|กระทุ้ง|หมุน|ยก|ประตู|PC|Velora/i.test(prod.name || "") ? "เปิด" : "เลื่อน"})
                      <span className="text-ink-3/70 font-normal"> · ที่เหลือ {movePanes} บาน{/เปิด|เฟี้ยม|กระทุ้ง|หมุน|ยก|ประตู|PC|Velora/i.test(prod.name || "") ? "เปิด" : "เลื่อน"} · ขึ้นใบ</span>
                    </span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button type="button" onClick={() => setFixedPanes((v) => Math.max(0, v - 1))}
                        className="press min-w-[44px] min-h-[44px] rounded-lg glass-soft text-ink-2 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">−</button>
                      <input type="number" readOnly value={fixedPanes}
                        className="w-16 min-h-[44px] glass-soft rounded-lg px-2 py-2 text-center outline-none tabular-nums" />
                      <button type="button" onClick={() => setFixedPanes((v) => Math.min((Number(p) || prod.defaults?.p || 1) - 1, v + 1))}
                        className="press min-w-[44px] min-h-[44px] rounded-lg glass-soft text-ink-2 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">+</button>
                    </div>
                  </label>
                </div>
              )}

              {!prod.composite && (
                <AddonsSection
                  prod={prod}
                  addons={addons}
                  setAddons={setAddons}
                  spec={spec}
                  area={(Number(w) || prod.defaults?.w || 200) / 100 * (Number(h) || prod.defaults?.h || 200) / 100}
                  W={(Number(w) || prod.defaults?.w || 200) / 100}
                  movePanes={movePanes}
                  color={resolveAluColor(color).bake}
                  form={form || prod.defForm}
                />
              )}

              {/* 🏗️ ห้องกระจก (G6) — ประกอบด้าน/ผนัง/ฝ้า/หลังคา คิดราคาด้วย R4.0 จริงต่อชิ้น (RoomComposer คิดเองทั้งก้อน) */}
              {prod.composite && (
                <RoomComposer
                  key={roomSeed}
                  pb={pb}
                  mainColor={color}
                  mainGlass={glassType}
                  profitPct={Number(profit) || 100}
                  initial={roomInitial}
                  onTotal={(t) => { setRoomTotals(t); roomStateRef.current = (t as any).state ?? roomStateRef.current; }}
                />
              )}

              {/* หลังคาหลายช่วง (ขยัก) — เลิกใช้ (เจ้าของสั่งถอด 27 ส.ค.69 · ทรงหักมุมใช้เมนู "หลายด้าน" แทน)
                  โผล่เฉพาะใบเสนอเก่าที่บันทึกช่วงไว้แล้ว → แก้/ลบได้ แต่เพิ่มใหม่ไม่ได้ (ไม่มีปุ่มเพิ่ม)
                  ⚠ ห้ามลบบล็อกนี้ทิ้ง ไม่งั้นใบเก่าเปิดมาแล้วราคาหายเงียบ โดยไม่มีใครเห็นว่าหายอะไร */}
              {roofSegs.length > 0 && (
                <div className="mt-4 space-y-2.5 rounded-2xl glass-soft p-4">
                  <div className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
                    🏠 หลังคาหลายช่วง (ขยัก) <span className="text-xs font-normal text-amber-700">· เลิกใช้แล้ว</span>
                  </div>
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    วิธีนี้คิดแต่ละช่วงเป็นหลังคาเดี่ยวเต็มใบ ทำให้กล่อง 4″×4″ ตัวขอบกับตะเข้ไม่ถูกคิดเงิน
                    งานหลังคาหักมุมให้เลือกทรง <b>กันสาดหลายด้าน / กลาสเฮ้าส์หลายด้าน / จั่วหลายด้าน</b> ด้านบนแทน
                    (ช่วงด้านล่างเป็นของใบเก่า แก้หรือลบได้ แต่เพิ่มใหม่ไม่ได้แล้ว)
                  </p>
                  {roofSegs.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-ink-3 w-14 shrink-0">ช่วง {i + 2}</span>
                      <input type="number" step={0.1} placeholder="กว้าง(ม.)" value={s.w || ""}
                        onChange={(e) => setRoofSegs((arr) => arr.map((x, xi) => xi === i ? { ...x, w: +e.target.value || 0 } : x))}
                        className="min-h-[44px] glass-soft rounded-lg px-3 py-2 w-24 outline-none tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
                      <input type="number" step={0.1} placeholder="ลึก(ม.)" value={s.h || ""}
                        onChange={(e) => setRoofSegs((arr) => arr.map((x, xi) => xi === i ? { ...x, h: +e.target.value || 0 } : x))}
                        className="min-h-[44px] glass-soft rounded-lg px-3 py-2 w-24 outline-none tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
                      <button type="button" onClick={() => setRoofSegs((arr) => arr.filter((_, xi) => xi !== i))}
                        className="press min-w-[44px] min-h-[44px] rounded-lg glass-soft text-ink-3 hover:text-red-600">
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                  {roofSegs.length > 0 && (
                    <p className="text-[11px] text-ink-3">ช่วงหลังคาเพิ่มคิดวัสดุ/โครงตามขนาดจริง · วัสดุ/สีตามช่วงหลัก · รวมพื้นที่ในรายการเดียว (ออปหลังคา เช่น รางน้ำ คิดที่ช่วงหลัก)</p>
                  )}
                </div>
              )}

              {/* หลังคาหลายด้าน — กรอกกว้าง/ยื่นรายด้าน + รอยต่อ พร้อมผังมองจากด้านบน (RoofSidesEditor) */}
              {prod.multiSide && (
                <RoofSidesEditor
                  kind={prod.multiSide}
                  jointOpts={(prod.specOpts ?? []).find((o: any) => o.key === "joint1")?.opts ?? []}
                  jointEnd={prod.multiSide === "d" ? "ติดบ้าน" : "ชนผนัง"}
                  value={roofSides}
                  onChange={setRoofSides}
                  depth={(Number(w) || 0) / 2}
                  area={(result as any)?.area}
                />
              )}

              {/* ➕ ผสมบาน (G1) — เพิ่มบานหลายชนิดในชุดเดียว ตรง app.js renderSubPanes ~1356-1367
                  ยกเว้นห้องกระจก composite + รุ่นระบบเดี่ยว "พิเศษ · กระจกเปลือย · สำเร็จ" (shower/บานเปลือย/YKK ผสมบานไม่ได้ · SPEC-G1 LOCKED) */}
              {prod.group === 1 && !prod.composite && prod.subcat !== "พิเศษ · กระจกเปลือย · สำเร็จ" && (
                <SubPanesSection
                  subs={subs}
                  setSubs={setSubs}
                  pb={pb}
                  mainColor={color}
                  mainGlass={glassType}
                  profitPct={Number(profit) || 100}
                />
              )}

              {/* ราคา (ห้องกระจก G6 มีการ์ดราคารวมของตัวเองใน RoomComposer แล้ว — ไม่ต้องซ้ำ) */}
              {!prod.composite && (ok ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {/* เลือกว่าจะคิดค่าแรงแบบไหนลงใบเสนอ — กดที่การ์ดได้เลย · การ์ดที่เลือกอยู่ = ราคาที่จะขึ้นใบ */}
                  <button
                    type="button" onClick={() => setLaborMode("mfg")}
                    className={"press text-left rounded-2xl px-5 py-4 transition " + (laborMode === "mfg" ? "bg-brand text-white shadow-brand" : "glass-soft")}
                    aria-pressed={laborMode === "mfg"}
                  >
                    <div className={"text-xs font-medium " + (laborMode === "mfg" ? "text-red-100" : "text-ink-3")}>
                      {laborMode === "mfg" ? "✓ " : ""}ขายผลิตอย่างเดียว
                    </div>
                    <div className={"font-bold leading-tight " + (laborMode === "mfg" ? "text-3xl" : "text-2xl text-brand-dark")}>฿{baht(result.sell.mfgOnlyNet)}</div>
                    <div className={"text-[11px] mt-0.5 " + (laborMode === "mfg" ? "text-red-100" : "text-ink-3")}>
                      ขายส่ง · ไม่ไปติดตั้ง
                      {result.sell.wholesalePct > 0 && (
                        <> · <span className="line-through opacity-70">฿{baht(result.sell.mfgOnly)}</span> ลด {result.sell.wholesalePct}%</>
                      )}
                    </div>
                  </button>
                  <button
                    type="button" onClick={() => setLaborMode("all")}
                    className={"press text-left rounded-2xl px-5 py-4 transition " + (laborMode === "all" ? "bg-brand text-white shadow-brand" : "glass-soft")}
                    aria-pressed={laborMode === "all"}
                  >
                    <div className={"text-xs font-medium " + (laborMode === "all" ? "text-red-100" : "text-ink-3")}>
                      {laborMode === "all" ? "✓ " : ""}ขาย + ติดตั้ง
                    </div>
                    <div className={"font-bold leading-tight " + (laborMode === "all" ? "text-3xl" : "text-2xl text-brand-dark")}>฿{baht(result.sell.withInstall)}</div>
                    <div className={"text-[11px] mt-0.5 " + (laborMode === "all" ? "text-red-100" : "text-ink-3")}>พื้นที่ {result.input.area} ตร.ม. · อลู {result.aluKg} กก.</div>
                  </button>
                  {/* ── แยก 3 ก้อน: ค่าของ / ค่าผลิต / ค่าติดตั้ง + กดเพิ่มกำไรได้ (เจ้าของสั่ง 19 ส.ค.69)
                       โครงตามไฟล์ถอดทุน v9 บล็อก "⚙ ตั้งค่ากำไร" — คูณกำไรแยกก้อน ปัดร้อยแยกก้อน */}
                  <div className="col-span-2 rounded-2xl px-4 py-3 bg-white border border-line">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-brand-dark">แยกเป็น 3 ก้อน</span>
                      <span className="text-[11px] text-ink-3">กดปุ่มปรับกำไรได้ทีละก้อน</span>
                      <button type="button" onClick={() => { const d = defProfit(prod?.id ?? ""); setProfit(String(d.mat)); setProfitProd(String(d.prod)); setProfitInst(String(d.inst)); }}
                        className="press ml-auto text-[11px] font-semibold text-ink-2 glass-soft rounded-lg px-2 py-1">
                        คืนค่าตามไฟล์
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {([
                        ["ค่าของ", showCost ? result.cost.total : null, profit, setProfit, result.sell.beforeLabor],
                        ["ค่าผลิต", showCost ? result.labor.prod : null, profitProd, setProfitProd, result.sell.mfgOnly - result.sell.beforeLabor],
                        ["ค่าติดตั้ง", showCost ? result.labor.install : null, profitInst, setProfitInst, result.sell.withInstall - result.sell.mfgOnly],
                      ] as [string, number | null, string, (v: string) => void, number][]).map(([label, cost, pct, setPct, sell]) => (
                        <div key={label} className={"rounded-xl border px-3 py-2 " + (howOpen === label ? "border-brand bg-brand/5" : "border-line bg-ground/40")}>
                          <div className="text-[11px] font-medium text-ink-3">{label}</div>
                          {cost != null && <div className="text-xs text-ink-3 tabular-nums">ทุน ฿{baht(cost)}</div>}
                          <div className="text-xl font-bold text-brand-dark tabular-nums leading-tight">฿{baht(sell)}</div>
                          <div className="flex items-center gap-1 mt-1.5">
                            <button type="button" aria-label={`ลดกำไร ${label}`}
                              onClick={() => setPct(String(Math.max(0, (Number(pct) || 0) - 10)))}
                              className="press w-7 h-7 rounded-lg glass-soft text-ink-2 font-bold leading-none">−</button>
                            <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric"
                              aria-label={`กำไร ${label} เปอร์เซ็นต์`}
                              className="w-14 text-center glass-soft rounded-lg px-1 py-1 text-sm tabular-nums outline-none" />
                            <span className="text-xs text-ink-3">%</span>
                            <button type="button" aria-label={`เพิ่มกำไร ${label}`}
                              onClick={() => setPct(String((Number(pct) || 0) + 10))}
                              className="press w-7 h-7 rounded-lg glass-soft text-ink-2 font-bold leading-none">+</button>
                          </div>
                          <button type="button" onClick={() => setHowOpen(howOpen === label ? null : label)}
                            className="press mt-1.5 text-[11px] font-semibold text-brand-dark">
                            {howOpen === label ? "ซ่อนวิธีคิด ▲" : "ดูวิธีคิด ▼"}
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* ── กางวิธีคิดทีละก้อน (เจ้าของสั่ง 20 ส.ค.69) ────────────────────────
                        ค่าของ = กางรายการของที่ใช้ + รหัสสโตร์ · ตัวไหนสโตร์ยังไม่ตั้งราคา ขึ้น ฿0 ให้เห็นว่าขาด
                        ค่าผลิต/ค่าติดตั้ง = กางสูตรค่าแรงจากชีต "ค่าแรง" (ฐาน + เรต × ตร.ม.) */}
                    {howOpen === "ค่าของ" && (
                      <div className="mt-2 rounded-xl border border-line bg-white/70 p-3">
                        {/* ตารางนี้โชว์ราคาเสมอ ไม่ผูกกับปุ่ม 💰 ดูทุน/กำไร — ต้องกด "ดูวิธีคิด" ถึงจะกางอยู่แล้ว
                            (เจ้าของแจ้ง 20 ส.ค.69: กางแล้วไม่เห็นราคา เพราะปุ่มทุนปิดอยู่) */}
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-semibold text-brand-dark">ของที่ใช้ทั้งหมด ({result.lines.length} รายการ)</span>
                          <span className="text-[11px] text-ink-3">ราคาทุนจากสโตร์</span>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-white">
                              <tr className="text-left text-ink-3 border-b border-line">
                                <th className="py-1">รายการ</th><th>รหัสสโตร์</th>
                                <th className="text-right">จำนวน</th>
                                <th className="text-right">฿/หน่วย</th><th className="text-right">รวม</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.lines.map((l: any, i: number) => {
                                const code = l.sku || l.code || "";
                                const noPrice = !(Number(l.unitPrice) > 0);
                                return (
                                  <tr key={i} className={"border-t border-line/50 " + (noPrice ? "bg-amber-50" : "")}>
                                    <td className="py-1 pr-2">{l.name}</td>
                                    <td className="font-mono text-[11px] text-ink-3">{code || "—"}</td>
                                    <td className="text-right tabular-nums">{r2(l.qty)} {l.unit || ""}</td>
                                    <td className={"text-right tabular-nums " + (noPrice ? "text-red-600 font-bold" : "")}>
                                      ฿{baht(l.unitPrice)}
                                    </td>
                                    <td className="text-right tabular-nums">฿{baht(l.amount)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-line font-bold">
                                <td className="py-1" colSpan={4}>ทุนรวม</td>
                                <td className="text-right tabular-nums">฿{baht(result.cost.total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        {(result as any)?.hwMissing?.length > 0 && (
                          <p className="text-[11px] text-red-700 mt-1.5">
                            ⚠ แถวสีเหลือง = ยังไม่มีราคาในสโตร์ คิดเป็น ฿0 (ค่าของต่ำกว่าจริง) — ไปตั้งราคาที่หน้าสโตร์
                          </p>
                        )}
                      </div>
                    )}

                    {(howOpen === "ค่าผลิต" || howOpen === "ค่าติดตั้ง") && (() => {
                      const lc = (result as any).laborCalc || {};
                      const isProd = howOpen === "ค่าผลิต";
                      const base = isProd ? lc.pBase : lc.iBase;
                      const rate = isProd ? lc.pRate : lc.iRate;
                      const raw = isProd ? result.labor.prod : result.labor.install;
                      const pct = Number(isProd ? profitProd : profitInst) || 0;
                      const sell = isProd ? result.sell.mfgOnly - result.sell.beforeLabor : result.sell.withInstall - result.sell.mfgOnly;
                      const unit = lc.mode === "perLeaf" ? "ใบ" : "บาน";
                      return (
                        <div className="mt-2 rounded-xl border border-line bg-white/70 p-3 text-xs text-ink-2 space-y-1">
                          <div className="font-semibold text-brand-dark">{howOpen} คิดยังไง</div>
                          <div>ค่าแรงของรุ่นนี้มาจากชีต &quot;ค่าแรง&quot; ในไฟล์ถอดทุน — หัวข้อ <b>{lc.key || "—"}</b></div>
                          {lc.mode === "baseOnly" ? (
                            <div className="tabular-nums">
                              ฐาน ฿{baht(base)}{lc.mult > 1 ? ` × ${lc.mult} บาน` : ""} = <b>฿{baht(raw)}</b>
                              <span className="text-ink-3"> (รุ่นนี้คิดฐานอย่างเดียว ไม่บวกตามพื้นที่)</span>
                            </div>
                          ) : (
                            <div className="tabular-nums">
                              (ฐาน ฿{baht(base)}{lc.mode === "perLeaf" ? ` × ${lc.mult} ${unit}` : ""} + ฿{baht(rate)}/ตร.ม. × {r2(lc.area)} ตร.ม.)
                              {lc.mode !== "perLeaf" && lc.mult > 1 ? ` × ${lc.mult} บาน` : ""} = <b>฿{baht(raw)}</b>
                            </div>
                          )}
                          <div className="tabular-nums">
                            บวกกำไร {pct}% → ปัดขึ้นหลักร้อย = <b className="text-brand-dark">฿{baht(sell)}</b>
                          </div>
                          <p className="text-[11px] text-ink-3">
                            แก้ค่าแรงต้องแก้ในไฟล์ถอดทุน ชีต &quot;ค่าแรง&quot; แล้วซิงก์เข้าระบบ — แก้ในหน้านี้ไม่ได้ (กันตัวเลขหลุดจากไฟล์)
                          </p>
                        </div>
                      );
                    })()}

                    <p className="text-[11px] text-ink-3 mt-2">
                      ราคาขายพร้อมติดตั้ง = ค่าของ + ค่าผลิต + ค่าติดตั้ง = <b className="tabular-nums">฿{baht(result.sell.withInstall)}</b>
                      {" "}· กำไร 100% = ขาย 2 เท่าทุน · 200% = 3 เท่า
                    </p>
                  </div>

                  {/* ค่าแรงแยก — โชว์ทุกคน (ไม่ใช่ข้อมูลทุน) เพราะเจ้าของต้องเห็นว่าแต่ละรุ่นค่าแรงไม่เท่ากัน */}
                  <div className="col-span-2 rounded-2xl px-5 py-3 bg-slate-50 border border-slate-200">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-700">
                      <span className="font-semibold text-slate-800">ค่าแรง (ทุน)</span>
                      <span>ผลิต <b className="tabular-nums">฿{baht(result.labor.prod)}</b></span>
                      <span>ติดตั้ง <b className="tabular-nums">฿{baht(result.labor.install)}</b></span>
                      <span>รวม <b className="tabular-nums">฿{baht(result.labor.prod + result.labor.install)}</b></span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {laborMode === "mfg"
                        ? `ใบเสนอจะคิดเฉพาะค่าแรงผลิต แล้วลดจากยอดรวมอีก ${result.sell.wholesalePct}% (ราคาขายส่ง) — และเขียนกำกับในข้อว่า “ไม่รวมค่าติดตั้ง”`
                        : "ใบเสนอจะคิดค่าแรงผลิต + ติดตั้ง (ค่ามาตรฐาน)"}
                    </p>
                  </div>
                  {showCost && (
                    <div className="col-span-2 rounded-2xl px-5 py-4 bg-amber-50 border border-amber-200">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                        <span>ทุนรวม <b className="tabular-nums">฿{baht(result.cost.total)}</b></span>
                        <span className="text-emerald-700">กำไร <b className="tabular-nums">฿{baht(result.profit)}</b></span>
                        <span className="text-ink-3 text-xs">อลู {baht(result.cost.alu)} · สี {baht(result.cost.bake)} · กระจก {baht(result.cost.glass)} · อุปกรณ์ {baht(result.cost.hardware)} · สิ้นเปลือง {baht(result.cost.consum)} · ค่าแรงผลิต {baht(result.labor.prod)} · ติดตั้ง {baht(result.labor.install)}</span>
                      </div>
                      <button onClick={() => setLinesOpen((v) => !v)} className="press text-xs font-semibold text-brand-dark mt-2">
                        {linesOpen ? "ซ่อน" : "ดู"}รายละเอียด BOM ({result.lines.length} รายการ) →
                      </button>
                      {linesOpen && (
                        <div className="mt-2 max-h-56 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="text-left text-ink-3"><th className="py-1">รายการ</th><th className="text-right">จำนวน</th><th className="text-right">฿</th></tr></thead>
                            <tbody>
                              {result.lines.map((l: any, i: number) => (
                                <tr key={i} className="border-t border-black/5">
                                  <td className="py-1">{l.name} <span className="text-ink-3">({l.cat})</span></td>
                                  <td className="text-right tabular-nums">{baht(l.qty)} {l.unit}</td>
                                  <td className="text-right tabular-nums">{baht(l.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-5 text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3">คิดราคาไม่ได้: {(result as any)?.error ?? "ตรวจอินพุต"}</p>
              ))}

              {/* สรุปบานย่อย/ช่วงเพิ่ม (ผสมบาน G1 + หลังคาหลายช่วง G3) — บวกรวมยอดขาย+ทุน แยกจาก main แต่รวมเป็นรายการเดียวตอนขึ้นใบ */}
              {!prod.composite && ok && ((result as any).subLines?.length > 0) && (
                <div className="mt-3 rounded-xl px-4 py-2.5 bg-sky-50 border border-sky-200 text-sm text-sky-900">
                  <div className="flex items-center justify-between font-semibold">
                    <span>+ รายการเสริม {(result as any).subLines.length} รายการ</span>
                    <span className="tabular-nums">+฿{baht((result as any).subSell || 0)}</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-sky-800">
                    {(result as any).subLines.map((l: any, i: number) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span>{l.desc}</span>
                        <span className="tabular-nums shrink-0">฿{baht(l.amt)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1.5 pt-1.5 border-t border-sky-200 flex items-center justify-between font-bold">
                    <span>รวมทั้งหมด (หลัก + เสริม)</span>
                    <span className="tabular-nums">฿{baht((laborMode === "mfg" ? result.sell.mfgOnlyNet : result.sell.withInstall) + ((result as any).subSell || 0))}</span>
                  </div>
                </div>
              )}

              {/* สรุปของเสริม + คำเตือนจาก addon (cat:'warn' เช่น มอเตอร์ 80 เกินพื้นที่) */}
              {!prod.composite && ok && (() => {
                const addonLines = result.lines.filter((l: any) => l.cat === "addon");
                const warnLines = result.lines.filter((l: any) => l.cat === "warn");
                const addonSum = addonLines.reduce((s: number, l: any) => s + (l.amount || 0), 0);
                return (
                  <>
                    {addonLines.length > 0 && (
                      <div className="mt-3 rounded-xl px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
                        <span>ของเสริม +฿{baht(addonSum)} ({addonLines.length} รายการ)</span>
                      </div>
                    )}
                    {warnLines.map((l: any, i: number) => (
                      <p key={i} className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">{l.name}</p>
                    ))}
                  </>
                );
              })()}

              {/* คำเตือนพื้นที่/บาน (G4 ฝาตู้ FT) — ตรง prod.faceHint (แนะนำ ≤1.7 ตร.ม./บาน กันบานแอ่น) */}
              {ok && prod.faceHint && (() => {
                const wM = (Number(w) || prod.defaults?.w || 200) / 100;
                const hM = (Number(h) || prod.defaults?.h || 200) / 100;
                const pCount = Number(p) || prod.defaults?.p || 1;
                const aPerDoor = (wM * hM) / Math.max(1, pCount);
                return aPerDoor > 1.7 ? (
                  <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    ⚠️ พื้นที่/บาน {aPerDoor.toFixed(2)} ตร.ม. — {prod.faceHint}
                  </p>
                ) : null;
              })()}

              {/* บานเปิดดัดโค้ง — สูงเกิน 2.8 ม. = สั่งร้านอื่น ไม่มีราคาในตาราง (clamp เรต 2.8 ม.) เตือนให้กรอกราคาจริง */}
              {ok && prod.id === "curve_open" && (Number(h) || prod.defaults?.h || 0) > 280 && (
                <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  ⚠️ บานดัดโค้งสูง {((Number(h) || 0) / 100).toFixed(2)} ม. — เกิน 2.8 ม. ไม่มีราคาในตาราง (คิดที่เรต 2.8 ม. · บานสั่งร้านอื่น) <b>ตรวจ/กรอกราคาจริงก่อนเสนอลูกค้า</b>
                </p>
              )}

              {/* เพิ่มลงรายการ / อัปเดตข้อที่กำลังแก้ (0093) */}
              <div className="mt-4 flex items-end gap-3 flex-wrap">
                <Field label="จำนวน (ชุด)" value={sets} onChange={setSets} narrow />
                <button onClick={addToQuote} disabled={!ok}
                  className={`press rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-brand disabled:opacity-60 ${editingKey != null ? "bg-amber-600" : "bg-brand"}`}>
                  {editingKey != null
                    ? `✓ อัปเดตข้อ ${Math.max(1, quote.findIndex((x) => x.key === editingKey) + 1)}`
                    : "+ เพิ่มลงรายการ"}
                </button>
                {editingKey != null && (
                  <button onClick={cancelEditItem}
                    className="press rounded-xl px-3 py-2.5 text-sm font-semibold glass-soft text-ink-2">
                    ยกเลิกแก้
                  </button>
                )}
                {prod?.composite && (
                  <label className="flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer select-none">
                    <input type="checkbox" checked={g6HideSidePrice} onChange={(e) => setG6HideSidePrice(e.target.checked)} />
                    ซ่อนราคารายด้านในใบเสนอ
                  </label>
                )}
              </div>
            </div>
          ) : (
            <p className="text-ink-3 text-center py-10">เลือกรุ่นทางซ้าย</p>
          )}
        </Card>
        </div>{/* /ซ้าย: เครื่องคิดราคา */}

        {/* ── ขวา: ฟอร์มใบเสนอราคาจริง (A4) พรีวิวสด + แก้ข้อความ inline ── */}
        <div className="w-full 2xl:w-[600px] 2xl:shrink-0 2xl:sticky 2xl:top-4 space-y-3">
          {/* โหมดแก้ใบเดิม (?edit=) — แบนเนอร์ + ปุ่มบันทึกกลับใบเดิม (เลือก Rev) แทนการออกใบใหม่ */}
          {editingQ && (
            <div className="no-print rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ✏️ กำลังแก้ใบ <b className="font-mono">{editingQ.code}</b>
              {editingQ.revision_label ? ` (${editingQ.revision_label})` : ""} · สถานะ {editingQ.status === "draft" ? "ร่าง" : editingQ.status === "sent" ? "ส่งแล้ว" : editingQ.status}
              — คลิก ✏️ ที่ข้อในรายการเพื่อโหลดสูตรกลับมาแก้ · เสร็จแล้วกด &quot;บันทึกกลับใบเดิม&quot;
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap no-print">
            {editingQ ? (
              <button onClick={() => { setSaveErr(""); setSaveOpen(true); }} disabled={quote.length === 0}
                className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-50">
                <Icon name="file" size={15} /> บันทึกกลับ {editingQ.code} →
              </button>
            ) : (
              <button onClick={sendToQuotation} disabled={quote.length === 0}
                className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-50">
                <Icon name="file" size={15} /> ออกใบเสนอราคา (บันทึกในระบบ) →
              </button>
            )}
            <button onClick={printRealForm} disabled={quote.length === 0}
              className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold glass-soft text-ink-2 disabled:opacity-50">
              <Icon name="printer" size={15} /> พิมพ์ฟอร์มนี้
            </button>
            {quote.length > 0 && <button onClick={() => { setQuote([]); setEditingKey(null); quoteBaselineRef.current = "[]"; }} className="press text-xs text-ink-3 hover:text-red-600 px-2">ล้างรายการ</button>}
          </div>

          {/* (0093) รายการข้อ — ✏️ แก้ (โหลดสูตรกลับ) · 📋 ก็อป · ▲▼ เลื่อน · ✕ ลบ */}
          {quote.length > 0 && (
            <Card className="p-3 no-print space-y-1.5">
              <div className="text-xs font-semibold text-ink-3">
                รายการ ({quote.length}) — ✏️ = โหลดสูตรกลับเข้าเครื่องคิดเพื่อแก้ · 📋 = ก็อปข้อ (งานคล้ายกัน)
              </div>
              {quote.map((it, i) => {
                const hasRecipe = !!(it.recipe && (PRODUCTS as any)[it.recipe.prodId]);
                const isEditing = editingKey === it.key;
                return (
                  <div key={it.key}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${isEditing ? "bg-amber-50 border border-amber-300" : "bg-black/[0.03]"}`}>
                    <span className="w-5 text-center text-ink-3 shrink-0">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate font-medium text-ink-1" title={it.name}>
                      {it.name}{isEditing ? " ← กำลังแก้" : ""}
                    </span>
                    <span className="tabular-nums text-ink-2 shrink-0">฿{baht(it.perUnit * it.qty)}</span>
                    {hasRecipe ? (
                      <button onClick={() => editQuoteItem(it)} title="แก้ข้อนี้ (โหลดขนาด/option ที่บันทึกไว้กลับเข้าเครื่องคิด)"
                        className="press px-1.5 py-1 rounded hover:bg-white">✏️</button>
                    ) : (
                      <span title="ข้อนี้ไม่มีสูตรบันทึกไว้ (พิมพ์มือ/ใบเก่า/ค่าบริการ) — แก้ข้อความ/ราคาในฟอร์มด้านล่างได้"
                        className="px-1.5 py-1 opacity-25 cursor-not-allowed">✏️</span>
                    )}
                    <button onClick={() => copyQuoteItem(it.key)} title="ก็อปข้อนี้ (พร้อมสูตร)" className="press px-1.5 py-1 rounded hover:bg-white">📋</button>
                    <button onClick={() => moveQuoteItem(it.key, -1)} disabled={i === 0} title="เลื่อนขึ้น"
                      className="press px-1 py-1 rounded hover:bg-white disabled:opacity-25">▲</button>
                    <button onClick={() => moveQuoteItem(it.key, 1)} disabled={i === quote.length - 1} title="เลื่อนลง"
                      className="press px-1 py-1 rounded hover:bg-white disabled:opacity-25">▼</button>
                    <button onClick={() => { removePreviewItem(it.key); if (editingKey === it.key) setEditingKey(null); }} title="ลบข้อนี้"
                      className="press px-1 py-1 rounded text-red-500 hover:bg-red-50">✕</button>
                  </div>
                );
              })}
            </Card>
          )}

          {/* dialog บันทึกกลับใบเดิม — เลือกว่าการแก้ครั้งนี้นับเป็น Rev ไหม (0093) */}
          {saveOpen && editingQ && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true">
              <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-bold text-brand-dark">บันทึกกลับ {editingQ.code}</h3>
                <div className="flex flex-col gap-1.5 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="c40rev" checked={revAction === "none"} onChange={() => setRevAction("none")} />
                    <span>บันทึกทับเฉยๆ (ไม่นับ Rev)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="c40rev" checked={revAction === "rev"} onChange={() => setRevAction("rev")} />
                    <span>ขึ้น Rev ใหม่ <span className="text-xs text-gray-400">(ป้ายขึ้นบนใบ)</span></span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="c40rev" checked={revAction === "rev_keep"} onChange={() => setRevAction("rev_keep")} />
                    <span>ขึ้น Rev ใหม่ + เก็บฉบับเดิมเป็นประวัติ</span>
                  </label>
                  {revAction !== "none" && (
                    <label className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500 shrink-0">ป้าย Rev</span>
                      <input type="text" value={revLabel} onChange={(e) => setRevLabel(e.target.value)} maxLength={40}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none" />
                    </label>
                  )}
                </div>
                {saveErr && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{saveErr}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setSaveOpen(false)} disabled={saveBusy}
                    className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
                  <button onClick={saveBackToQuotation} disabled={saveBusy}
                    className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 flex items-center justify-center gap-2">
                    {saveBusy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                    บันทึก
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* footer (VAT/ส่วนลด/หัก ณ ที่จ่าย) + ค่าบริการเพิ่มเติม */}
          <Card className="p-3 no-print space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="block"><span className="text-xs font-medium text-ink-3">ภาษีมูลค่าเพิ่ม</span>
                <select value={qVat} onChange={(e) => setQVat(Number(e.target.value))} className="w-full glass-soft rounded-lg px-2 py-2 mt-1 outline-none">
                  <option value={7}>คิด VAT 7%</option><option value={0}>ไม่คิด VAT</option></select></label>
              <label className="block"><span className="text-xs font-medium text-ink-3">หัก ณ ที่จ่าย</span>
                <select value={qWht} onChange={(e) => setQWht(Number(e.target.value))} className="w-full glass-soft rounded-lg px-2 py-2 mt-1 outline-none">
                  <option value={0}>ไม่หัก</option><option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option></select></label>
              {/* ส่วนลดหลายรายการ (0105) — กด "+ เพิ่มส่วนลด" ได้หลายข้อ · แต่ละข้อ % หรือ บาท */}
              <div className="col-span-2">
                <DiscountLinesEditor subtotal={previewSubtotal} lines={qDiscounts} onChange={setQDiscounts} />
              </div>
            </div>
            <div>
              <button onClick={() => setSvcOpen((v) => !v)} className="press text-sm font-semibold text-brand-dark inline-flex items-center gap-1.5">
                <Icon name="plus" size={15} /> ค่าบริการเพิ่มเติม (ทั้งใบ) {svcOpen ? "▲" : "▼"}
                {svcResult.total > 0 && <span className="text-xs font-normal text-ink-3">· ฿{baht(svcResult.total)}</span>}
              </button>
              {svcOpen && (
                <div className="mt-2 rounded-xl border border-brand/15 bg-black/[0.02] p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm text-ink-1">
                    <input type="checkbox" checked={svc.inBKK} onChange={(e) => setSvc((s) => ({ ...s, inBKK: e.target.checked }))} />
                    งานในกรุงเทพฯ/ปริมณฑล <span className="text-xs text-ink-3">(ยอด &gt; 20,000 → ฟรีนั่งร้าน+เดินทาง)</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <Field label="นั่งร้าน: ชั้น" value={String(svc.floors || "")} onChange={(v) => setSvc((s) => ({ ...s, floors: Number(v) || 1 }))} />
                    <Field label="เดินทาง (กม.)" value={String(svc.travelKm || "")} onChange={(v) => setSvc((s) => ({ ...s, travelKm: Number(v) || 0 }))} />
                    <Field label="ที่พัก (บาท)" value={String(svc.lodging || "")} onChange={(v) => setSvc((s) => ({ ...s, lodging: Number(v) || 0 }))} />
                    <Field label="ขนส่ง (บาท)" value={String(svc.shipping || "")} onChange={(v) => setSvc((s) => ({ ...s, shipping: Number(v) || 0 }))} />
                    <Field label="ค่าไฟหน้างาน" value={String(svc.power || "")} onChange={(v) => setSvc((s) => ({ ...s, power: Number(v) || 0 }))} />
                    <Field label="ความเสี่ยง (บาท)" value={String(svc.risk || "")} onChange={(v) => setSvc((s) => ({ ...s, risk: Number(v) || 0 }))} />
                    <Field label="รื้อหลังคาเดิม (จุด)" value={String(svc.demoRoofPts || "")} onChange={(v) => setSvc((s) => ({ ...s, demoRoofPts: Number(v) || 0 }))} />
                  </div>
                  {svcResult.waivedNote && <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">✓ {svcResult.waivedNote}</p>}
                </div>
              )}
            </div>
            {showCost && quote.length > 0 && (
              <p className="text-xs text-ink-3">ทุนรวม ฿{baht(quoteCost)} · กำไรรวม ฿{baht(quoteTotal - quoteCost)}</p>
            )}
            <p className="text-[11px] text-ink-3">แก้ชื่อ/รายละเอียด/จำนวน/ราคา ได้ในฟอร์มด้านล่างเลย · กด &quot;ออกใบเสนอราคา&quot; เพื่อบันทึกเข้าระบบ (ออกเลขเอกสาร)</p>
          </Card>

          {/* พรีวิวฟอร์ม A4 จริง (แก้ข้อความ inline) · ย่อพอดีคอลัมน์บนจอกว้าง (zoom) */}
          <div className="qfp-scale overflow-x-auto rounded-xl bg-gray-100 p-2 2xl:p-3">
            <QuoteFormPreview
              items={previewItems}
              onEdit={editPreviewItem}
              onRemove={removePreviewItem}
              customer={previewCustomer}
              issueDate={issueDate}
              vatRate={qVat}
              discountAmt={discountBaht}
              discounts={qDiscounts}
              whtRate={qWht}
            />
          </div>
        </div>{/* /ขวา */}
      </div>{/* /split view */}

      {/* (เดิม) รายการที่คิดไว้แบบตาราง — แทนที่ด้วยฟอร์มจริงทางขวาแล้ว (ปิดไว้) */}
      {false && quote.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-brand-dark">🧾 รายการที่คิดไว้ ({quote.length})</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={sendToQuotation}
                className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand shadow-brand">
                <Icon name="file" size={15} /> ออกใบเสนอราคา →
              </button>
              <button onClick={printQuote} className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold glass-soft text-ink-2">
                <Icon name="printer" size={15} /> พิมพ์ (ร่าง)
              </button>
              <button onClick={() => setQuote([])} className="press text-xs text-ink-3 hover:text-red-600 px-2">ล้างทั้งหมด</button>
            </div>
          </div>

          {/* ── ค่าบริการเพิ่มเติมทั้งใบ (พาริตี้ R3.9) ── */}
          <div className="mb-3">
            <button onClick={() => setSvcOpen((v) => !v)}
              className="press text-sm font-semibold text-brand-dark inline-flex items-center gap-1.5">
              <Icon name="plus" size={15} /> ค่าบริการเพิ่มเติม (ทั้งใบ) {svcOpen ? "▲" : "▼"}
              {svcResult.total > 0 && <span className="text-xs font-normal text-ink-3">· ฿{baht(svcResult.total)}</span>}
            </button>
            {svcOpen && (
              <div className="mt-2 rounded-xl border border-brand/15 bg-black/[0.02] p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-ink-1">
                  <input type="checkbox" checked={svc.inBKK} onChange={(e) => setSvc((s) => ({ ...s, inBKK: e.target.checked }))} />
                  งานในกรุงเทพฯ/ปริมณฑล <span className="text-xs text-ink-3">(ยอด &gt; 20,000 → ฟรีค่านั่งร้าน+เดินทาง)</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Field label="นั่งร้าน: จำนวนชั้น" value={String(svc.floors || "")} onChange={(v) => setSvc((s) => ({ ...s, floors: Number(v) || 1 }))} />
                  <Field label="เดินทาง (กม.)" value={String(svc.travelKm || "")} onChange={(v) => setSvc((s) => ({ ...s, travelKm: Number(v) || 0 }))} />
                  <Field label="ค่าที่พัก (บาท)" value={String(svc.lodging || "")} onChange={(v) => setSvc((s) => ({ ...s, lodging: Number(v) || 0 }))} />
                  <Field label="ขนส่ง (บาท)" value={String(svc.shipping || "")} onChange={(v) => setSvc((s) => ({ ...s, shipping: Number(v) || 0 }))} />
                  <Field label="ค่าไฟหน้างาน (บาท)" value={String(svc.power || "")} onChange={(v) => setSvc((s) => ({ ...s, power: Number(v) || 0 }))} />
                  <Field label="ความเสี่ยง (บาท)" value={String(svc.risk || "")} onChange={(v) => setSvc((s) => ({ ...s, risk: Number(v) || 0 }))} />
                  <Field label="รื้อหลังคาเดิม (จุด)" value={String(svc.demoRoofPts || "")} onChange={(v) => setSvc((s) => ({ ...s, demoRoofPts: Number(v) || 0 }))} />
                </div>
                {svcResult.waivedNote && <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">✓ {svcResult.waivedNote}</p>}
                {svcResult.total > 0 && <p className="text-sm font-semibold text-brand-dark">รวมค่าบริการ ฿{baht(svcResult.total)}</p>}
              </div>
            )}
          </div>

          <div className="overflow-x-auto glass-soft rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 text-xs border-b border-black/5">
                  <th className="px-3 py-2 font-medium">รายการ</th>
                  <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                  <th className="px-3 py-2 font-medium text-right">ราคา/ชุด</th>
                  <th className="px-3 py-2 font-medium text-right">รวม</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {quote.map((it) => (
                  <tr key={it.key} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.name}</div>
                      <textarea
                        value={it.desc}
                        onChange={(e) => setQuote((q) => q.map((x) => x.key === it.key ? { ...x, desc: e.target.value } : x))}
                        rows={Math.max(3, (it.desc.match(/\n/g)?.length ?? 0) + 1)}
                        placeholder={"รายละเอียด (เว้นบรรทัดได้ · แต่ละบรรทัด = บุลเล็ต)\nรายละเอียดงาน\n- สีอลูมิเนียม: ...\n- กระจก: ..."}
                        className="w-full mt-1 glass-soft rounded-lg px-2 py-1.5 text-xs text-ink-2 leading-relaxed outline-none resize-y"
                        aria-label={`แก้รายละเอียด ${it.name}`}
                      />
                      <OptionAdder detail={it.desc} onChange={(v) => setQuote((q) => q.map((x) => x.key === it.key ? { ...x, desc: v } : x))} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{baht(it.perUnit)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{baht(it.perUnit * it.qty)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setQuote((q) => q.filter((x) => x.key !== it.key))} className="text-ink-3 hover:text-red-600"><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={svcResult.total > 0 ? "font-medium text-ink-2" : "font-bold"}>
                  <td className="px-3 py-2.5" colSpan={3}>{svcResult.total > 0 ? "รวมค่าสินค้า/งาน (รวมติดตั้ง)" : "รวมทั้งสิ้น (รวมติดตั้ง)"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">฿{baht(quoteTotal)}</td>
                  <td></td>
                </tr>
                {svcResult.lines.filter((l) => l.amount > 0).map((l, idx) => (
                  <tr key={idx} className="text-xs text-ink-2">
                    <td className="px-3 py-1" colSpan={3}>+ {l.name}</td>
                    <td className="px-3 py-1 text-right tabular-nums">฿{baht(l.amount)}</td>
                    <td></td>
                  </tr>
                ))}
                {svcResult.total > 0 && (
                  <tr className="font-bold border-t border-black/10">
                    <td className="px-3 py-2.5" colSpan={3}>รวมทั้งสิ้น (สินค้า + บริการ)</td>
                    <td className="px-3 py-2.5 text-right text-brand-dark tabular-nums">฿{baht(grandTotal)}</td>
                    <td></td>
                  </tr>
                )}
                {showCost && (
                  <tr className="text-xs text-ink-3">
                    <td className="px-3 pb-2" colSpan={3}>ทุนรวม ฿{baht(quoteCost)} · กำไรรวม ฿{baht(quoteTotal - quoteCost)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-ink-3 mt-2">* ร่างสำหรับคิดราคาหน้างาน — ออกใบเสนอราคาจริง (มีเลขเอกสาร/หัวบิล) ที่เมนูใบเสนอราคา</p>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, onChange, narrow, placeholder }: { label: string; value: string; onChange: (v: string) => void; narrow?: boolean; placeholder?: string }) {
  return (
    <label className={`block ${narrow ? "w-28" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <input type="number" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none tabular-nums" />
    </label>
  );
}

// ช่องกรอกหน่วย "เมตร" ที่ผูกกับ state หน่วย ซม. (สำหรับหลังคา — เจ้าของขอกรอกเป็นเมตร)
//   เก็บ buffer เมตรในตัวเอง (พิมพ์ทศนิยม "4." ได้) · แปลง ×100 → ซม. ก่อนยัดเข้า state (engine ไม่แตะ · parity ไม่พัง)
function MetersField({ label, cm, onCm }: { label: string; cm: string; onCm: (cm: string) => void }) {
  const toM = (c: string) => (c === "" ? "" : String(Number(c) / 100));
  const [txt, setTxt] = useState(toM(cm));
  useEffect(() => {
    const m = toM(cm);
    // อัปเดต buffer เมื่อ cm เปลี่ยนจากภายนอก (สลับรุ่น/โหลดสูตร) แต่คงไว้ถ้ากำลังพิมพ์ค่าเดียวกัน (เช่น "4.")
    setTxt((prev) => (prev !== "" && Number(prev) === Number(m) ? prev : m));
  }, [cm]);
  return (
    <Field label={label} value={txt} onChange={(v) => { setTxt(v); onCm(v === "" ? "" : String(Math.round((Number(v) || 0) * 100))); }} />
  );
}

function Select({ label, value, onChange, opts, labels, disabled }: {
  label: string; value: string; onChange: (v: string) => void; opts: string[]; labels?: Record<string, string>; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className={disabled ? "text-xs font-medium text-ink-3/40" : "text-xs font-medium text-ink-3"}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none disabled:opacity-40 disabled:cursor-not-allowed">
        {opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </label>
  );
}

// เลือกกระจกแบบจัดหมวด (optgroup: ทั่วไป/เทมเปอร์/ลามิเนต/อินซูเลท/ดัดโค้ง/อื่นๆ) — พาริตี้ drill-down R3.9
function GlassSelect({ label, value, onChange, opts }: {
  label: string; value: string; onChange: (v: string) => void; opts: string[];
}) {
  const groups = useMemo(() => groupGlass(opts), [opts]);
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-3">{label} <span className="text-ink-3/70 font-normal">({opts.length} รุ่น · จัดหมวด)</span></span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
        {groups.map((g) => (
          <optgroup key={g.cat} label={g.cat}>
            {g.items.map((o) => <option key={o} value={o}>{o}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
