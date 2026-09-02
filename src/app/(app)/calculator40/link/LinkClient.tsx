"use client";

/**
 * LinkClient — หน้ารวม "สโตร์ ↔ ใบตัด ↔ คิดราคา 4.0" (เจ้าของสั่ง 1 ก.ย.69)
 * ยุบ 2 หน้าเดิม (เทียบใบตัด + ตรวจผูกสโตร์) เป็นหน้าเดียว 1 แถว = 1 วัสดุ 3 ช่องความจริง
 * ดู docs/DESIGN-หน้าลิงก์รวม.md (โครง JSX อ้างอิง) + docs/SPEC-หน้าลิงก์รวม-สโตร์-ใบตัด-คิดราคา.md
 *
 * ขอบเขตที่ตัดออกจากดีไซน์เต็ม (บันทึกไว้ให้ผู้ทำต่อรู้ — ดู PR description):
 *   - ปุ่ม "ไล่ทุกรูปแบบ" แบบโต้ตอบ: เซิร์ฟเวอร์สุ่มหลายขนาด/รูปแบบรวมมาให้แล้วตั้งแต่โหลดหน้า (buildLinkRowsWithPricebook)
 *     ครอบคลุมของที่ใช้เฉพาะบางรูปแบบไปพอสมควรโดยไม่ต้องกดเพิ่ม
 *   - จำตัวกรองไว้ localStorage: ยังไม่ทำ (ใช้ useState ธรรมดา รีเฟรชแล้วรีเซ็ต)
 *   - ปุ่มสลับความหนาแน่น [แน่น|สบายตา]: ยังไม่ทำ (ใช้ความหนาแน่นเดียว "สบายตา")
 *   - มุม "ราคาต่อโล → ราคาต่อเส้น" / "กล่อง-ฉาก" ของหน้า stock-audit เดิม (AuditClient.tsx): ยังไม่ได้พอร์ตมา
 *     (SPEC หน้ารวมไม่ได้พูดถึง 2 มุมนี้ — ควรเพิ่มเป็นรอบถัดไปถ้ายังใช้งานอยู่ ไม่งั้นเข้าถึงไม่ได้อีกหลัง redirect)
 */
import { useMemo, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { cn } from "@/lib/format";
import { baht } from "@/lib/money";
import { api, ApiError } from "@/lib/api";
import { computeCost } from "@/lib/calculator40/engine.mjs";
import { PRODUCTS } from "@/lib/calculator40/products.mjs";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";
import { applyPriceOverride, type PriceOverride } from "@/lib/calculator40/stock-link";
import { applyLineOverrides, isSafeCalcExpr, pristineProducts, type LineOverride } from "@/lib/calculator40/line-overrides";
import { STATUS_LABEL, explainRow, type LinkRowFull, type LinkRowStatus, type LinkStockRow } from "@/lib/calculator40/link-rows";
import StockDrawer from "./StockDrawer";

/* ── ป้ายสถานะ 7 แบบ — อีโมจิ+คำมาคู่กันเสมอ (คำชุดเดียวกับรายงาน CSV เดิม ห้ามเปลี่ยน) ── */
const ST: Record<LinkRowStatus, { emoji: string; label: string; tone: "red" | "amber" | "sky" | "yellow" | "violet" | "gray" | "emerald"; bar: string }> = {
  // ⚠ ป้ายต้องบอก "มันผิดยังไง" ไม่ใช่บอกแค่ระดับความด่วน (เจ้าของท้วง 1 ก.ย.69:
  //   "แท็กที่ต้องลงมือ ที่ต้องคิด บอกตรง ๆ ไม่รู้เรื่องว่าต้องการให้ชั้นทำอะไร")
  fix: { emoji: "🔴", label: "จำนวน/รหัสไม่ตรงกัน", tone: "red", bar: "border-red-500" },
  add: { emoji: "🟠", label: "ใบตัดมี · คิดราคาไม่มี", tone: "amber", bar: "border-orange-400" },
  over: { emoji: "🔵", label: "คิดราคามี · ใบตัดไม่มี", tone: "sky", bar: "border-sky-400" },
  decide: { emoji: "🟡", label: "ยังไม่มีรหัสสโตร์", tone: "yellow", bar: "border-yellow-400" },
  untested: { emoji: "🟣", label: "ขนาดนี้ไม่ได้ใช้", tone: "violet", bar: "border-violet-400" },
  fyi: { emoji: "⚪", label: "ดูเฉย ๆ", tone: "gray", bar: "border-gray-300" },
  pass: { emoji: "✓", label: "ผ่าน", tone: "emerald", bar: "border-emerald-400" },
};
const STATUS_ORDER: LinkRowStatus[] = ["fix", "add", "over", "decide", "untested", "fyi"];
const MODE_PRESETS: { key: string; label: string; statuses: LinkRowStatus[] }[] = [
  { key: "todo", label: "ที่ต้องลงมือ 🔴🟠", statuses: ["fix", "add"] },
  { key: "think", label: "ที่ต้องคิด 🔵🟡", statuses: ["over", "decide"] },
  { key: "untested", label: "ยังไม่ได้ตรวจ 🟣", statuses: ["untested"] },
  { key: "all", label: "ทั้งหมด", statuses: [] },
];
const SECTION_ORDER = ["อลูมิเนียม", "กระจก", "อุปกรณ์/สิ้นเปลือง", "มีแต่ในใบตัด (อลู)", "มีแต่ในใบตัด"] as const;

/* เส้นแบ่ง 3 ก้อนความจริง — ลากลงมาทุกแถว ไม่ใช่แค่หัว */
const G = { calc: "border-l-2 border-brand/20", cut: "border-l-2 border-sky-300/60", stock: "border-l-2 border-emerald-300/60" };
const num = "px-2 py-2.5 text-right tabular-nums whitespace-nowrap";
const stick = "sticky z-10 bg-white/85 backdrop-blur";
/* ไม่ตรง = ทาแดงให้ทั้งสองช่อง ตาไม่ต้องเทียบเอง (กฎเดียวกับ sweep-compare.mjs: ต่างเกิน max(0.05,2%)) */
const numsDiffer = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) > Math.max(0.05, Math.abs(b) * 0.02);
const diff = (bad: boolean) => (bad ? " bg-red-50 text-red-800 font-bold ring-1 ring-red-200 rounded" : "");
const n1 = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

type Draft = { sku: string; qty: string; len: string; itemName: string; unit: string; price: string; isAdd: boolean };
const emptyDraft = (): Draft => ({ sku: "", qty: "", len: "", itemName: "", unit: "ชิ้น", price: "", isAdd: false });

export default function LinkClient({
  rows, stock, stockCount, priceOverride, canSeeCost, canEdit,
}: {
  rows: LinkRowFull[];
  stock: LinkStockRow[];
  stockCount: number;
  priceOverride: PriceOverride | null;
  canSeeCost: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const pb = useMemo(() => applyPriceOverride(JSON.parse(JSON.stringify(PRICEBOOK)), priceOverride), [priceOverride]);

  // ── ผลิตภัณฑ์ 54 รุ่น + ความคืบหน้าต่อรุ่น (จากข้อมูลทุกแถวที่เซิร์ฟเวอร์คำนวณมาให้) ──
  const productList = useMemo(() => {
    const m = new Map<string, { id: string; name: string; group: number; total: number; done: number; urgent: number }>();
    for (const r of rows) {
      const e = m.get(r.productId) ?? { id: r.productId, name: r.productName, group: r.productGroup, total: 0, done: 0, urgent: 0 };
      e.total++;
      if (r.reviewed || r.status === "pass") e.done++;
      if (r.status === "fix" || r.status === "add") e.urgent++;
      m.set(r.productId, e);
    }
    return [...m.values()].sort((a, b) => (b.urgent - a.urgent) || a.name.localeCompare(b.name, "th"));
  }, [rows]);

  const [prodId, setProdId] = useState<string>(() => productList.find((p) => p.urgent > 0)?.id ?? productList[0]?.id ?? "");

  // ── ตัวกรอง ──
  const [selectedStatuses, setSelectedStatuses] = useState<Set<LinkRowStatus>>(new Set());
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [hideCleared, setHideCleared] = useState(false);

  const toggleStatus = (s: LinkRowStatus) =>
    setSelectedStatuses((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const applyMode = (statuses: LinkRowStatus[]) => setSelectedStatuses(new Set(statuses));

  // ── ความคืบหน้ารวมทั้งระบบ (sticky ด้านบน) ──
  const totalRows = rows.length;
  const reviewedRows = rows.filter((r) => r.reviewed || r.status === "pass").length;
  const urgentRows = rows.filter((r) => r.status === "fix" || r.status === "add").length;
  const thinkRows = rows.filter((r) => r.status === "over" || r.status === "decide").length;
  const untestedRows = rows.filter((r) => r.status === "untested").length;

  // ── แถวของรุ่นที่เลือกอยู่ ──
  const productRows = useMemo(() => rows.filter((r) => r.productId === prodId), [rows, prodId]);
  const stockCategories = useMemo(() => [...new Set(stock.map((s) => s.category).filter(Boolean))].sort(), [stock]);

  const passRows = useMemo(() => productRows.filter((r) => r.status === "pass"), [productRows]);
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productRows.filter((r) => {
      if (r.status === "pass") return false;   // pass พับแยกไว้ท้ายตาราง
      if (selectedStatuses.size && !selectedStatuses.has(r.status)) return false;
      if (category && r.stockCategory !== category) return false;
      if (onlyOverridden && !r.override && !r.cutOverride) return false;
      if (hideCleared && r.reviewed) return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.calcSku.toLowerCase().includes(q) || r.cutSku.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [productRows, selectedStatuses, category, onlyOverridden, hideCleared, search]);

  const sections = useMemo(() => {
    const bySec = new Map<string, LinkRowFull[]>();
    for (const r of visibleRows) (bySec.get(r.section) ?? bySec.set(r.section, []).get(r.section)!).push(r);
    for (const arr of bySec.values()) arr.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    return SECTION_ORDER.filter((k) => bySec.has(k)).map((k) => ({
      key: k, label: k, rows: bySec.get(k)!,
      done: productRows.filter((r) => r.section === k && (r.reviewed || r.status === "pass")).length,
      total: productRows.filter((r) => r.section === k).length,
    }));
  }, [visibleRows, productRows]);

  // ── รุ่นถัดไปที่ยังไม่เคลียร์ ──
  function goNextUncleared() {
    const idx = productList.findIndex((p) => p.id === prodId);
    for (let i = 1; i <= productList.length; i++) {
      const cand = productList[(idx + i) % productList.length];
      if (cand.done < cand.total) { setProdId(cand.id); return; }
    }
  }

  // ── แก้ในที่ ──
  const [editing, setEditing] = useState<{ key: string; kind: "row" | "add" } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [confirm, setConfirm] = useState<{ row: LinkRowFull | null; draft: Draft; costBefore: number; costAfter: number; note: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // ── สโตร์ดรอว์เออร์ ──
  const [drawerSku, setDrawerSku] = useState<string | null>(null);
  const stockBySku = useMemo(() => {
    const m = new Map<string, LinkStockRow[]>();
    for (const s of stock) { const k = s.sku.toUpperCase(); if (!k) continue; (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    return m;
  }, [stock]);
  const usedByOf = (sku: string) => {
    const k = sku.toUpperCase();
    const seen = new Set<string>(); const out: { productId: string; productName: string }[] = [];
    for (const r of rows) {
      if ((r.calcSku || "").toUpperCase() !== k && (r.cutSku || "").toUpperCase() !== k) continue;
      if (seen.has(r.productId)) continue;
      seen.add(r.productId); out.push({ productId: r.productId, productName: r.productName });
    }
    return out;
  };

  function startEdit(r: LinkRowFull) {
    setEditing({ key: r.key, kind: "row" });
    setDraft({
      sku: r.override?.set_sku ?? r.cutOverride?.set_sku ?? r.calcSku ?? r.cutSku ?? "",
      qty: r.override?.set_qty ?? "",
      len: r.cutOverride?.set_len ?? "",   // ยาวตัดอยู่ override ฝั่ง cut (คนละแถวกับ override ฝั่ง calc)
      itemName: r.name, unit: r.calcUnit || r.cutUnit || "ชิ้น",
      price: r.override?.set_price != null ? String(r.override.set_price) : "", isAdd: false,
    });
    setErrMsg("");
  }
  function startAdd(sectionKey: string) {
    setEditing({ key: `__add__${sectionKey}`, kind: "add" });
    setDraft({ ...emptyDraft(), unit: sectionKey === "อลูมิเนียม" ? "เส้น" : "ชิ้น", isAdd: true });
    setErrMsg("");
  }
  function cancelEdit() { setEditing(null); setDraft(emptyDraft()); setErrMsg(""); }

  // ── พรีวิวผลกระทบทุน (คำนวณฝั่ง client ล้วน — ไม่ยิง API จนกว่าจะกด "บันทึกการแก้") ──
  const otherOverrides: LineOverride[] = useMemo(() => {
    const uniq = new Map<number, LineOverride>();
    for (const r of rows) if (r.override && r.override.product_id === prodId) uniq.set(r.override.id, r.override);
    return [...uniq.values()];
  }, [rows, prodId]);

  function previewCost(row: LinkRowFull | null, d: Draft): { before: number; after: number } | null {
    try {
      // ⚠ ต้องเทียบกับ "ต้นฉบับ" เสมอ — PRODUCTS อาจถูกหน้าคิดราคา 4.0 ทับด้วย override ไปแล้วในเซสชันเดียวกัน
      //   (QA รอบ 2 เจอ: เปิด /calculator40 ก่อนแล้วมาหน้านี้ → ส่วนต่างที่โชว์ผิดทั้งหมด)
      const BASE = pristineProducts(PRODUCTS as Record<string, any>);
      const prod = BASE[prodId];
      if (!prod) return null;
      const def = prod.defaults ?? { w: 200, h: 200, p: 1 };
      const opt = { w: def.w, h: def.h, p: def.p || 1, form: prod.defForm, color: "white", colorKey: "white" };
      const calcKey = row ? (row.calcSku || row.matchKey) : (d.sku || `name:${d.itemName}`);
      const others = otherOverrides.filter((o) => !(o.scope === "calc" && o.match_key === calcKey));
      const draftOv: LineOverride = {
        product_id: prodId, scope: "calc", match_key: calcKey,
        set_sku: d.sku || null, set_qty: d.qty || null, set_price: d.price ? Number(d.price) : null,
        is_added: d.isAdd, item_name: d.isAdd ? d.itemName : null, unit: d.isAdd ? d.unit : null,
      };
      const before = applyLineOverrides(BASE, others, "calc")[prodId];
      const after = applyLineOverrides(BASE, [...others, draftOv], "calc")[prodId];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any — computeCost เป็น .mjs ไม่มี type แคบ (เหมือนทั้งไฟล์ Calculator40Client.tsx)
      const bCost = (computeCost(pb, before, opt) as any)?.cost?.total ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aCost = (computeCost(pb, after, opt) as any)?.cost?.total ?? 0;
      return { before: Number(bCost) || 0, after: Number(aCost) || 0 };
    } catch { return null; }
  }

  function openConfirm() {
    if (!editing) return;
    const row = editing.kind === "row" ? productRows.find((r) => r.key === editing.key) ?? null : null;
    if (editing.kind === "add" && (!draft.itemName.trim() || !draft.price.trim())) {
      setErrMsg("เพิ่มรายการใหม่ต้องระบุ ชื่อรายการ และ ราคา อย่างน้อย"); return;
    }
    const preview = previewCost(row, draft);
    setConfirm({
      row, draft: { ...draft },
      costBefore: preview?.before ?? 0, costAfter: preview?.after ?? 0,
      note: preview ? "" : "รุ่นนี้พรีวิวทุนไม่ได้ (ขนาดตั้งต้นคำนวณไม่ผ่าน) — ยังบันทึกได้ตามปกติ",
    });
  }

  async function commitSave() {
    if (!confirm) return;
    setSaving(true); setErrMsg("");
    try {
      const row = confirm.row;
      const d = confirm.draft;
      // แถว "มีแต่ในใบตัด(อลู)" ไม่มีตัวตนฝั่งคิดราคาเลย — แก้รหัส/ยาวตัดของแถวนี้ต้องลง scope='cut' เท่านั้น
      //   (จำนวนฝั่งใบตัดไม่ให้แก้ตามสเปก — ต้องเช็คว่าคิดเกินไหม/เติมเข้าคิดราคาแทน ไม่ใช่ไปยำจำนวนดิบในใบตัด)
      const isCutOnlyRow = !!row && (row.section === "มีแต่ในใบตัด" || row.section === "มีแต่ในใบตัด (อลู)");

      if (isCutOnlyRow) {
        // ⚠ scope='cut' ต้องใช้ cutSpecId (คีย์ CUT_SPEC_BY_ID) เป็น product_id ไม่ใช่ prodId ของ PRODUCTS
        //   (คนละ namespace — ผูกผิดจะเขียนทับสูตรใบตัดรุ่นอื่นที่บังเอิญ id ชนกันเงียบ ๆ)
        if (!row!.cutSpecId) throw new Error("แถวนี้หาไฟล์ใบตัดของรุ่นนี้ไม่เจอ — บันทึกไม่ได้");
        const cutKey = row!.cutSku || row!.matchKey;
        await api.post("/calc-overrides", {
          product_id: row!.cutSpecId, scope: "cut", match_key: cutKey,
          match_name: row!.name || "",   // 0135 — รหัสเดียวใช้หลายบรรทัดได้ ต้องระบุชื่อกำกับ
          set_sku: d.sku || null, set_len: d.len || null,
        });
      } else {
        // scope='calc' — รหัส/จำนวน/ราคา (แถวที่มีตัวตนฝั่งคิดราคา หรือแถวเพิ่มใหม่)
        const matchKey = row ? (row.calcSku || row.matchKey) : (d.sku || `name:${d.itemName}`);
        await api.post("/calc-overrides", {
          product_id: prodId, scope: "calc", match_key: matchKey,
          match_name: row ? (row.name || "") : (d.itemName || ""),   // 0135
          set_sku: d.sku || null,
          set_qty: isSafeCalcExpr(d.qty) ? (d.qty || null) : null,
          set_price: d.price ? Number(d.price) : null,
          is_added: d.isAdd, item_name: d.isAdd ? d.itemName : null,
          unit: d.isAdd ? d.unit : null,
        });

        // ความยาวตัด (เฉพาะแถวที่มีตัวตนฝั่งใบตัดจริงด้วย) แยกบันทึกต่างหาก (คนละตาราง/คนละคีย์ในสูตร)
        //   ⚠ ไม่กรองสูตรซ้ำฝั่ง client — เซิร์ฟเวอร์กรองด้วย isSafeExpr อยู่แล้ว (compileCutExpr ใน line-overrides.ts)
        //   สูตรที่ไม่ผ่านด่านจะถอยไปใช้สูตรเดิมเงียบ ๆ ไม่ throw ไม่ทำใบตัดพัง
        //   ⚠ product_id ของฝั่งนี้ = cutSpecId (CUT_SPEC_BY_ID) ไม่ใช่ prodId (คนละ namespace เหมือนกัน)
        const cutKey = row ? (row.cutSku || row.matchKey) : "";
        if (!d.isAdd && row?.hasCutSpec && row?.cutSpecId && cutKey && d.len.trim()) {
          await api.post("/calc-overrides", { product_id: row.cutSpecId, scope: "cut", match_key: cutKey,
            match_name: row.name || "", set_len: d.len });
        }
      }

      setConfirm(null); setEditing(null); setDraft(emptyDraft());
      router.refresh();
    } catch (e) {
      setErrMsg(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  // แถวเดียวอาจมี override ทั้ง 2 ฝั่ง (calc คนละแถว DB กับ cut) — คืนค่าต้องลบทั้งคู่ ไม่งั้นเหลือค้างอีกฝั่ง
  async function revertOverride(r: LinkRowFull) {
    if (!r.override && !r.cutOverride) return;
    if (!window.confirm(`คืนค่าเดิมของ "${r.name}" ? (ลบการแก้ทั้งหมดที่ทำไว้กับบรรทัดนี้)`)) return;
    try {
      if (r.override) await api.del(`/calc-overrides/${r.override.id}`);
      if (r.cutOverride) await api.del(`/calc-overrides/${r.cutOverride.id}`);
      router.refresh();
    } catch (e) { setErrMsg(e instanceof ApiError ? e.message : "ลบไม่สำเร็จ"); }
  }

  async function toggleReviewed(r: LinkRowFull) {
    const isCutOnlyRow = r.section === "มีแต่ในใบตัด" || r.section === "มีแต่ในใบตัด (อลู)";
    try {
      if (isCutOnlyRow) {
        if (!r.cutSpecId) throw new Error("แถวนี้หาไฟล์ใบตัดของรุ่นนี้ไม่เจอ");
        await api.post("/calc-overrides/reviewed", {
          product_id: r.cutSpecId, scope: "cut", match_key: r.cutSku || r.matchKey, match_name: r.name || "", reviewed: !r.reviewed,
        });
      } else {
        await api.post("/calc-overrides/reviewed", {
          product_id: r.productId, scope: "calc", match_key: r.matchKey, match_name: r.name || "", reviewed: !r.reviewed,
        });
      }
      router.refresh();
    } catch (e) { setErrMsg(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); }
  }

  const skuDatalist = useMemo(() => [...new Set(stock.map((s) => s.sku).filter(Boolean))], [stock]);
  const skuHit = draft.sku ? stockBySku.get(draft.sku.toUpperCase())?.[0] : undefined;

  // CSV ทุกแถวทุกรุ่น (สร้างฝั่งเบราว์เซอร์ — ลอกแพตเทิร์นจากหน้า stock-audit เดิม) ให้ดาวน์โหลดไปกาเช็คนอกจอได้เหมือนเดิม
  function downloadCsv() {
    const head = ["รุ่น", "หมวด", "ชื่อรายการ", "รหัส (คิดราคา)", "จำนวน", "ราคา/หน่วย", "รวม ฿",
      "รหัส (ใบตัด)", "จำนวน (ใบตัด)", "ยาว/ชิ้น (ซม.)", "ชื่อในสโตร์", "ราคาในสโตร์", "คงเหลือ", "สถานะ", "ตรวจแล้ว"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => [r.productName, r.section, r.name, r.calcSku, r.calcQty ?? "", r.calcPrice ?? "", r.calcAmount ?? "",
      r.cutSku, r.cutQty ?? "", r.cutLenPerPiece ?? "", r.stockName ?? "", r.stockPrice ?? "", r.stockQty ?? "",
      STATUS_LABEL[r.status], r.reviewed ? "ตรวจแล้ว" : ""].map(esc).join(","));
    const csv = "﻿" + [head.map(esc).join(","), ...body].join("\r\n");   // BOM = Excel อ่านไทยออก
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `ลิงก์-สโตร์-ใบตัด-คิดราคา4.0-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      {/* แถบหัว sticky */}
      <div className="sticky top-0 z-30 -mx-3 sm:-mx-5 px-3 sm:px-5 py-3 glass rounded-b-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-brand-dark flex items-center gap-1.5">
            <Icon name="track" size={18} /> ลิงก์ สโตร์ ↔ ใบตัด ↔ คิดราคา 4.0
          </h1>
          <Link href="/calculator40" className="text-xs text-brand underline">← กลับคิดราคา</Link>
          {/* 2 มุมที่หน้านี้ยังไม่มี — ห้ามทิ้ง เจ้าของเคยย้ำเรื่อง "ขึ้นเรตต่อโลแล้วราคาไม่เด้งตาม" */}
          <Link href="/calculator40/stock-audit" className="text-xs text-brand underline"
            title="ราคาต่อโล → ราคาต่อเส้น · กล่อง/ฉาก ตามชื่อ+ขนาด+สี">
            มุมเสริม: ราคาต่อโล · กล่อง/ฉาก →
          </Link>
          {!canEdit && <Badge tone="gray">อ่านอย่างเดียว</Badge>}
          <button onClick={downloadCsv} className="press ml-auto min-h-[36px] rounded-lg px-3 text-xs font-semibold glass-soft text-ink-2">
            โหลด CSV ({rows.length.toLocaleString("th-TH")})
          </button>
          <span className="text-xs text-ink-3">สโตร์ {stockCount.toLocaleString("th-TH")} รายการ</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex-1 min-w-[160px] h-2 rounded-full bg-line/50 overflow-hidden flex">
            <div className="bg-emerald-500" style={{ width: `${totalRows ? (reviewedRows / totalRows) * 100 : 0}%` }} />
            <div className="bg-red-400" style={{ width: `${totalRows ? (urgentRows / totalRows) * 100 : 0}%` }} />
            <div className="bg-sky-400" style={{ width: `${totalRows ? (thinkRows / totalRows) * 100 : 0}%` }} />
            <div className="bg-violet-400" style={{ width: `${totalRows ? (untestedRows / totalRows) * 100 : 0}%` }} />
          </div>
          <span className="tabular-nums text-ink-2 font-medium">
            ตรวจแล้ว {reviewedRows.toLocaleString("th-TH")}/{totalRows.toLocaleString("th-TH")} ({totalRows ? Math.round((reviewedRows / totalRows) * 100) : 0}%)
          </span>
          <button onClick={goNextUncleared} className="press rounded-lg px-3 py-1.5 font-semibold text-brand-dark glass-soft min-h-[36px]">
            รุ่นถัดไปที่ยังไม่เคลียร์ →
          </button>
        </div>
      </div>

      {errMsg && <Card className="p-3 text-sm text-red-700 bg-red-50/60">{errMsg}</Card>}

      {/* ปุ่มโหมด */}
      <div className="flex flex-wrap gap-2">
        {MODE_PRESETS.map((m) => {
          const active = m.key === "all" ? selectedStatuses.size === 0 : m.statuses.every((s) => selectedStatuses.has(s)) && selectedStatuses.size === m.statuses.length;
          return (
            <button key={m.key} onClick={() => applyMode(m.statuses)}
              className={cn("press min-h-[40px] rounded-xl px-3.5 text-sm font-semibold",
                active ? "bg-brand text-white shadow-brand" : "glass-soft text-ink-2")}>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ไทล์นับ 7 สถานะ — เลือกได้หลายอัน */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((s) => {
          const count = productRows.filter((r) => r.status === s).length;
          const active = selectedStatuses.has(s);
          return (
            <button key={s} onClick={() => toggleStatus(s)}
              className={cn("press min-h-[36px] rounded-lg px-2.5 text-xs font-medium flex items-center gap-1",
                active ? "ring-2 ring-brand" : "", ST[s].tone === "gray" ? "bg-gray-100" : "")}>
              <Badge tone={ST[s].tone}>{ST[s].emoji} {ST[s].label} {count}</Badge>
            </button>
          );
        })}
      </div>

      {/* เลือกรุ่น + ตัวกรอง */}
      <Card className="p-3 sm:p-4">
        {/* ⚠ ต้องบอกเสมอว่า "ตัวเลขที่เห็นมาจากบานแบบไหน ขนาดเท่าไร" (เจ้าของท้วง 1 ก.ย.69:
            "มันไม่บอกขนาดและรูปแบบของบานที่ยกมาเป็น case study ... บางทีขนาดก็มีผลต่อสิ่งที่ใช้") */}
        {(() => {
          const cases = [...new Set(productRows.map((r) => r.sizeLabel).filter(Boolean))];
          if (!cases.length) return null;
          return (
            <div className="mb-3 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2">
              <div className="text-xs font-semibold text-amber-900">
                ตัวเลขข้างล่างมาจากการลองคิดจริง {cases.length} แบบ:
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {cases.map((c) => (
                  <span key={c} className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-mono text-amber-900 ring-1 ring-amber-200">{c}</span>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-amber-800">
                แต่ละแถวบอกกำกับไว้ว่ามาจากแบบไหน — ขนาด/รูปแบบต่างกัน ของที่ใช้ก็ต่างกัน
              </div>
            </div>
          );
        })()}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <label className="block sm:col-span-2 lg:col-span-2">
            <span className="text-xs font-medium text-ink-3">รุ่น ({productList.length})</span>
            <select value={prodId} onChange={(e) => setProdId(e.target.value)}
              className="mt-1 w-full min-h-[44px] glass-soft rounded-lg px-3 text-sm outline-none">
              {productList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.done >= p.total ? "🟢" : p.done > 0 ? "🟡" : "⚪"} {p.name} ({p.done}/{p.total})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-3">หมวดสโตร์</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full min-h-[44px] glass-soft rounded-lg px-3 text-sm outline-none">
              <option value="">ทั้งหมด</option>
              {stockCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-3">ค้นหา รหัส/ชื่อ</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="เช่น F7980"
              className="mt-1 w-full min-h-[44px] glass-soft rounded-lg px-3 text-sm outline-none" />
          </label>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs min-h-[44px]">
              <input type="checkbox" checked={onlyOverridden} onChange={(e) => setOnlyOverridden(e.target.checked)} className="w-5 h-5 accent-[#b3151d]" />
              เฉพาะที่แก้แล้ว
            </label>
            <label className="flex items-center gap-1.5 text-xs min-h-[44px]">
              <input type="checkbox" checked={hideCleared} onChange={(e) => setHideCleared(e.target.checked)} className="w-5 h-5 accent-[#b3151d]" />
              ซ่อนที่เคลียร์แล้ว
            </label>
          </div>
        </div>
      </Card>

      {/* ตารางหลัก (desktop/tablet) */}
      <Card className="p-3 sm:p-5 hidden md:block">
        <div className="overflow-auto max-h-[70vh] rounded-xl border border-line/60">
          <table className="w-full min-w-[1120px] text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20 text-brand-dark">
              <tr>
                <th className={cn(stick, "left-0 w-[150px] p-2 text-left")}>ตรวจ / สถานะ</th>
                <th className={cn(stick, "left-[150px] w-[240px] p-2 text-left")}>รายการ · รหัส</th>
                <th className={cn("bg-brand-soft p-2 text-center", G.calc)} colSpan={canSeeCost ? 3 : 1}>คิดราคา 4.0</th>
                <th className={cn("bg-sky-50 p-2 text-center", G.cut)} colSpan={2}>ใบตัด</th>
                <th className={cn("bg-emerald-50 p-2 text-center", G.stock)} colSpan={canSeeCost ? 3 : 2}>สโตร์</th>
                <th className="bg-white/85 p-2 w-[92px]" />
              </tr>
              <tr className="text-[11px] font-normal text-ink-3">
                <th className={cn(stick, "left-0 border-b border-line")} />
                <th className={cn(stick, "left-[150px] border-b border-line")} />
                <th className={cn("bg-brand-soft/60 px-2 pb-1.5 text-right border-b border-line", G.calc)}>จำนวน</th>
                {canSeeCost && <th className="bg-brand-soft/60 px-2 pb-1.5 text-right border-b border-line">฿/หน่วย</th>}
                {canSeeCost && <th className="bg-brand-soft/60 px-2 pb-1.5 text-right border-b border-line">รวม ฿</th>}
                <th className={cn("bg-sky-50/60 px-2 pb-1.5 text-right border-b border-line", G.cut)}>ชิ้น</th>
                <th className="bg-sky-50/60 px-2 pb-1.5 text-right border-b border-line">ยาว/ชิ้น (ซม.)</th>
                <th className={cn("bg-emerald-50/60 px-2 pb-1.5 text-left border-b border-line", G.stock)}>ชื่อจริงในสโตร์</th>
                {canSeeCost && <th className="bg-emerald-50/60 px-2 pb-1.5 text-right border-b border-line">฿/หน่วย</th>}
                <th className="bg-emerald-50/60 px-2 pb-1.5 text-right border-b border-line">คงเหลือ</th>
                <th className="bg-white/85 border-b border-line" />
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <Fragment key={sec.key}>
                  <tr>
                    <td colSpan={canSeeCost ? 11 : 9} className="bg-brand-soft/60 px-3 py-1.5 text-xs font-bold text-brand-dark">
                      {sec.label}
                      <span className="ml-2 font-normal text-ink-3">{sec.total} แถว · เคลียร์แล้ว {sec.done}</span>
                    </td>
                  </tr>

                  {sec.rows.map((r) => {
                    const isEditing = editing?.kind === "row" && editing.key === r.key;
                    const qtyBad = numsDiffer(r.calcQty, r.cutQty);
                    if (isEditing) return <EditRow key={r.key} row={r} draft={draft} setDraft={setDraft} canSeeCost={canSeeCost}
                      skuDatalist={skuDatalist} skuHit={skuHit} onCancel={cancelEdit} onConfirm={openConfirm} />;
                    return (
                      <tr key={r.key} className={cn("border-t border-line/60 hover:bg-brand-soft/40 align-middle",
                        r.reviewed && "opacity-60", (r.override || r.cutOverride) && "bg-sky-50/40")}>
                        <td className={cn(stick, "left-0 px-2 py-2 border-l-4", ST[r.status].bar)}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={r.reviewed} aria-label="ตรวจแล้ว" disabled={!canEdit}
                              onChange={() => toggleReviewed(r)} className="w-5 h-5 shrink-0 accent-[#b3151d] disabled:opacity-40" />
                            <Badge tone={ST[r.status].tone}>{ST[r.status].emoji} {ST[r.status].label}</Badge>
                          </label>
                        </td>
                        <td className={cn(stick, "left-[150px] px-2 py-2")}>
                          <div className="text-xs leading-snug">{r.name}</div>
                          {/* อธิบายเป็นประโยคว่าผิดตรงไหน + ให้ทำอะไร — ป้ายสีอย่างเดียวเจ้าของอ่านไม่ออกว่าต้องทำอะไร */}
                          {r.status !== "pass" && r.status !== "fyi" && (() => {
                            const ex = explainRow(r);
                            return (
                              <div className="mt-1 rounded-md bg-ink-1/[0.03] px-2 py-1 max-w-[420px]">
                                <div className="text-[11px] leading-snug text-ink-1">{ex.problem}</div>
                                {ex.todo && <div className="text-[11px] leading-snug text-brand-dark mt-0.5">→ {ex.todo}</div>}
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {r.calcSku || r.cutSku ? (
                              <button onClick={() => setDrawerSku(r.calcSku || r.cutSku)}
                                className="press font-mono text-xs text-brand-dark underline decoration-dotted underline-offset-2">
                                {r.calcSku || r.cutSku}
                              </button>
                            ) : <span className="font-mono text-xs text-ink-3">—</span>}
                            {/* บอกกำกับทุกแถวว่าตัวเลขนี้มาจากบานแบบไหน ขนาดเท่าไร */}
                            {r.sizeLabel && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-mono text-amber-900 ring-1 ring-amber-200">
                                {r.sizeLabel}
                              </span>
                            )}
                            {(r.override || r.cutOverride) && <Badge tone="sky">แก้แล้ว</Badge>}
                            {r.dupKeyInProduct && <span title="รหัสนี้ใช้ซ้ำหลายบรรทัดในรุ่นนี้ — ระบบแยกด้วยชื่อบรรทัดให้แล้ว แก้ได้ทีละบรรทัด"><Badge tone="gray">รหัสซ้ำ</Badge></span>}
                          </div>
                        </td>
                        <td className={cn(num, G.calc, diff(qtyBad))}>{r.calcQty ?? "—"}</td>
                        {canSeeCost && <td className={num}>{r.calcPrice != null ? baht(r.calcPrice) : "—"}</td>}
                        {canSeeCost && <td className={cn(num, "font-semibold")}>{r.calcAmount != null ? baht(r.calcAmount) : "—"}</td>}
                        <td className={cn(num, G.cut, diff(qtyBad))}>{r.cutQty ?? "—"}</td>
                        <td className={num}>{r.cutLenPerPiece != null ? n1(r.cutLenPerPiece) : "—"}</td>
                        <td className={cn("px-2 py-2 text-xs", G.stock)}>
                          {r.stockName ?? <span className="text-orange-700">⚠ ไม่มีในสโตร์</span>}
                        </td>
                        {canSeeCost && <td className={num}>{r.stockPrice != null ? baht(r.stockPrice) : "—"}</td>}
                        <td className={cn(num, (r.stockQty ?? 0) <= 0 && r.stockFound && "text-red-700 font-semibold")}>
                          {r.stockFound ? r.stockQty : "—"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {canEdit && (
                            <button onClick={() => startEdit(r)} aria-label="แก้ไขบรรทัดนี้"
                              className="press w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-3 hover:bg-brand-soft hover:text-brand-dark">
                              <Icon name="pencil" size={14} />
                            </button>
                          )}
                          {canEdit && (r.override || r.cutOverride) && (
                            <button onClick={() => revertOverride(r)} aria-label="คืนค่าเดิม"
                              className="press w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-3 hover:bg-brand-soft">
                              <Icon name="refresh" size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {canEdit && editing?.key === `__add__${sec.key}` && (
                    <EditRow row={null} draft={draft} setDraft={setDraft} canSeeCost={canSeeCost}
                      skuDatalist={skuDatalist} skuHit={skuHit} onCancel={cancelEdit} onConfirm={openConfirm} sectionLabel={sec.label} />
                  )}
                  {canEdit && (
                    <tr>
                      <td colSpan={canSeeCost ? 11 : 9} className="px-3 py-1.5">
                        <button onClick={() => startAdd(sec.key)} className="press text-xs font-semibold text-brand-dark inline-flex items-center gap-1 min-h-[36px]">
                          <Icon name="plus" size={13} /> เพิ่มบรรทัดในหมวด{sec.label}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!sections.length && (
                <tr><td colSpan={canSeeCost ? 11 : 9} className="px-3 py-6 text-center text-sm text-ink-3">ไม่มีแถวตรงกับตัวกรองที่เลือก</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {passRows.length > 0 && (
          <details className="mt-3">
            <summary className="press text-xs font-semibold text-brand-dark cursor-pointer">✓ ผ่าน {passRows.length} แถว — กดดู</summary>
            <div className="mt-2 overflow-auto max-h-[50vh] rounded-xl border border-line/60">
              <table className="w-full min-w-[1120px] text-sm border-separate border-spacing-0">
                <tbody>
                  {passRows.map((r) => (
                    <tr key={r.key} className="border-t border-line/60">
                      <td className="px-2 py-2 border-l-4 border-emerald-400 w-[150px]"><Badge tone="emerald">✓ ผ่าน</Badge></td>
                      <td className="px-2 py-2 w-[240px] text-xs">{r.name}
                        <div className="font-mono text-[11px] text-ink-3">{r.calcSku || r.cutSku || "—"}</div>
                      </td>
                      <td className={num}>{r.calcQty ?? "—"}</td>
                      {canSeeCost && <td className={num}>{r.calcAmount != null ? baht(r.calcAmount) : "—"}</td>}
                      <td className={num}>{r.cutQty ?? "—"}</td>
                      <td className="px-2 py-2 text-xs">{r.stockName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </Card>

      {/* การ์ดมือถือ */}
      <div className="space-y-2 md:hidden">
        {sections.map((sec) => (
          <div key={sec.key}>
            <div className="text-xs font-bold text-brand-dark bg-brand-soft/60 rounded-lg px-3 py-1.5 mb-1.5">
              {sec.label} <span className="font-normal text-ink-3">{sec.total} แถว · เคลียร์แล้ว {sec.done}</span>
            </div>
            <div className="space-y-2">
              {sec.rows.map((r) => (
                <MobileRowCard key={r.key} row={r} canSeeCost={canSeeCost} canEdit={canEdit}
                  onOpenSku={() => setDrawerSku(r.calcSku || r.cutSku)} onToggleReviewed={() => toggleReviewed(r)} onEdit={() => startEdit(r)} />
              ))}
            </div>
          </div>
        ))}
        {editing && (
          <Card className="p-3 bg-amber-50/60 ring-1 ring-amber-300">
            <MobileEditForm draft={draft} setDraft={setDraft} onCancel={cancelEdit} onConfirm={openConfirm} canSeeCost={canSeeCost} skuHit={skuHit} />
          </Card>
        )}
      </div>

      {/* ────────── modal ยืนยันผลกระทบ ────────── */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 scrim fade-in" onClick={() => !saving && setConfirm(null)} />
          <Card className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto p-5 slide-in rounded-t-3xl sm:rounded-2xl">
            <h2 className="font-bold text-brand-dark">ยืนยันการแก้ · {confirm.row?.name ?? confirm.draft.itemName}</h2>
            <table className="w-full mt-3 text-sm">
              <tbody>
                {confirm.draft.sku && confirm.draft.sku !== (confirm.row?.calcSku || confirm.row?.cutSku || "") && (
                  <tr><td className="py-1 text-ink-3">รหัส</td><td className="py-1 font-mono">{confirm.row?.calcSku || confirm.row?.cutSku || "—"}</td><td className="py-1">→</td><td className="py-1 font-mono font-semibold">{confirm.draft.sku}</td></tr>
                )}
                {confirm.draft.qty && (
                  <tr><td className="py-1 text-ink-3">จำนวน</td><td className="py-1">{confirm.row?.override?.set_qty ?? "(สูตรเดิม)"}</td><td className="py-1">→</td><td className="py-1 font-semibold">{confirm.draft.qty}</td></tr>
                )}
                {confirm.draft.len && (
                  <tr><td className="py-1 text-ink-3">ยาวตัด</td><td className="py-1">{confirm.row?.cutOverride?.set_len ?? "(สูตรเดิม)"}</td><td className="py-1">→</td><td className="py-1 font-semibold">{confirm.draft.len}</td></tr>
                )}
                {confirm.draft.isAdd && (
                  <>
                    <tr><td className="py-1 text-ink-3">ชื่อรายการ</td><td colSpan={3} className="py-1 font-semibold">{confirm.draft.itemName}</td></tr>
                    <tr><td className="py-1 text-ink-3">ราคา</td><td colSpan={3} className="py-1 font-semibold">฿{confirm.draft.price}</td></tr>
                  </>
                )}
              </tbody>
            </table>
            {canSeeCost && (
              <div className="mt-3 pt-3 border-t border-line/60 text-sm">
                <div className="flex justify-between"><span className="text-ink-3">ทุนรวมของรุ่นนี้ (ที่ขนาดตั้งต้น)</span></div>
                <div className="flex justify-between"><span>เดิม</span><span className="tabular-nums">฿{baht(confirm.costBefore)}</span></div>
                <div className="flex justify-between"><span>ใหม่</span><span className="tabular-nums">฿{baht(confirm.costAfter)}</span></div>
                <div className="flex justify-between font-bold">
                  <span>ต่าง</span>
                  <span className={cn("tabular-nums",
                    confirm.costAfter > confirm.costBefore ? "text-red-700" : confirm.costAfter < confirm.costBefore ? "text-emerald-700" : "text-ink-3")}>
                    {confirm.costAfter === confirm.costBefore ? "ไม่ขยับ" : `${confirm.costAfter > confirm.costBefore ? "+" : ""}฿${baht(Math.abs(confirm.costAfter - confirm.costBefore))}`}
                  </span>
                </div>
                {confirm.note && <p className="mt-1 text-[11px] text-amber-800">{confirm.note}</p>}
              </div>
            )}
            <p className="mt-3 text-[11px] text-ink-3 bg-brand-soft/50 rounded-lg px-3 py-2">
              ⓘ ใบเสนอที่ออกไปแล้วไม่กระทบ (เก็บสูตร/ราคาของตัวเองไว้ตอนออก)
            </p>
            {errMsg && <p className="mt-2 text-xs text-red-700">{errMsg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} disabled={saving} className="press min-h-[44px] rounded-xl px-4 text-sm glass-soft">ยกเลิก</button>
              <button onClick={commitSave} disabled={saving}
                className="press min-h-[44px] rounded-xl px-4 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-50">
                {saving ? "กำลังบันทึก…" : "บันทึกการแก้"}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ────────── drawer สโตร์ ────────── */}
      {drawerSku && (
        <StockDrawer sku={drawerSku} rows={stockBySku.get(drawerSku.toUpperCase()) ?? []} usedBy={usedByOf(drawerSku)}
          canSeeCost={canSeeCost} onClose={() => setDrawerSku(null)} onPickProduct={(id) => setProdId(id)} />
      )}
    </div>
  );
}

/* ── แถวโหมดแก้ (desktop) ── */
function EditRow({
  row, draft, setDraft, canSeeCost, skuDatalist, skuHit, onCancel, onConfirm, sectionLabel,
}: {
  row: LinkRowFull | null; draft: Draft; setDraft: (d: Draft) => void; canSeeCost: boolean;
  skuDatalist: string[]; skuHit: LinkStockRow | undefined; onCancel: () => void; onConfirm: () => void; sectionLabel?: string;
}) {
  const isAdd = !row;
  // แถว "มีแต่ในใบตัด*" ไม่มีตัวตนฝั่งคิดราคา — แก้ที่นี่ลง scope='cut' เท่านั้น (ไม่มีแนวคิด "จำนวน/ราคา" ฝั่งคิดราคาให้แก้)
  const isCutOnly = !!row && (row.section === "มีแต่ในใบตัด" || row.section === "มีแต่ในใบตัด (อลู)");
  return (
    <>
      <tr className="bg-amber-50/60 ring-1 ring-amber-300">
        <td className={cn(stick, "left-0 px-2 py-2 border-l-4 border-amber-400")}><Badge tone="amber">{isAdd ? `เพิ่มใน${sectionLabel}` : "กำลังแก้"}</Badge></td>
        <td className={cn(stick, "left-[150px] px-2 py-2")}>
          {isAdd ? (
            <input value={draft.itemName} onChange={(e) => setDraft({ ...draft, itemName: e.target.value })} placeholder="ชื่อรายการ"
              className="w-full min-h-[38px] glass-soft rounded-lg px-2 text-xs outline-none" />
          ) : <div className="text-xs">{row!.name}</div>}
          <input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} list="stock-skus" placeholder="รหัสสโตร์"
            className="mt-1 w-full min-h-[38px] glass-soft rounded-lg px-2 font-mono text-xs outline-none" />
          {draft.sku && (skuHit
            ? <p className="mt-1 text-[11px] text-emerald-700">✓ {skuHit.name} · คงเหลือ {skuHit.qty_on_hand}</p>
            : <p className="mt-1 text-[11px] text-amber-800">⚠ ไม่มีรหัสนี้ในสโตร์ — จะผูกกับของที่ไม่มีตัวตน</p>)}
          {isCutOnly && <p className="mt-1 text-[11px] text-ink-3">แถวนี้มีแต่ในใบตัด — แก้รหัส/ยาวตัดฝั่งใบตัดเท่านั้น</p>}
        </td>
        <td className={cn("px-2 py-2", G.calc)} colSpan={canSeeCost ? 3 : 1}>
          {isCutOnly ? <div className="text-center text-xs text-ink-3 py-2">— ไม่มีตัวตนฝั่งคิดราคา —</div> : (
            <>
              <input value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                className="w-full min-h-[38px] glass-soft rounded-lg px-2 text-sm text-right tabular-nums outline-none" placeholder="สูตรจำนวน" />
              {isAdd && (
                <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} type="number"
                  className="mt-1 w-full min-h-[38px] glass-soft rounded-lg px-2 text-sm text-right tabular-nums outline-none" placeholder="ราคา/หน่วย" />
              )}
            </>
          )}
        </td>
        <td className={cn("px-2 py-2", G.cut)} colSpan={2}>
          <input value={draft.len} onChange={(e) => setDraft({ ...draft, len: e.target.value })}
            className="w-full min-h-[38px] glass-soft rounded-lg px-2 text-sm text-right tabular-nums outline-none" placeholder="สูตรความยาวตัด (ซม.)" disabled={isAdd} />
        </td>
        <td colSpan={canSeeCost ? 4 : 3} />
      </tr>
      <tr className="bg-amber-50/60">
        <td colSpan={canSeeCost ? 11 : 9} className="px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={onCancel} className="press ml-auto min-h-[40px] rounded-xl px-4 text-sm glass-soft">ยกเลิก</button>
            <button onClick={onConfirm} className="press min-h-[40px] rounded-xl px-4 text-sm font-semibold text-white bg-brand shadow-brand">ตรวจผลกระทบ →</button>
          </div>
        </td>
      </tr>
      <datalist id="stock-skus">{skuDatalist.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

function MobileEditForm({
  draft, setDraft, onCancel, onConfirm, canSeeCost, skuHit,
}: { draft: Draft; setDraft: (d: Draft) => void; onCancel: () => void; onConfirm: () => void; canSeeCost: boolean; skuHit?: LinkStockRow }) {
  return (
    <div className="space-y-2">
      {draft.isAdd && (
        <input value={draft.itemName} onChange={(e) => setDraft({ ...draft, itemName: e.target.value })} placeholder="ชื่อรายการ"
          className="w-full min-h-[44px] glass-soft rounded-lg px-3 text-sm outline-none" />
      )}
      <input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="รหัสสโตร์"
        className="w-full min-h-[44px] glass-soft rounded-lg px-3 font-mono text-sm outline-none" />
      {draft.sku && (skuHit
        ? <p className="text-[11px] text-emerald-700">✓ {skuHit.name} · คงเหลือ {skuHit.qty_on_hand}</p>
        : <p className="text-[11px] text-amber-800">⚠ ไม่มีรหัสนี้ในสโตร์</p>)}
      <input value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} placeholder="สูตรจำนวน"
        className="w-full min-h-[44px] glass-soft rounded-lg px-3 text-sm outline-none" />
      <input value={draft.len} onChange={(e) => setDraft({ ...draft, len: e.target.value })} placeholder="สูตรความยาวตัด (ซม.)" disabled={draft.isAdd}
        className="w-full min-h-[44px] glass-soft rounded-lg px-3 text-sm outline-none disabled:opacity-40" />
      {draft.isAdd && canSeeCost && (
        <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} type="number" placeholder="ราคา/หน่วย"
          className="w-full min-h-[44px] glass-soft rounded-lg px-3 text-sm outline-none" />
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="press flex-1 min-h-[44px] rounded-xl glass-soft text-sm">ยกเลิก</button>
        <button onClick={onConfirm} className="press flex-1 min-h-[44px] rounded-xl bg-brand text-white text-sm font-semibold shadow-brand">ตรวจผลกระทบ →</button>
      </div>
    </div>
  );
}

function MobileRowCard({
  row, canSeeCost, canEdit, onOpenSku, onToggleReviewed, onEdit,
}: { row: LinkRowFull; canSeeCost: boolean; canEdit: boolean; onOpenSku: () => void; onToggleReviewed: () => void; onEdit: () => void }) {
  const qtyBad = numsDiffer(row.calcQty, row.cutQty);
  return (
    <Card className={cn("p-3 border-l-4", ST[row.status].bar, row.reviewed && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <Badge tone={ST[row.status].tone}>{ST[row.status].emoji} {ST[row.status].label}</Badge>
        {canEdit && (
          <label className="flex items-center gap-1.5 text-xs min-h-[32px]">
            <input type="checkbox" checked={row.reviewed} onChange={onToggleReviewed} className="w-5 h-5 accent-[#b3151d]" /> ตรวจแล้ว
          </label>
        )}
      </div>
      <div className="mt-1.5 text-sm">{row.name}</div>
      {(row.calcSku || row.cutSku) && (
        <button onClick={onOpenSku} className="press font-mono text-xs text-brand-dark underline decoration-dotted">{row.calcSku || row.cutSku}</button>
      )}
      <div className="mt-2 space-y-1 text-xs">
        <div className={cn("border-l-2 border-brand/40 pl-2", diff(qtyBad))}>คิดราคา {row.calcQty ?? "—"} {row.calcUnit} {canSeeCost && row.calcAmount != null && `· ฿${baht(row.calcAmount)}`}</div>
        <div className={cn("border-l-2 border-sky-300 pl-2", diff(qtyBad))}>ใบตัด {row.cutQty ?? "—"} {row.cutUnit} {row.cutLenPerPiece != null && `· ${n1(row.cutLenPerPiece)} ซม./ชิ้น`}</div>
        <div className="border-l-2 border-emerald-300 pl-2">สโตร์ {row.stockFound ? `${canSeeCost && row.stockPrice != null ? "฿" + baht(row.stockPrice) + " · " : ""}คงเหลือ ${row.stockQty}` : "⚠ ไม่มีในสโตร์"}</div>
      </div>
      {canEdit && (
        <button onClick={onEdit} className="press mt-2 w-full min-h-[40px] rounded-lg glass-soft text-xs font-semibold flex items-center justify-center gap-1">
          <Icon name="pencil" size={13} /> แก้ไข
        </button>
      )}
    </Card>
  );
}
