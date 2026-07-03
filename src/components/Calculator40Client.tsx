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
import { baht } from "@/lib/money";
import type { Customer } from "@/lib/types";
// @ts-expect-error — engine เป็น ESM JS ล้วน (คงไฟล์เดิมเป๊ะเพื่อ parity 63/63)
import { computeCost } from "@/lib/calculator40/engine.mjs";
// @ts-expect-error — products เป็น ESM JS ล้วน
import { PRODUCTS, PRODUCTS_TODO } from "@/lib/calculator40/products.mjs";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";
import { applyPriceOverride, type PriceOverride } from "@/lib/calculator40/stock-link";
// @ts-expect-error — bootstrap เป็น ESM JS ล้วน (ก๊อปตรงจาก mockup index.html script ฝัง — ห้ามแก้กติกา)
import { applyBootstrap } from "@/lib/calculator40/bootstrap.mjs";
// @ts-expect-error — r39-data เป็นไฟล์ข้อมูล .json ที่ดึงจาก mockup (ราคาขาย R3.9 fallback)
import R39DATA from "@/lib/calculator40/r39-data.json";
// @ts-expect-error — mosquito helper เป็น ESM JS ล้วน
import { computeMosquitoR4 } from "@/lib/calculator40/mosquito.mjs";
import AddonsSection from "@/components/calculator40/AddonsSection";
import { ALU_COLOR_KEYS, ALU_COLOR_LABEL, resolveAluColor } from "@/lib/calculator40/alu-colors";
import SubPanesSection, { subDesc, subPrice, type SubPane } from "@/components/calculator40/SubPanesSection";
import RoomComposer, { type RoomTotals } from "@/components/calculator40/RoomComposer";

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

type QuoteItem = {
  key: number;
  name: string;
  desc: string;       // ขนาด/รูปแบบ/สี/กระจก
  qty: number;        // จำนวนชุด
  perUnit: number;    // ราคาขาย+ติดตั้ง/ชุด
  cost: number;       // ทุน/ชุด (ไว้ดูกำไรรวม)
  prodId?: string;    // (เฟส B) product_id → สถิติ
  groupLabel?: string;// (เฟส B) หมวด → สถิติ
};

type CustomerOption = Pick<Customer, "id" | "name" | "job" | "phone" | "address" | "contact_person">;

export default function Calculator40Client({ customers = [], priceOverride }: { customers?: CustomerOption[]; priceOverride?: PriceOverride | null }) {
  const router = useRouter();
  // ผูกลูกค้าจากทะเบียน (เฟส B)
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const custRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (custRef.current && !custRef.current.contains(e.target as Node)) setCustOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  // pricebook = โครงสร้าง/สูตร + ราคาจริงจากสต๊อก (ทับด้วย priceOverride ตอนโหลด → ลิงค์สดกับหน้า stock)
  // แก้ ⚙️ ในหน้า = in-memory ชั่วคราว (รีเฟรชกลับค่าสต๊อก) — แก้ราคาถาวรทำที่หน้า stock
  const [pb, setPb] = useState<any>(() => applyPriceOverride(JSON.parse(JSON.stringify(PRICEBOOK)), priceOverride));
  const [group, setGroup] = useState(1);
  const [prodId, setProdId] = useState<string>("sms_slide");
  const [showCost, setShowCost] = useState(false);   // โหมดดูทุน/กำไร
  const [adminOpen, setAdminOpen] = useState(false); // แผงแก้ราคา
  const [linesOpen, setLinesOpen] = useState(false);

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
  const [profit, setProfit] = useState("100");
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
  // G1 ผสมบาน — เพิ่มบานหลายชนิดในชุดเดียว (คิดราคาตามชนิดจริง สี/กระจกตามบานหลัก) ตรง app.js SUB_GROUPS/renderSubPanes
  const [subs, setSubs] = useState<SubPane[]>([]);
  // G6 ห้องกระจก (composite) — RoomComposer คิดราคาเองทั้งก้อน (ผลรวมด้าน+ฝ้า+หลังคา) แล้ว callback กลับมาที่นี่
  const [roomTotals, setRoomTotals] = useState<RoomTotals | null>(null);

  // ใบเสนอราคาอย่างย่อ
  const [quote, setQuote] = useState<QuoteItem[]>([]);
  const [keySeq, setKeySeq] = useState(1);

  const prod: any = (PRODUCTS as any)[prodId];
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

  function pickProduct(x: any) {
    setProdId(x.id);
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
    setSubs([]); // เปลี่ยนรุ่น → เคลียร์บานย่อย (ผสมบานผูกกับบานหลักที่กำลังตั้งค่าอยู่)
  }

  // จำนวนบานเลื่อน/เปิดจริง (หักบานติดตาย) — ใช้เป็น default จำนวนบานมุ้ง (ตรง app.js c.p - c.fixedPanes)
  const movePanes = Math.max(1, (Number(p) || prod?.defaults?.p || 1) - (fixedPanes || 0));

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
        const opts: string[] = (o.optsByMaterial && o.optsByMaterial[material]) || o.opts;
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
        sell: { beforeLabor: roomTotals.total, mfgOnly: roomTotals.total, withInstall: roomTotals.total },
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
      const profitPct = Number(profit) || 100;
      // สีอลู: ผู้ใช้เลือก "ชื่อสีจริง" (13 สี) → แปลงเป็นหมวดค่าอบ (bake) สำหรับคิดราคา + ชื่อสีพิมพ์ลงใบ
      const rc = resolveAluColor(color);
      const opt: any = {
        w: wCm,
        h: hCm,
        p: pCount,
        form: formVal,
        color: rc.bake,
        colorName: rc.label,
        profitPct,
        spec,
        addons,
      };
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
          const amt = subPrice(s, pb, rc.bake, glassType, profitPct);
          if (amt <= 0) return;
          sl.push({ desc: subDesc(s), amt });
          sSell += amt;
          sCost += Math.round(amt / (1 + (profitPct || 100) / 100)); // ทุนบานย่อย ≈ ถอดจาก markup ปัจจุบัน (ตรง app.js sellToCost)
        });
      }
      // ── หลังคาหลายช่วง (ขยัก) — ช่วงเพิ่ม คิด computeCost ต่อช่วงจริง (วัสดุ/สีตามช่วงหลัก) ตรง app.js calc() บรรทัด 246-256 ──
      if (prod.roofSegments && roofSegs.length) {
        roofSegs.forEach((sg, i) => {
          const sw = (+sg.w || 0) * 100, sh = (+sg.h || 0) * 100;
          if (!(sw > 0 && sh > 0)) return;
          const sr: any = computeCost(pb, prod, {
            w: sw, h: sh, p: 1, form: formVal, material, color: rc.bake, addons: {}, profitPct, installProfitPct: profitPct,
          });
          sl.push({ desc: `หลังคาช่วง ${i + 2} (${sg.w || 0}×${sg.h || 0}ม. · ${material})`, amt: sr.sell.withInstall });
          sSell += sr.sell.withInstall;
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
  }, [pb, prod, w, h, p, form, color, glassType, material, spec, profit, addons, fixedPanes, kind, faceColorCode, depth, shelves, cabSides, sheetColor, roofSegs, subs, roomTotals]);

  const ok = result && !("error" in result);
  const glassKeys = useMemo(() => Object.keys((pb.GLASS ?? {}) as Record<string, number>), [pb]);

  function addToQuote() {
    if (!ok || !prod) return;
    const n = Math.max(1, Number(sets) || 1);
    // ห้องกระจก (G6 composite) — RoomComposer คิดราคารวมทั้งก้อนแล้ว ขึ้นใบเป็นรายการเดียว (แยกรายด้าน/ฝ้า/หลังคาอยู่ในหน้าสรุปของ composer)
    if (prod.composite) {
      const rt = roomTotals!;
      const sideDesc = rt.sides.map((s, i) => `ด้าน ${String.fromCharCode(65 + i)} ${baht(s)}฿`).join(", ");
      setQuote((q) => [...q, {
        key: keySeq, name: prod.name,
        desc: `${sideDesc}${rt.roof > 0 ? ` · หลังคา ${baht(rt.roof)}฿` : ""}${rt.ceil > 0 ? ` · ฝ้า ${baht(rt.ceil)}฿` : ""}`,
        qty: n, perUnit: rt.total, cost: 0,
        prodId: prod.id, groupLabel: "ห้องกระจก",
      }]);
      setKeySeq((k) => k + 1);
      return;
    }
    // subLines (ผสมบาน G1 + หลังคาหลายช่วง G3) — บวกรวมเข้ายอด/ทุน ของรายการเดียวกัน ตรง app.js (แยกจาก main แต่ไม่แยกบรรทัดในใบย่อยนี้)
    const subSell = (result as any).subSell || 0;
    const subCost = (result as any).subCost || 0;
    const subDescs: string[] = ((result as any).subLines || []).map((l: any) => l.desc);
    const desc = `${w}×${h} ซม.`
      + (prod.forms?.length ? ` · ${form}` : "")
      + ((Number(p) || 1) > 1 ? ` · ${p} บาน` : "")
      + ` · ${ALU_COLOR_LABEL[color] ?? COLOR_LABEL[color] ?? color}`
      + (glassType ? ` · ${glassType}` : "")
      + (material ? ` · ${material}` : "")
      + (subDescs.length ? ` · + ${subDescs.join(", ")}` : "");
    setQuote((q) => [...q, {
      key: keySeq, name: prod.name, desc, qty: n,
      perUnit: result.sell.withInstall + subSell, cost: result.cost.total + subCost,
      prodId: prod.id, groupLabel: GROUPS.find((g) => g.g === prod.group)?.label ?? "",
    }]);
    setKeySeq((k) => k + 1);
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
    const payload = {
      items: quote.map((it) => ({
        name: it.name,
        detail: it.desc,
        qty: it.qty,
        unit_price: it.perUnit,
        category: it.groupLabel ?? "",
        product_id: it.prodId ?? "",
      })),
      customer: selectedCustomer?.name ?? "",
      customer_id: customerId,
    };
    try { sessionStorage.setItem("jr_quote_items", JSON.stringify(payload)); } catch { /* ignore */ }
    router.push("/quotations/new?from=calc");
  }

  const quoteTotal = quote.reduce((s, it) => s + it.perUnit * it.qty, 0);
  const quoteCost = quote.reduce((s, it) => s + it.cost * it.qty, 0);

  function printQuote() {
    const rows = quote.map((it, i) =>
      `<tr><td>${i + 1}</td><td>${it.name}<div class="d">${it.desc}</div></td><td class="r">${it.qty}</td><td class="r">${baht(it.perUnit)}</td><td class="r">${baht(it.perUnit * it.qty)}</td></tr>`
    ).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ใบเสนอราคา (R4.0)</title><style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#1f2937}h2{color:#b3151d;margin:0 0 2px}
      table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#fdecec;color:#7d0f15}
      .r{text-align:right}.d{font-size:11px;color:#6b7280}.t{font-weight:700}
      .note{margin-top:14px;font-size:11px;color:#9ca3af}</style></head><body>
      <h2>ใบเสนอราคา (ร่าง — เครื่องคิดราคา 4.0)</h2>
      <div style="font-size:12px;color:#6b7280">ราคารวมติดตั้ง · ยังไม่ใช่เอกสารทางการ — ออกใบเสนอราคาจริงที่เมนูใบเสนอราคา</div>
      <table><thead><tr><th>#</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ราคา/ชุด</th><th class="r">รวม</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="t"><td colspan="4" class="r">รวมทั้งสิ้น</td><td class="r">฿${baht(quoteTotal)}</td></tr></tfoot></table>
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
                {glassKeys.filter((k) => k.toLowerCase().includes(glassSearch.toLowerCase())).slice(0, 25).map((k) => (
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

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── ซ้าย: เลือกกลุ่ม + รุ่น ── */}
        <Card className="p-4 lg:col-span-1">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {GROUPS.map((g) => (
              <button key={g.g} onClick={() => setGroup(g.g)}
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${group === g.g ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 max-h-[62vh] overflow-y-auto">
            {prodList.map((x: any) => (
              <button key={x.id} onClick={() => pickProduct(x)} aria-current={prodId === x.id}
                className={`press w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 ${prodId === x.id ? "text-white bg-brand shadow-brand" : "glass-soft hover:bg-white/70"}`}>
                <span className="text-lg">{x.icon ?? "▫️"}</span>
                <span className="font-semibold text-sm flex-1">{x.name}</span>
                {x.isR39Fallback && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${prodId === x.id ? "bg-white/25 text-white" : "bg-amber-100 text-amber-800"}`}>
                    R3.9
                  </span>
                )}
              </button>
            ))}
            {todoList.map((t: any, i: number) => (
              <div key={i} className="rounded-xl px-3 py-2 text-xs text-ink-3 border border-dashed border-gray-300">
                ⏳ {t.name} — ยังไม่ลงระบบ
              </div>
            ))}
            {prodList.length === 0 && todoList.length === 0 && <p className="text-sm text-ink-3 text-center py-4">กลุ่มนี้ยังไม่มีรุ่น</p>}
          </div>
        </Card>

        {/* ── ขวา: ฟอร์ม + ราคา ── */}
        <Card className="p-6 lg:col-span-2">
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
                      {([["roof", "สโลปทางเดียว (กันสาด)"], ["roof_gable", "จั่ว สโลป 2 ทาง"], ["roof_slide", "หลังคาเลื่อน"]] as [string, string][])
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
                  <Field label="กว้าง (ซม.)" value={w} onChange={setW} />
                  <Field label="สูง (ซม.)" value={h} onChange={setH} />
                  {(prod.maxP ?? 1) > 1 || (prod.defaults?.p ?? 1) > 1 ? (
                    <Field label={`จำนวนบาน${prod.minP ? ` (${prod.minP}–${prod.maxP})` : ""}`} value={p} onChange={setP} />
                  ) : <div />}
                  <Field label="กำไร %" value={profit} onChange={setProfit} />
                </div>
              )}
              {/* ห้องกระจก (G6) — ไม่มีกว้าง/สูง/บานระดับห้อง (กำหนดต่อบาน/ต่อด้านใน RoomComposer) แต่ยังต้องมีกำไร% + สี/กระจกหลัก (ทุกบานในห้องใช้ร่วมกัน) */}
              {prod.composite && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-4">
                  <Field label="กำไร %" value={profit} onChange={setProfit} />
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3">
                {prod.forms?.length > 0 && !prod.composite && (
                  <Select label="รูปแบบ" value={form} onChange={setForm} opts={prod.forms} />
                )}
                <Select label="สีอลูมิเนียม" value={color} onChange={setColor}
                  opts={ALU_COLOR_KEYS} labels={ALU_COLOR_LABEL} />
                {(prod.defGlass || prod.composite) && (
                  <Select label="กระจก (ทั้งห้อง)" value={glassType} onChange={setGlassType} opts={glassKeys} />
                )}
                {prod.materials?.length > 0 && (
                  <Select label="วัสดุ" value={material} onChange={setMaterial} opts={prod.materials} />
                )}
                {(prod.specOpts ?? []).map((o: any) => {
                  // optsByMaterial: ตัวเลือกล็อกตามวัสดุที่เลือก (เช่น สีผ้ามุ้ง — ผ้ากันแมวมีแต่สีขาว) ตรง app.js ~1468
                  const opts: string[] = (o.optsByMaterial && o.optsByMaterial[material]) || o.opts;
                  const val = opts.includes(spec[o.key]) ? spec[o.key] : (o.def && opts.includes(o.def) ? o.def : opts[0]);
                  return (
                    <Select key={o.key} label={o.label} value={val ?? ""} onChange={(v) => setSpec((s) => ({ ...s, [o.key]: v }))} opts={opts} />
                  );
                })}
              </div>

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
                  pb={pb}
                  mainColor={resolveAluColor(color).bake}
                  mainGlass={glassType}
                  profitPct={Number(profit) || 100}
                  onTotal={setRoomTotals}
                />
              )}

              {/* หลังคาหลายช่วง (ขยัก) — ช่วงเพิ่ม คิดวัสดุ/โครงตามขนาดจริง (วัสดุ/สีตามช่วงหลัก) รวมพื้นที่ในรายการเดียว
                  ตรง app.js renderRoofSegs ~1426-1440 */}
              {prod.roofSegments && (
                <div className="mt-4 space-y-2.5 rounded-2xl glass-soft p-4">
                  <div className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
                    🏠 หลังคาหลายช่วง (ขยัก) <span className="text-xs font-normal text-ink-3">(ช่วงเพิ่ม · รวมพื้นที่)</span>
                  </div>
                  <button type="button" onClick={() => setRoofSegs((s) => [...s, { w: 3, h: 2 }])}
                    className="press text-xs font-semibold rounded-full px-3.5 py-2 glass-soft text-ink-2 hover:bg-white/70">
                    ＋ เพิ่มช่วงหลังคา
                  </button>
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

              {/* ➕ ผสมบาน (G1) — เพิ่มบานหลายชนิดในชุดเดียว ตรง app.js renderSubPanes ~1356-1367 (ทุกรุ่น G1 ยกเว้นห้องกระจก composite) */}
              {prod.group === 1 && !prod.composite && (
                <SubPanesSection
                  subs={subs}
                  setSubs={setSubs}
                  pb={pb}
                  mainColor={resolveAluColor(color).bake}
                  mainGlass={glassType}
                  profitPct={Number(profit) || 100}
                />
              )}

              {/* ราคา (ห้องกระจก G6 มีการ์ดราคารวมของตัวเองใน RoomComposer แล้ว — ไม่ต้องซ้ำ) */}
              {!prod.composite && (ok ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl px-5 py-4 glass-soft">
                    <div className="text-xs font-medium text-ink-3">ขายผลิตอย่างเดียว</div>
                    <div className="text-2xl font-bold text-brand-dark">฿{baht(result.sell.mfgOnly)}</div>
                  </div>
                  <div className="rounded-2xl px-5 py-4 bg-brand text-white shadow-brand">
                    <div className="text-xs font-medium text-red-100">ขาย + ติดตั้ง</div>
                    <div className="text-3xl font-bold leading-tight">฿{baht(result.sell.withInstall)}</div>
                    <div className="text-[11px] text-red-100 mt-0.5">พื้นที่ {result.input.area} ตร.ม. · อลู {result.aluKg} กก.</div>
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
                    <span className="tabular-nums">฿{baht(result.sell.withInstall + ((result as any).subSell || 0))}</span>
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

              {/* เพิ่มลงรายการ */}
              <div className="mt-4 flex items-end gap-3">
                <Field label="จำนวน (ชุด)" value={sets} onChange={setSets} narrow />
                <button onClick={addToQuote} disabled={!ok}
                  className="press rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                  + เพิ่มลงรายการ
                </button>
              </div>
            </div>
          ) : (
            <p className="text-ink-3 text-center py-10">เลือกรุ่นทางซ้าย</p>
          )}
        </Card>
      </div>

      {/* ── รายการที่คิดไว้ (ใบเสนอราคาอย่างย่อ) ── */}
      {quote.length > 0 && (
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
                      <div className="text-xs text-ink-3">{it.desc}</div>
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
                <tr className="font-bold">
                  <td className="px-3 py-2.5" colSpan={3}>รวมทั้งสิ้น (รวมติดตั้ง)</td>
                  <td className="px-3 py-2.5 text-right text-brand-dark tabular-nums">฿{baht(quoteTotal)}</td>
                  <td></td>
                </tr>
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

function Select({ label, value, onChange, opts, labels }: {
  label: string; value: string; onChange: (v: string) => void; opts: string[]; labels?: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
        {opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </label>
  );
}
