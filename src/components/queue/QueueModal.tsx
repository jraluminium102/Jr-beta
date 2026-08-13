"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Icon from "@/components/Icon";

// แผนที่ปักหมุด — โหลด client-only (Leaflet แตะ window)
const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => <div className="rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-ink-3" style={{ height: 280 }}>กำลังโหลดแผนที่…</div>,
});
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";
import DateField from "@/components/ui/DateField";
import { formatThaiPhone } from "@/lib/phone";
import {
  FEE_OPTIONS, JOB_SIZE_META, STATUS_META, STATUS_ORDER, parseLatLng,
  type QueueEntry, type QueueSales, type JobSize, type QueueStatus, type QueueTeam,
} from "@/lib/queue";
import type { JobSearchResult } from "@/app/api/jobs/search/route";

// ---- ชนิดลูกค้าที่ค้นมา ----
type CustomerSearchResult = {
  id: number;
  name: string;
  phone: string | null;
  line_id: string | null;
  address: string | null;
};

// ---- helpers ----------------------------------------------------------------

// เวลา "HH:MM"/"H.MM" → นาที (รองรับข้อมูล import จุด) · null ถ้าพาร์สไม่ได้
function timeToMin(t: string | null): number | null {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ประเภทงานที่ "เข้า flow ลูกค้า" (สร้างลูกค้า+งาน+ใบเสนอ+แบบ ตอน DONE) = ประเมินหน้างานเท่านั้น
// ("" / "ประเมิน" = ค่าเดิม/ข้อมูล import ถือเป็นประเมินด้วย)
export const ASSESS_JOB_TYPE = "ประเมินหน้างาน";
export function isAssessJobType(jt: string | null | undefined): boolean {
  const v = (jt ?? "").trim();
  return v === "" || v === ASSESS_JOB_TYPE || v === "ประเมิน";
}

const DESIGN_STATE_LABEL: Record<string, string> = {
  NOT_STARTED:      "ยังไม่เริ่ม",
  DRAWING:          "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอเซลล์ตรวจแบบ",
  REVISING:         "กำลังแก้ไข",
  DONE:             "เสร็จแล้ว",
};

// ตัวเลือกการชำระ (ฟีเจอร์ A)
const PAYMENT_OPTIONS = ["โอน", "จ่ายสด", "ลูกค้าเก่า", "มัดจำหน้างาน"] as const;

// ---- slot-conflict helpers --------------------------------------------------

type SlotConflict = {
  kind: "leave" | "full" | "warn";
  msg: string;
};

type AvailabilityRow = {
  sales_id: string;
  date: string;
  kind: string;
  half: string | null;
};

type ExistingSlot = {
  id: string;
  sales_id: string | null;
  queue_date: string | null;
  queue_time: string | null;
  status: string;
  customer_name: string;
};

// ประเภทงาน: หมวด
type JobCat = "ประเมินหน้างาน" | "โชว์รูม" | "เคลียร์แบบ" | "อื่นๆ";

type CustMode = "new" | "old";
type OldCustomerMode = "" | "existing_site" | "new_site";

type FormState = {
  status: QueueStatus;
  queue_date: string;
  queue_time: string;
  job_type: string;
  sales_id: string;
  assistant_id: string;
  line_contact: string;
  contact_channel: string;
  customer_name: string;
  tel: string;
  address: string;
  location_url: string;
  job_size: "" | JobSize;
  assess_fee: string;
  feeCustom: boolean;
  payment: string;
  receipt_done: boolean;
  fee_paid: boolean;
  note_admin: string;
  target_job_id: string | null;      // (0044) เคลียร์แบบ / ลูกค้าเก่าหน้างานเดิม
  clear_revise: boolean;             // (0044) toggle "มีแก้ใบเสนอ+แบบ"
  target_customer_id: number | null; // (0045) ลูกค้าเก่าหน้างานใหม่
  custMode: CustMode;                // (0045) ลูกค้าใหม่ / ลูกค้าเก่า
  oldCustomerMode: OldCustomerMode;  // (0045) หน้างานเดิม / หน้างานใหม่
  // (0070) ออกเอกสารในนาม
  bill_choice: "SITE" | "OTHER_ADDR" | "COMPANY";
  bill_kind: "INDIVIDUAL" | "COMPANY";
  bill_name: string;
  bill_tax_id: string;
  bill_branch: string;
  bill_address: string;
  bill_postal: string;
};

function initForm(e?: QueueEntry | null): FormState {
  const fee = e?.assess_fee ?? null;
  // (0070) entry อาจมีฟิลด์ bill_* (คอลัมน์ใหม่) ที่ type ยังไม่ประกาศ — cast อ่านแบบปลอดภัย
  const eb = e as (QueueEntry & { bill_choice?: string; bill_kind?: string; bill_name?: string; bill_tax_id?: string; bill_branch?: string; bill_address?: string; bill_postal?: string }) | null | undefined;

  // derive custMode / oldCustomerMode จาก entry ที่มีอยู่จริง
  // เฉพาะ ประเมินหน้างาน เท่านั้น (เคลียร์แบบ ใช้ target_job_id แต่ custMode ไม่เกี่ยว)
  // หลัง fix: existing_site ใช้ target_customer_id (เหมือน new_site) + target_job_id=null
  //   → ข้อมูลเก่าที่บันทึก target_job_id สำหรับ existing_site ยังรองรับด้วย fallback เดิม
  const jt = e?.job_type;
  const isAssess = !e || isAssessJobType(jt); // entry ใหม่ default เป็น assess
  let initCustMode: CustMode = "new";
  let initOldCustomerMode: OldCustomerMode = "";
  if (e && isAssess) {
    if (e.target_customer_id != null || e.target_job_id != null) {
      initCustMode = "old";
      // ข้อมูลเก่า: target_job_id ที่ไม่ใช่เคลียร์แบบ = existing_site (backward compat)
      if (e.target_job_id != null && isAssessJobType(e.job_type)) {
        initOldCustomerMode = "existing_site";
      } else if (e.target_customer_id != null) {
        // new_site หรือ existing_site ใหม่ → แสดงเป็น new_site (ข้อมูลในฟอร์มมีครบแล้ว)
        initOldCustomerMode = "new_site";
      }
    }
  }

  return {
    status: e?.status ?? "PENDING",
    queue_date: e?.queue_date ?? "",
    queue_time: e?.queue_time ?? "",
    job_type: e?.job_type ?? ASSESS_JOB_TYPE,
    sales_id: e?.sales_id ?? "",
    assistant_id: e?.assistant_id ?? "",
    line_contact: e?.line_contact ?? "",
    contact_channel: e?.contact_channel ?? "LINE",
    customer_name: e?.customer_name ?? "",
    tel: e?.tel ?? "",
    address: e?.address ?? "",
    location_url: e?.location_url ?? "",
    job_size: (e?.job_size ?? "") as "" | JobSize,
    assess_fee: fee != null ? String(fee) : "",
    feeCustom: fee != null && !FEE_OPTIONS.includes(fee),
    payment: e?.payment ?? "",
    receipt_done: e?.receipt_done ?? false,
    fee_paid: e?.fee_paid ?? false,
    note_admin: e?.note_admin ?? "",
    target_job_id: e?.target_job_id ?? null,      // (BUG-1) restore จาก entry จริง
    clear_revise: true,
    target_customer_id: e?.target_customer_id ?? null, // (BUG-1) restore จาก entry จริง
    custMode: initCustMode,
    oldCustomerMode: initOldCustomerMode,
    // (0070) ออกเอกสารในนาม
    bill_choice: (eb?.bill_choice as FormState["bill_choice"]) ?? "SITE",
    bill_kind: (eb?.bill_kind as FormState["bill_kind"]) ?? "INDIVIDUAL",
    bill_name: eb?.bill_name ?? "",
    bill_tax_id: eb?.bill_tax_id ?? "",
    bill_branch: eb?.bill_branch ?? "สำนักงานใหญ่",
    bill_address: eb?.bill_address ?? "",
    bill_postal: eb?.bill_postal ?? "",
  };
}

// แยกข้อมูลจาก "ข้อความที่วางมา" → ชื่อ/เบอร์/ที่อยู่/ลิงก์แมพ/ช่องทาง (heuristic · เว้นวันนัดให้กรอกเอง)
type ParsedContact = { customer_name?: string; tel?: string; address?: string; location_url?: string; contact_channel?: string; line_contact?: string };
export function parseContactBlob(text: string): ParsedContact {
  const out: ParsedContact = {};
  const urlRe = /(https?:\/\/[^\s]+)/i;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return out;

  // ลิงก์แมพ (เอาลิงก์แรก · ถ้าเป็นลิงก์แมพยิ่งชัวร์)
  let mapUrl = "";
  for (const l of lines) { const m = l.match(urlRe); if (m) { mapUrl = m[1]; if (/goo\.gl|maps|map/i.test(m[1])) break; } }
  if (mapUrl) out.location_url = mapUrl;

  // เบอร์โทร (0xx-xxx-xxxx / 0xxxxxxxxx) — ข้ามบรรทัดที่เป็นลิงก์
  const phoneRe = /0\d[\d\s\-]{7,11}\d/;
  let phone = "";
  for (const l of lines) { if (urlRe.test(l)) continue; const m = l.match(phoneRe); if (m) { phone = m[0].trim(); break; } }
  if (phone) out.tel = phone;

  // ช่องทาง + ชื่อ/handle (FB / Line / IG) — คิวรองรับ LINE/FB (IG เก็บชื่อไว้ ไม่เปลี่ยนช่อง)
  const chanRe = /^(fb|facebook|เฟส\S*|เฟซ\S*|line|ไลน์|ig|instagram|อินสตา\S*)\b[\s:：]*(.*)$/i;
  for (const l of lines) {
    const m = l.match(chanRe); if (!m) continue;
    const key = m[1].toLowerCase();
    if (/fb|face|เฟส|เฟซ/.test(key)) out.contact_channel = "FB";
    else if (/line|ไลน์/.test(key)) out.contact_channel = "LINE";
    const handle = (m[2] ?? "").trim();
    if (handle) out.line_contact = handle;
    break;
  }

  // ที่อยู่ — บรรทัดที่มีคำบอกที่อยู่ (ไม่ใช่ลิงก์/ช่องทาง/บรรทัดเบอร์)
  const addrRe = /(เลขที่|หมู่ ?\d|หมู่บ้าน|ซอย|ถ\.|ถนน|ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|แขวง|เขต|กรุงเทพ|\d{5})/;
  const addrLines = lines.filter((l) => !urlRe.test(l) && !chanRe.test(l) && !(phone && l.includes(phone)) && addrRe.test(l));
  if (addrLines.length) out.address = addrLines.join(" ");

  // ชื่อลูกค้า — บรรทัดที่มีเบอร์ (ตัดเบอร์ออก) หรือบรรทัดแรกที่ไม่ใช่ที่อยู่/ลิงก์/ช่องทาง
  let name = "";
  if (phone) { const pl = lines.find((l) => l.includes(phone)); if (pl) name = pl.replace(phone, "").replace(/[·|,]/g, " ").trim(); }
  if (!name) name = lines.find((l) => !urlRe.test(l) && !chanRe.test(l) && !addrRe.test(l)) ?? "";
  name = name.replace(/^[·|,\-–\s]+|[·|,\-–\s]+$/g, "").trim();
  if (name) out.customer_name = name;

  return out;
}

export function QueueModal({
  entry, preset, salesList, onClose, onSaved, readOnly = false, contextMonth,
}: {
  entry?: QueueEntry | null;
  preset?: { queue_date?: string; queue_time?: string; sales_id?: string };
  salesList: QueueSales[];
  onClose: () => void;
  onSaved: (savedDate?: string | null) => void;
  readOnly?: boolean;
  contextMonth?: string; // เดือนที่ผู้ใช้ดูอยู่ (YYYY-MM) → ใช้เป็น from_date hint ใน suggest
}) {
  const editing = !!entry;
  const [f, setF] = useState<FormState>(() => {
    const base = initForm(entry);
    if (!entry && preset) {
      return {
        ...base,
        queue_date: preset.queue_date ?? base.queue_date,
        queue_time: preset.queue_time ?? base.queue_time,
        sales_id: preset.sales_id ?? base.sales_id,
      };
    }
    return base;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  // ---- วางข้อความแล้วเติมข้อมูลอัตโนมัติ ----
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  function applyPaste() {
    const p = parseContactBlob(pasteText);
    const got: string[] = [];
    setF((s) => ({
      ...s,
      customer_name: p.customer_name ?? s.customer_name,
      tel: p.tel ? (formatThaiPhone(p.tel) || p.tel) : s.tel,
      address: p.address ?? s.address,
      location_url: p.location_url ?? s.location_url,
      contact_channel: p.contact_channel ?? s.contact_channel,
      line_contact: p.line_contact ?? s.line_contact,
    }));
    if (p.customer_name) got.push("ชื่อ");
    if (p.tel) got.push("เบอร์");
    if (p.address) got.push("ที่อยู่");
    if (p.location_url) got.push("ลิงก์แมพ");
    if (p.contact_channel || p.line_contact) got.push("ช่องทาง");
    setPasteMsg(got.length ? `เติมให้แล้ว: ${got.join(" · ")} — ตรวจ/แก้ได้ก่อนบันทึก (วันนัดกรอกเอง)` : "อ่านไม่ออก — ลองวางใหม่ หรือกรอกเอง");
  }

  const [resolved, setResolved] = useState<{ lat: number; lng: number } | null>(null);
  const [resolving, setResolving] = useState(false);
  // หมุดที่เลือกบนแผนที่เอง (ปัก/ลาก/ค้นหา) — ได้พิกัดแน่นอน ไม่ต้องพึ่งการอ่านลิงก์
  // เปิดงานเก่าที่มีพิกัดอยู่แล้ว → โชว์หมุดตำแหน่งเดิมทันที
  const [manualCoords, setManualCoords] = useState<{ lat: number; lng: number } | null>(
    entry?.lat != null && entry?.lng != null ? { lat: entry.lat, lng: entry.lng } : null
  );
  const [coordText, setCoordText] = useState(""); // ช่องวางพิกัด lat,lng เอง (ตอนลิงก์อ่านไม่ได้)
  // พิกัด: หมุดที่เลือกเอง > parse ตรงๆ (raw/ลิงก์เต็ม) > server แกะลิงก์ย่อ
  const coords = manualCoords ?? parseLatLng(f.location_url) ?? resolved;
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState("");

  // แกะลิงก์แผนที่ผ่าน server (รองรับ maps.app.goo.gl) เมื่อ parse ตรงๆ ไม่ได้
  async function resolveLink() {
    const raw = f.location_url.trim();
    if (!raw || parseLatLng(raw)) { setResolved(null); return; }
    if (!/^https?:\/\//i.test(raw)) { setResolved(null); return; }
    setResolving(true);
    try {
      const r = await api.post<{ lat: number; lng: number }>("/queue/resolve-location", { url: raw });
      setResolved(r.data ?? null);
    } catch { setResolved(null); }
    finally { setResolving(false); }
  }

  // ---- slot-conflict check ----
  const [conflicts, setConflicts] = useState<SlotConflict[]>([]);
  const [checkingConflict, setCheckingConflict] = useState(false);
  // ref เก็บ AbortController ปัจจุบัน ยกเลิก request เก่าก่อนเริ่ม request ใหม่
  const conflictAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!f.queue_date || !f.queue_time || !f.sales_id) { setConflicts([]); return; }

    // ยกเลิก request เก่าถ้ายังค้างอยู่
    conflictAbortRef.current?.abort();
    const controller = new AbortController();
    conflictAbortRef.current = controller;

    setCheckingConflict(true);

    async function checkConflict() {
      try {
        // โหลด availability + existing entries ของวันนั้น (timeout 8 วินาที)
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const [availRes, entryRes] = await Promise.all([
          api.get<AvailabilityRow[]>(`/queue/availability?sales_id=${f.sales_id}`),
          api.get<ExistingSlot[]>(`/queue?month=${f.queue_date!.slice(0, 7)}&sales=${f.sales_id}`),
        ]);
        clearTimeout(timeoutId);

        if (controller.signal.aborted) return;

        const found: SlotConflict[] = [];
        const slot = f.queue_time.slice(0, 5);
        const date = f.queue_date;
        // AM/PM จากเวลาจริง (รองรับเวลาอิสระ ไม่ใช่แค่ 10:00/14:00) — < 12:00 = เช้า
        const min = timeToMin(f.queue_time);
        const isAMSlot = min != null && min < 12 * 60;
        const isPMSlot = min != null && min >= 12 * 60;

        // ตรวจวันลา
        const av = (availRes.data ?? []).filter((a) => a.sales_id === f.sales_id && a.date === date);
        const isFullLeave = av.some((a) => a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY" || a.kind === "WFH");
        const isWfh = av.some((a) => a.kind === "WFH");
        const isAMLeave = av.some((a) => (a.kind === "LEAVE_HALF" && a.half === "AM") || a.kind === "OFFICE_HALF");
        const isPMLeave = av.some((a) => a.kind === "LEAVE_HALF" && a.half === "PM");

        if (isFullLeave) found.push({ kind: "leave", msg: isWfh ? "เซลล์ WFH ทำงานที่บ้านวันนี้ (ปกติไม่ออกประเมิน)" : "เซลล์ลา/วันหยุดทั้งวันในวันนี้" });
        else if (isAMLeave && isAMSlot) found.push({ kind: "leave", msg: "เซลล์ลา/อยู่ออฟฟิศช่วงเช้า — เลือกเวลาบ่าย" });
        else if (isPMLeave && isPMSlot) found.push({ kind: "leave", msg: "เซลล์ลาช่วงบ่าย — เลือกเวลาเช้า" });

        // (0030) วันอยู่ออฟฟิศประจำ — soft warn (ลงทับได้แต่ปกติไม่ออกประเมิน) · เฉพาะวันนี้เป็นต้นไป
        const half = isAMSlot ? "AM" : isPMSlot ? "PM" : null;
        const nowStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; })();
        if (half && date >= nowStr) {
          const selSales = salesList.find((s) => s.id === f.sales_id);
          const wd = new Date(date + "T00:00:00").getDay();
          if ((selSales?.office_slots ?? []).some((o) => o.weekday === wd && o.half === half)) {
            found.push({ kind: "warn", msg: `${selSales?.name ?? "เซลล์"} อยู่ออฟฟิศประจำช่วง${isAMSlot ? "เช้า" : "บ่าย"}วันนี้ — ปกติไม่ออกประเมิน` });
          }
        }

        // ตรวจชนคิวเดิม
        const sameSlot = (entryRes.data ?? []).filter((e) =>
          e.sales_id === f.sales_id &&
          e.queue_date === date &&
          e.queue_time?.slice(0, 5) === slot &&
          e.status !== "CANCELLED" &&
          (!editing || e.id !== entry!.id)
        );
        if (sameSlot.length > 0) {
          found.push({ kind: "full", msg: `slot นี้มีคิวอยู่แล้ว: ${sameSlot.map((x) => x.customer_name).join(", ")}` });
        }

        // ตรวจ FULLDAY: ต้องการทั้ง 2 slot
        if (f.job_size === "FULLDAY") {
          const otherSlot = slot === "10:00" ? "14:00" : "10:00";
          const otherTaken = (entryRes.data ?? []).filter((e) =>
            e.sales_id === f.sales_id &&
            e.queue_date === date &&
            e.queue_time?.slice(0, 5) === otherSlot &&
            e.status !== "CANCELLED" &&
            (!editing || e.id !== entry!.id)
          );
          if (otherTaken.length > 0) {
            found.push({ kind: "warn", msg: `งานเต็มวัน — slot ${otherSlot} ถูกจองแล้ว` });
          }
        }

        // ตรวจเกิน 2 slot ต่อวัน
        const dayCount = (entryRes.data ?? []).filter((e) =>
          e.sales_id === f.sales_id &&
          e.queue_date === date &&
          e.status !== "CANCELLED" &&
          (!editing || e.id !== entry!.id)
        ).length;
        if (dayCount >= 2 && !sameSlot.length) {
          found.push({ kind: "warn", msg: "เซลล์มีคิวครบ 2 ช่องในวันนี้แล้ว" });
        }

        setConflicts(found);
      } catch {
        if (!controller.signal.aborted) setConflicts([]);
      } finally {
        if (!controller.signal.aborted) setCheckingConflict(false);
      }
    }

    checkConflict();
    return () => { controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.queue_date, f.queue_time, f.sales_id, f.job_size]);

  // ---- local mirror ของเซลล์หลัก + ผู้ช่วย เพื่อเพิ่มใหม่แล้วเห็นใน dropdown ทันที ----
  const [localMain, setLocalMain] = useState<QueueSales[]>(() =>
    salesList.filter((s) => s.role !== "ASSISTANT")
  );
  const [localAssistants, setLocalAssistants] = useState<QueueSales[]>(() =>
    salesList.filter((s) => s.role === "ASSISTANT")
  );
  // sync เมื่อ salesList prop เปลี่ยน (เช่น parent reload)
  useEffect(() => {
    setLocalMain(salesList.filter((s) => s.role !== "ASSISTANT"));
    setLocalAssistants(salesList.filter((s) => s.role === "ASSISTANT"));
  }, [salesList]);
  const mainSales = localMain;

  // "เพิ่มเซลล์เอง" inline form state (เซลล์หลัก role=MAIN)
  const [addingSales, setAddingSales] = useState(false);
  const [newSalesName, setNewSalesName] = useState("");
  const [newSalesTeam, setNewSalesTeam] = useState<QueueTeam>("BKK");
  const [addSalesBusy, setAddSalesBusy] = useState(false);
  const [addSalesErr, setAddSalesErr] = useState("");

  // ประเภทงาน: หมวด (0044 เพิ่ม "เคลียร์แบบ")
  const [jobCat, setJobCat] = useState<JobCat>(() => {
    const jt = entry?.job_type;
    if (isAssessJobType(jt)) return "ประเมินหน้างาน";
    if (jt === "โชว์รูม") return "โชว์รูม";
    if (jt === "เคลียร์แบบ") return "เคลียร์แบบ";
    return "อื่นๆ";
  });

  // ---- (0044) ค้นงานเดิม (เคลียร์แบบ / ลูกค้าเก่าหน้างานเดิม) ----
  const [jobSearch, setJobSearch] = useState("");
  const [jobSearchResults, setJobSearchResults] = useState<JobSearchResult[]>([]);
  const [jobSearchBusy, setJobSearchBusy] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobSearchResult | null>(null);
  const jobSearchAbortRef = useRef<AbortController | null>(null);
  const jobSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- (0045) ค้นลูกค้าเดิม (ประเมินลูกค้าเก่า) ----
  const [custSearch, setCustSearch] = useState("");
  const [custSearchResults, setCustSearchResults] = useState<CustomerSearchResult[]>([]);
  const [custSearchBusy, setCustSearchBusy] = useState(false);
  const [selectedCust, setSelectedCust] = useState<CustomerSearchResult | null>(null);
  const custSearchAbortRef = useRef<AbortController | null>(null);
  const custSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // loading state สำหรับดึงข้อมูลไซต์เดิม (existing_site)
  const [siteInfoBusy, setSiteInfoBusy] = useState(false);
  // ลูกค้านี้ไม่มีงานในระบบ (existing_site auto-load คืน 0 งาน)
  const [noJobsForCust, setNoJobsForCust] = useState(false);
  // กำลังเปลี่ยนไซต์ (กด [เปลี่ยนไซต์] หลัง auto-pick) → โชว์ job search
  const [changingSite, setChangingSite] = useState(false);
  // เก็บงานที่ auto-pick ล่าสุด (ใช้กดยกเลิกเปลี่ยนไซต์กลับมา)
  const lastAutoJobRef = useRef<JobSearchResult | null>(null);

  // debounce ค้นงาน (เคลียร์แบบ หรือ ลูกค้าเก่าหน้างานเดิม + กำลังเปลี่ยนไซต์)
  const needsJobSearch = jobCat === "เคลียร์แบบ" || (jobCat === "ประเมินหน้างาน" && f.oldCustomerMode === "existing_site" && changingSite);
  useEffect(() => {
    if (!needsJobSearch) return;
    if (!jobSearch.trim()) { setJobSearchResults([]); return; }

    if (jobSearchTimerRef.current) clearTimeout(jobSearchTimerRef.current);
    jobSearchTimerRef.current = setTimeout(async () => {
      jobSearchAbortRef.current?.abort();
      const ctrl = new AbortController();
      jobSearchAbortRef.current = ctrl;
      setJobSearchBusy(true);
      try {
        const r = await api.get<JobSearchResult[]>(`/jobs/search?q=${encodeURIComponent(jobSearch.trim())}`);
        if (!ctrl.signal.aborted) setJobSearchResults(r.data ?? []);
      } catch {
        if (!ctrl.signal.aborted) setJobSearchResults([]);
      } finally {
        if (!ctrl.signal.aborted) setJobSearchBusy(false);
      }
    }, 350);

    return () => {
      if (jobSearchTimerRef.current) clearTimeout(jobSearchTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobSearch, needsJobSearch]);

  // debounce ค้นลูกค้าเดิม (0045)
  useEffect(() => {
    if (jobCat !== "ประเมินหน้างาน" || f.custMode !== "old") return;
    if (!custSearch.trim()) { setCustSearchResults([]); return; }

    if (custSearchTimerRef.current) clearTimeout(custSearchTimerRef.current);
    custSearchTimerRef.current = setTimeout(async () => {
      custSearchAbortRef.current?.abort();
      const ctrl = new AbortController();
      custSearchAbortRef.current = ctrl;
      setCustSearchBusy(true);
      try {
        const r = await api.get<CustomerSearchResult[]>(`/customers?q=${encodeURIComponent(custSearch.trim())}`);
        if (!ctrl.signal.aborted) setCustSearchResults(r.data ?? []);
      } catch {
        if (!ctrl.signal.aborted) setCustSearchResults([]);
      } finally {
        if (!ctrl.signal.aborted) setCustSearchBusy(false);
      }
    }, 350);

    return () => {
      if (custSearchTimerRef.current) clearTimeout(custSearchTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custSearch, f.custMode, jobCat]);

  async function selectTargetJob(j: JobSearchResult) {
    setSelectedJob(j);
    setJobSearch("");
    setJobSearchResults([]);

    // โหมด: เคลียร์แบบ (ผูกงานเดิม target_job_id) vs ประเมินหน้างานเดิม (สร้างงานใหม่ target_customer_id)
    const isClearDesign = jobCat === "เคลียร์แบบ";
    const isExistingSite =
      jobCat === "ประเมินหน้างาน" && f.oldCustomerMode === "existing_site" && !!selectedCust;
    if (isExistingSite) setChangingSite(false);

    // ทั้ง 2 โหมด: ดึง site-info ของงานนั้นมา auto-fill ให้ครบ (ที่อยู่/โลเคชั่น/เบอร์/Line)
    setSiteInfoBusy(true);
    try {
      const r = await api.get<{
        customer_name: string; tel: string | null; address: string | null;
        location_url: string | null; lat: number | null; lng: number | null;
        line_contact: string | null; contact_channel: string;
      }>(`/jobs/${j.id}/site-info`);
      const info = r.data;
      const target = {
        target_job_id: isClearDesign ? j.id : null,
        target_customer_id: isExistingSite && selectedCust ? selectedCust.id : null,
      };
      if (info) {
        setF((s) => ({
          ...s,
          customer_name: info.customer_name || j.customer_name,
          tel: info.tel ? formatThaiPhone(info.tel) : s.tel,
          address: info.address ?? s.address,
          location_url: info.location_url ?? s.location_url,
          line_contact: info.line_contact ?? s.line_contact,
          contact_channel: info.contact_channel || s.contact_channel,
          ...target,
        }));
        if (info.lat != null && info.lng != null) setResolved({ lat: info.lat, lng: info.lng });
      } else {
        setF((s) => ({
          ...s,
          customer_name: j.customer_name,
          tel: j.customer_tel ? formatThaiPhone(j.customer_tel) : s.tel,
          address: j.customer_area ?? s.address,
          ...target,
        }));
      }
    } catch {
      setF((s) => ({
        ...s,
        customer_name: j.customer_name,
        tel: j.customer_tel ? formatThaiPhone(j.customer_tel) : s.tel,
        address: j.customer_area ?? s.address,
        target_job_id: isClearDesign ? j.id : null,
        target_customer_id: isExistingSite && selectedCust ? selectedCust.id : null,
      }));
    } finally {
      setSiteInfoBusy(false);
    }
  }

  function clearTargetJob() {
    // ถ้าอยู่ใน existing_site mode → เปิด search box ให้เลือกไซต์ใหม่ (คงค่า address/location ไว้)
    if (jobCat === "ประเมินหน้างาน" && f.oldCustomerMode === "existing_site") {
      // บันทึกงานเดิมไว้ให้ [ยกเลิก] กู้คืน
      if (selectedJob) lastAutoJobRef.current = selectedJob;
      setSelectedJob(null);
      setChangingSite(true);
      setJobSearch("");
      setJobSearchResults([]);
      setF((s) => ({
        ...s,
        target_job_id: null,
        target_customer_id: null, // จะถูก set ใหม่ตอนเลือกงาน
      }));
    } else {
      setSelectedJob(null);
      setF((s) => ({ ...s, target_job_id: null, customer_name: "", tel: "" }));
    }
  }

  // ---- (0045) เลือก / ล้างลูกค้าเดิม ----
  function selectCustomer(c: CustomerSearchResult) {
    setSelectedCust(c);
    setCustSearch("");
    setCustSearchResults([]);
    // auto-fill ชื่อ+เบอร์+ที่อยู่+line จากลูกค้า (เติมเบื้องต้นก่อน fetch ไซต์)
    setF((s) => ({
      ...s,
      customer_name: c.name,
      tel: c.phone ? formatThaiPhone(c.phone) : s.tel,
      address: c.address ?? s.address,
      line_contact: c.line_id ?? s.line_contact,
      target_customer_id: null,    // reset จนกว่าจะเลือก mode หน้างาน
      target_job_id: null,
      oldCustomerMode: "",         // reset mode เผื่อเปลี่ยนลูกค้า
    }));
    // reset job picker + flags ถ้าเปลี่ยนลูกค้า
    setSelectedJob(null);
    setJobSearch("");
    setJobSearchResults([]);
    setNoJobsForCust(false);
    setChangingSite(false);
    lastAutoJobRef.current = null;
  }

  function clearCustomer() {
    setSelectedCust(null);
    setSelectedJob(null);
    setJobSearch("");
    setJobSearchResults([]);
    setNoJobsForCust(false);
    setChangingSite(false);
    lastAutoJobRef.current = null;
    setF((s) => ({
      ...s,
      customer_name: "",
      tel: "",
      address: "",
      line_contact: "",
      target_customer_id: null,
      target_job_id: null,
      oldCustomerMode: "",
    }));
  }

  function selectOldCustomerMode(mode: OldCustomerMode) {
    if (!selectedCust) return;
    setF((s) => ({
      ...s,
      oldCustomerMode: mode,
      // หน้างานใหม่ → set target_customer_id ทันที, เคลียร์ target_job_id
      // หน้างานเดิม → target_customer_id จะถูก set ตอนเลือกงาน (selectTargetJob), ต้องเป็น null ก่อน
      target_customer_id: mode === "new_site" ? selectedCust.id : null,
      target_job_id: null, // ทั้ง 2 mode เคลียร์ target_job_id (เคลียร์แบบเท่านั้นที่ใช้ target_job_id)
      // หน้างานใหม่ = ไซต์ใหม่ → ล้างที่อยู่/โลเคชั่นของไซต์เก่า (เก็บชื่อ/เบอร์/Line ของลูกค้าไว้)
      ...(mode === "new_site" ? { address: "", location_url: "" } : {}),
    }));
    if (mode === "new_site") {
      setResolved(null);
      setSelectedJob(null);
      setNoJobsForCust(false);
      setChangingSite(false);
    }
    // existing_site → reset job picker + auto-load งานล่าสุดของลูกค้า
    if (mode === "existing_site") {
      setSelectedJob(null);
      setJobSearch("");
      setJobSearchResults([]);
      setResolved(null);
      setNoJobsForCust(false);
      setChangingSite(false);
      lastAutoJobRef.current = null;
      // auto-load งานล่าสุด
      autoLoadLatestJob(selectedCust.id);
    }
  }

  // auto-load งานล่าสุดของลูกค้า → autoFillFromJob ถ้ามี
  async function autoLoadLatestJob(customerId: number) {
    setSiteInfoBusy(true);
    try {
      // (1) งานล่าสุด — โชว์เป็นไซต์อ้างอิง (เปลี่ยนไซต์เฉพาะได้)
      const jr = await api.get<JobSearchResult[]>(`/jobs/search?customer_id=${customerId}`);
      const jobs = jr.data ?? [];
      if (jobs.length > 0) {
        setSelectedJob(jobs[0]);
        lastAutoJobRef.current = jobs[0];
        setChangingSite(false);
      } else {
        setNoJobsForCust(true);
      }
      // (2) เติมจาก "ไซต์รวมของลูกค้า" (ครบสุด — ดึง location จากงานใดก็ได้ที่มีแผนที่)
      const cr = await api.get<{
        customer_name: string; tel: string | null; address: string | null;
        location_url: string | null; lat: number | null; lng: number | null;
        line_contact: string | null; contact_channel: string;
      }>(`/customers/${customerId}/site-info`);
      const info = cr.data;
      if (info) {
        setF((s) => ({
          ...s,
          customer_name: info.customer_name || s.customer_name,
          tel: info.tel ? formatThaiPhone(info.tel) : s.tel,
          address: info.address ?? s.address,
          location_url: info.location_url ?? s.location_url,
          line_contact: info.line_contact ?? s.line_contact,
          contact_channel: info.contact_channel || s.contact_channel,
          target_customer_id: customerId,
          target_job_id: null,
        }));
        if (info.lat != null && info.lng != null) setResolved({ lat: info.lat, lng: info.lng });
      } else {
        setF((s) => ({ ...s, target_customer_id: customerId }));
      }
    } catch {
      // best-effort: ยังให้สร้างงานใหม่ใต้ลูกค้าได้
      setF((s) => ({ ...s, target_customer_id: customerId }));
    } finally {
      setSiteInfoBusy(false);
    }
  }

  // "เพิ่มผู้ช่วยเอง" inline form state
  const [addingAssistant, setAddingAssistant] = useState(false);
  const [managingAssist, setManagingAssist] = useState(false); // (ข้อ 1) โหมดลบรายชื่อผู้ช่วย
  const [newAssistantName, setNewAssistantName] = useState("");
  const [addAssistBusy, setAddAssistBusy] = useState(false);
  const [addAssistErr, setAddAssistErr] = useState("");

  // ref สำหรับ AbortController ของ suggestAuto
  const suggestAbortRef = useRef<AbortController | null>(null);
  // ref กันกดบันทึกรัว (synchronous ก่อน state busy re-render)
  const savingRef = useRef(false);

  async function suggestAuto() {
    // ถ้ามีวันนัดอยู่แล้ว ถามก่อนเขียนทับ (กันเผลอกดทับวันที่ตกลงกับลูกค้า)
    if (f.queue_date && !window.confirm("มีวันนัดอยู่แล้ว จะให้ระบบเสนอวัน/เวลาใหม่ทับไหม?")) return;
    // ยกเลิก request เก่าถ้ายังค้างอยู่
    suggestAbortRef.current?.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;

    setSuggesting(true); setSuggestMsg("");
    // timeout 10 วินาที
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      let fromDate: string | null = null;
      const refMonth = f.queue_date ? f.queue_date.slice(0, 7) : (contextMonth ?? null);
      if (refMonth) {
        const firstDay = `${refMonth}-01`;
        const todayStr = (() => {
          const n = new Date();
          return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
        })();
        fromDate = firstDay >= todayStr ? firstDay : todayStr;
      }

      const r = await api.post<{
        queue_date: string; queue_time: string;
        sales_id: string; sales_name: string; reason: string;
      }>("/queue/suggest", {
        sales_id: f.sales_id || null,
        job_size: f.job_size || null,
        address: f.address || null,
        location_url: f.location_url || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        from_date: fromDate,
        // (ข้อ 12) ถ้าเลือกเวลาเอง (10:00/14:00) → ล็อกเวลานั้น ให้ระบบหาแค่วัน+โลเคชั่นใกล้
        // ไม่ส่งกับงานหลายจุด/เต็มวัน (MULTI ต้องจัดบ่ายก่อน, FULLDAY ต้องใช้ 2 slot)
        fixed_time:
          f.job_size === "MULTI" || f.job_size === "FULLDAY"
            ? null
            : (((f.queue_time || "").slice(0, 5) || null) as "10:00" | "14:00" | null),
      });
      clearTimeout(timeoutId);
      if (controller.signal.aborted) return;
      setF((s) => ({
        ...s,
        queue_date: r.data.queue_date,
        queue_time: r.data.queue_time,
        sales_id: s.sales_id || r.data.sales_id,
      }));
      setSuggestMsg("✓ " + r.data.reason);
    } catch (e) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        setSuggestMsg("หมดเวลา — ลองใหม่อีกครั้ง");
      } else {
        setSuggestMsg(e instanceof Error ? e.message : "เสนอคิวไม่สำเร็จ");
      }
    } finally {
      if (!controller.signal.aborted) setSuggesting(false);
      else setSuggesting(false);
    }
  }

  // ---- เพิ่มเซลล์หลัก (MAIN) ใหม่ถาวรใน queue_sales ----
  async function addMainSales() {
    const trimmedName = newSalesName.trim();
    if (!trimmedName) { setAddSalesErr("กรุณาระบุชื่อเซลล์"); return; }

    // ชื่อซ้ำใน local list → เลือกตัวเดิมแทนสร้างซ้ำ
    const existing = localMain.find((s) => s.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      setF((s) => ({ ...s, sales_id: existing.id }));
      setAddingSales(false); setNewSalesName(""); setAddSalesErr("");
      return;
    }

    setAddSalesBusy(true); setAddSalesErr("");
    try {
      const code = trimmedName.toLowerCase().replace(/\s+/g, "_").slice(0, 20) || `s_${Date.now().toString(36)}`;
      const res = await api.post<{ id: string; name: string }>("/queue/sales", {
        name: trimmedName,
        code,
        team: newSalesTeam,
        role: "MAIN",
        active: true,
      });
      const newRecord: QueueSales = {
        id: res.data.id,
        name: res.data.name,
        code,
        team: newSalesTeam,
        role: "MAIN",
        active: true,
        start_label: null,
        start_lat: null,
        start_lng: null,
        profile_id: null,
        parent_sales_id: null,
      };
      setLocalMain((prev) => [...prev, newRecord]);
      setF((s) => ({ ...s, sales_id: res.data.id }));
      setAddingSales(false); setNewSalesName("");
    } catch (e) {
      setAddSalesErr(e instanceof Error ? e.message : "เพิ่มเซลล์ไม่สำเร็จ");
    } finally {
      setAddSalesBusy(false);
    }
  }

  // ---- ข้อ 3: Create a new ASSISTANT record in queue_sales ----
  async function addAssistant() {
    if (!newAssistantName.trim()) { setAddAssistErr("กรุณาระบุชื่อผู้ช่วย"); return; }

    // ตรวจชื่อซ้ำใน local list ก่อน — ถ้าซ้ำให้เลือกตัวเดิมแทนการสร้างซ้ำ
    const trimmedName = newAssistantName.trim();
    const existing = localAssistants.find(
      (a) => a.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) {
      setF((s) => ({ ...s, assistant_id: existing.id }));
      setAddingAssistant(false);
      setNewAssistantName("");
      setAddAssistErr("");
      return;
    }

    setAddAssistBusy(true); setAddAssistErr("");
    try {
      const res = await api.post<{ id: string; name: string }>("/queue/sales", {
        name: trimmedName,
        code: trimmedName.toLowerCase().replace(/\s+/g, "_").slice(0, 20),
        team: "BKK",
        role: "ASSISTANT",
        active: true,
      });
      // เพิ่มเข้า local mirror ทันที และเลือกเป็นค่าที่เลือกอยู่
      const newRecord: QueueSales = {
        id: res.data.id,
        name: res.data.name,
        code: trimmedName.toLowerCase().replace(/\s+/g, "_").slice(0, 20),
        team: "BKK",
        role: "ASSISTANT",
        active: true,
        start_label: null,
        start_lat: null,
        start_lng: null,
        profile_id: null,
        parent_sales_id: null,
      };
      setLocalAssistants((prev) => [...prev, newRecord]);
      setF((s) => ({ ...s, assistant_id: res.data.id }));
      setAddingAssistant(false);
      setNewAssistantName("");
    } catch (e) {
      setAddAssistErr(e instanceof Error ? e.message : "เพิ่มผู้ช่วยไม่สำเร็จ");
    } finally {
      setAddAssistBusy(false);
    }
  }

  // (ข้อ 1) ลบผู้ช่วยเซลล์ — soft delete (active=false) คิวเก่าที่ผูกไว้ยังอยู่
  async function deleteAssistant(id: string, name: string) {
    if (!window.confirm(`ลบผู้ช่วย "${name}"?\n(จะหายจากรายชื่อ แต่คิวเก่าที่เคยเลือกไว้ยังอยู่ครบ)`)) return;
    try {
      await api.del(`/queue/sales?id=${id}`);
      setLocalAssistants((prev) => prev.filter((a) => a.id !== id));
      setF((s) => (s.assistant_id === id ? { ...s, assistant_id: "" } : s));
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบผู้ช่วยไม่สำเร็จ");
    }
  }

  async function save() {
    if (savingRef.current) return; // กันกดบันทึกรัว/ดับเบิลแท็ป

    // ---- validation ----
    if (jobCat === "เคลียร์แบบ") {
      if (!f.target_job_id) { setErr("กรุณาเลือกงานเดิม"); return; }
    } else if (jobCat === "ประเมินหน้างาน" && f.custMode === "old") {
      // ลูกค้าเก่า: ถ้า edit + ยังไม่ได้ค้นใหม่ แต่มี target อยู่แล้ว → ผ่าน validation selectedCust
      const hasRestoredTarget = editing && !selectedCust && (f.target_customer_id != null || f.target_job_id != null);
      if (!selectedCust && !hasRestoredTarget) { setErr("กรุณาค้นและเลือกลูกค้าเดิมก่อน"); return; }
      if (f.oldCustomerMode === "") { setErr("กรุณาเลือก: หน้างานเดิม หรือ หน้างานใหม่"); return; }
      // existing_site: ต้องมี target_customer_id (set ตอนเลือกงาน หรือ auto-pick หรือ 0-jobs)
      // ถ้า edit + hasRestoredTarget → ผ่านได้ (ข้อมูลเดิมมีครบแล้ว)
      // ถ้า noJobsForCust → target_customer_id set แล้ว (สร้างงานใหม่ใต้ลูกค้า)
      const hasRestoredSite = editing && !selectedJob && f.target_customer_id != null;
      if (f.oldCustomerMode === "existing_site" && !hasRestoredSite && !noJobsForCust && (!selectedJob || f.target_customer_id == null)) {
        setErr("กรุณาเลือกงาน/ไซต์เดิมก่อน");
        return;
      }
      if (f.oldCustomerMode === "new_site" && !f.target_customer_id) {
        setErr("เกิดข้อผิดพลาด: target_customer_id หายไป — กรุณาเลือกลูกค้าใหม่");
        return;
      }
      if (!f.customer_name.trim()) { setErr("กรุณาระบุชื่อลูกค้า"); return; }
    } else {
      if (!f.customer_name.trim()) { setErr("กรุณาระบุชื่อลูกค้า"); return; }
    }

    // ---- ข้อ 1: ตรวจ/ยืนยันก่อนเปลี่ยนสถานะเป็น DONE ----
    if (f.status === "DONE") {
      if (jobCat === "เคลียร์แบบ") {
        const ok = window.confirm(
          `ยืนยันปิดคิวเคลียร์แบบ?\nระบบจะผูกงาน${selectedJob ? ` "${selectedJob.job_code ?? selectedJob.customer_name}"` : "เดิม"}${f.clear_revise ? " และตั้ง design_state = REVISING" : ""}`
        );
        if (!ok) return;
      } else if (isAssessJobType(f.job_type)) {
        if (!f.queue_date) { setErr("กรุณาระบุวันที่นัดก่อนยืนยันประเมินเสร็จ"); return; }
        if (!f.sales_id) { setErr("กรุณาเลือกเซลล์ก่อนยืนยันประเมินเสร็จ"); return; }

        let confirmMsg: string;
        if (f.custMode === "old" && f.oldCustomerMode === "existing_site") {
          confirmMsg = `ยืนยันประเมินเสร็จ? สร้างงานใหม่ที่ไซต์เดิมของ "${selectedCust?.name ?? f.customer_name}"${selectedJob ? ` (อ้างอิงไซต์: ${selectedJob.job_code ?? selectedJob.customer_name})` : ""}`;
        } else if (f.custMode === "old" && f.oldCustomerMode === "new_site") {
          confirmMsg = `ยืนยันประเมินเสร็จ? (ลูกค้าเก่า "${selectedCust?.name ?? f.customer_name}" — สร้างงานใหม่ใต้ลูกค้านี้)`;
        } else {
          confirmMsg = "ยืนยันว่าประเมินเสร็จ? ระบบจะสร้างลูกค้า + งานจริงทันที และย้อนกลับยาก";
        }
        const confirmed = window.confirm(confirmMsg);
        if (!confirmed) return;

        // เตือนถ้าไม่มีเบอร์โทร (เฉพาะลูกค้าใหม่ เพราะลูกค้าเก่าอาจไม่มีเบอร์ใหม่)
        const telRaw = f.tel.trim();
        if (!telRaw && f.custMode === "new") {
          const telOk = window.confirm(
            "ยังไม่ได้ใส่เบอร์โทร ระบบจะถือเป็นลูกค้าใหม่เสมอ (เสี่ยงลูกค้าซ้ำ) — ยืนยัน?"
          );
          if (!telOk) return;
        }
      } else {
        const ok = window.confirm(
          `ปิดงานคิวนี้ (${f.job_type || "อื่นๆ"}) โดยไม่สร้างลูกค้า/งานในระบบ — ยืนยัน?`
        );
        if (!ok) return;
      }
    }

    // ---- ข้อ 2: ตรวจ conflict ร้าย (leave / full) ก่อน save ----
    const leaveConflicts = conflicts.filter((c) => c.kind === "leave");
    if (leaveConflicts.length > 0) {
      setErr("เซลล์ลาวันนี้ เปลี่ยนวัน/เซลล์ก่อน");
      return;
    }
    const fullConflicts = conflicts.filter((c) => c.kind === "full");
    if (fullConflicts.length > 0) {
      const reason = fullConflicts.map((c) => c.msg).join(" / ");
      const ok = window.confirm(`${reason} — ยืนยันบันทึกทับ?`);
      if (!ok) return;
    }
    // เตือนเมื่อ queue_date มีค่าแต่ queue_time ว่าง
    if (f.queue_date && !f.queue_time) {
      const slotOk = window.confirm("ยังไม่ได้เลือก slot เวลา (เช้า/บ่าย) — ยืนยันบันทึกโดยไม่ระบุเวลา?");
      if (!slotOk) return;
    }

    savingRef.current = true;
    setBusy(true); setErr("");

    // ---- format เบอร์โทรก่อน save (ฟีเจอร์ C) ----
    const telFormatted = f.tel.trim() ? formatThaiPhone(f.tel) || null : null;

    // กัน edge: เลือก "อื่นๆ" แต่ไม่พิมพ์ → job_type="" จะถูกตีเป็นประเมิน เลย default เป็น "อื่นๆ"
    const jobTypeOut =
      jobCat === "เคลียร์แบบ" ? "เคลียร์แบบ" :
      jobCat === "อื่นๆ" && !f.job_type.trim() ? "อื่นๆ" :
      (f.job_type || null);

    const payload = {
      status: f.status,
      queue_date: f.queue_date || null,
      queue_time: f.queue_time || null,
      job_type: jobTypeOut,
      sales_id: f.sales_id || null,
      assistant_id: f.assistant_id || null,
      line_contact: f.line_contact || null,
      contact_channel: f.contact_channel || "LINE",
      customer_name: f.customer_name.trim(),
      tel: telFormatted,
      address: f.address || null,
      location_url: f.location_url || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      job_size: f.job_size || null,
      assess_fee: f.assess_fee && Number.isFinite(Number(f.assess_fee)) ? Number(f.assess_fee) : null,
      payment: f.payment || null,
      receipt_done: f.receipt_done,
      fee_paid: f.fee_paid,
      note_admin: f.note_admin || null,
      target_job_id: f.target_job_id || null,        // (0044) เคลียร์แบบเท่านั้น
      clear_revise: f.clear_revise,                  // (0044) — stripped server-side ก่อน .update()
      target_customer_id: f.target_customer_id ?? null, // (0045) ลูกค้าเก่าหน้างานใหม่ + หน้างานเดิม
      // (0070) ออกเอกสารในนาม
      bill_choice: f.bill_choice,
      bill_kind: f.bill_choice === "COMPANY" ? "COMPANY" : "INDIVIDUAL",
      bill_name: f.bill_name || null,
      bill_tax_id: f.bill_tax_id || null,
      bill_branch: f.bill_branch || null,
      bill_address: f.bill_address || null,
      bill_postal: f.bill_postal || null,
    };
    // แจ้งผลตอนปิดงาน (ใช้ทั้ง edit และ "สร้างเป็นเสร็จเลย") — jobId = งานที่ promote สร้าง/ผูก
    const announceDone = (jobId: unknown) => {
      if (jobCat === "เคลียร์แบบ") {
        alert(jobId
          ? `ปิดคิวเคลียร์แบบแล้ว${f.clear_revise ? " — ตั้งสถานะแบบ: กำลังแก้ไข" : ""}\nงาน: ${selectedJob?.job_code ?? "(ไม่ทราบ code)"}`
          : "ปิดคิวแล้วแต่ผูกงานไม่สำเร็จ — แจ้งแอดมิน");
      } else if (isAssessJobType(payload.job_type)) {
        if (!jobId) { alert("เข้าประเมินเสร็จแล้วแต่ผูกงานไม่สำเร็จ — แจ้งแอดมิน"); return; }
        if (f.custMode === "old" && f.oldCustomerMode === "existing_site") {
          alert(`ประเมินเสร็จ — ผูกงานเดิม${selectedJob ? ` "${selectedJob.job_code ?? selectedJob.customer_name}"` : ""} + อัปเดต assess_date แล้ว`);
        } else if (f.custMode === "old" && f.oldCustomerMode === "new_site") {
          alert(`ประเมินเสร็จ — สร้างงานใหม่ใต้ลูกค้า "${selectedCust?.name ?? f.customer_name}" (ลูกค้าเดิม ไม่เพิ่มซ้ำ)\nดูต่อได้ที่หน้า "ติดตามงาน"`);
        } else {
          alert("เข้าประเมินเสร็จ — บันทึกลูกค้าเข้าทะเบียน + สร้างงานในระบบให้แล้ว\nดูต่อได้ที่หน้า \"ติดตามงาน\" (ไม่ต้องกรอกซ้ำ)");
        }
      }
    };
    try {
      let doneJobId: unknown;
      if (editing) {
        const r = await api.patch<{ id: string }>(`/queue/${entry!.id}`, payload);
        doneJobId = r.meta?.job_id;
      } else {
        const c = await api.post<{ id: string }>("/queue", payload);
        // ⚠ POST /api/queue "ไม่" รัน DONE→promote (มีเฉพาะ PATCH) → ถ้าสร้างเป็น "เสร็จ" เลย
        //    งานจะไม่ถูกสร้าง/ไม่ผูกลูกค้าเดิม/ไม่เข้าเขียนแบบ → ต้อง PATCH ซ้ำเพื่อ promote (บั๊กเจ้าของแจ้ง 4 ส.ค.)
        if (payload.status === "DONE" && c.data?.id) {
          const r = await api.patch<{ id: string }>(`/queue/${c.data.id}`, payload);
          doneJobId = r.meta?.job_id;
        }
      }
      if (payload.status === "DONE") announceDone(doneJobId);
      onSaved((payload as { queue_date?: string | null }).queue_date ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    } finally {
      savingRef.current = false;
    }
  }

  async function remove() {
    if (!entry || !confirm(`ลบคิวของ "${entry.customer_name}" ?`)) return;
    setBusy(true); setErr("");
    try {
      await api.del(`/queue/${entry.id}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
      setBusy(false);
    }
  }

  // ตรวจว่า payment ที่บันทึกอยู่ไม่ตรงกับ 4 ตัวเลือก → เพิ่มเป็น option แรก (กันข้อมูลหาย)
  const paymentNotInList = f.payment && !(PAYMENT_OPTIONS as readonly string[]).includes(f.payment);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="calendar" size={18} />
            {readOnly ? "รายละเอียดคิว" : editing ? "แก้ไขคิว" : "เพิ่มคิวงาน"}
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1">
            <Icon name="close" size={18} />
          </button>
        </div>

        <fieldset disabled={readOnly} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-0 p-0 m-0 min-w-0">

          {/* ---- วางข้อความ → เติมข้อมูลอัตโนมัติ ---- */}
          {!readOnly && (
            <div className="sm:col-span-2">
              <details open={!editing} className="rounded-xl border border-brand/20 bg-brand/5">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-brand-dark flex items-center gap-1.5">
                  <Icon name="clipboard" size={15} /> วางข้อความลูกค้า → เติมข้อมูลให้อัตโนมัติ
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={4}
                    placeholder={"วางทั้งก้อนได้เลย เช่น\nK.Avinash 082-271-4312\nเลขที่ 144/160 ... ตำบลกะทู้ อำเภอกะทู้ ภูเก็ต 83120\nhttps://maps.app.goo.gl/...\nFB Avinash Pednekar"}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/40"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={applyPaste} disabled={!pasteText.trim()}
                      className="press inline-flex items-center gap-1.5 rounded-lg bg-brand text-white px-3.5 py-2 text-sm font-semibold disabled:opacity-40">
                      <Icon name="check" size={15} /> เติมข้อมูลให้อัตโนมัติ
                    </button>
                    {pasteText && <button type="button" onClick={() => { setPasteText(""); setPasteMsg(""); }} className="press text-xs text-ink-3 hover:text-ink">ล้าง</button>}
                    {pasteMsg && <span className="text-[11px] text-emerald-700">{pasteMsg}</span>}
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* ---- ประเภทงาน (ย้ายขึ้นก่อน เพื่อ jobCat เคลียร์แบบ เปลี่ยน UI ลูกค้า) ---- */}
          <Field label="ประเภทงาน">
            <div className="space-y-1.5">
              <select
                value={jobCat}
                onChange={(e) => {
                  const cat = e.target.value as JobCat;
                  setJobCat(cat);
                  // reset customer / job pickers เมื่อเปลี่ยน category
                  setSelectedJob(null);
                  setJobSearch("");
                  setJobSearchResults([]);
                  setSelectedCust(null);
                  setCustSearch("");
                  setCustSearchResults([]);
                  if (cat === "ประเมินหน้างาน") {
                    setF((s) => ({
                      ...s, job_type: ASSESS_JOB_TYPE,
                      custMode: "new", oldCustomerMode: "",
                      target_job_id: null, target_customer_id: null,
                    }));
                  } else if (cat === "โชว์รูม") {
                    setF((s) => ({
                      ...s, job_type: "โชว์รูม",
                      custMode: "new", oldCustomerMode: "",
                      target_job_id: null, target_customer_id: null,
                    }));
                  } else if (cat === "เคลียร์แบบ") {
                    setF((s) => ({
                      ...s, job_type: "เคลียร์แบบ",
                      custMode: "new", oldCustomerMode: "",
                      target_job_id: null, target_customer_id: null,
                      customer_name: "", tel: "",
                    }));
                  } else {
                    setF((s) => ({
                      ...s, job_type: "",
                      custMode: "new", oldCustomerMode: "",
                      target_job_id: null, target_customer_id: null,
                    }));
                  }
                }}
                className={inp}>
                <option value="ประเมินหน้างาน">ประเมินหน้างาน</option>
                <option value="โชว์รูม">โชว์รูม</option>
                <option value="เคลียร์แบบ">เคลียร์แบบ</option>
                <option value="อื่นๆ">อื่นๆ (พิมพ์เอง)</option>
              </select>
              {jobCat === "อื่นๆ" && (
                <input
                  value={f.job_type}
                  onChange={(e) => set("job_type", e.target.value)}
                  placeholder="ระบุประเภทงาน เช่น วัดพื้นที่"
                  className={inp}
                />
              )}
              {jobCat !== "ประเมินหน้างาน" && jobCat !== "เคลียร์แบบ" && (
                <p className="text-[11px] text-ink-3">ℹ️ ประเภทนี้ไม่เข้าระบบลูกค้า (ไม่สร้างใบเสนอ/แบบตอนปิดงาน)</p>
              )}
            </div>
          </Field>

          {/* ---- ชื่อลูกค้า หรือ ค้นงานเดิม (เคลียร์แบบ) ---- */}
          {jobCat === "เคลียร์แบบ" ? (
            <Field label="ค้นงานเดิม *" wide>
              {/* (BUG-1) แจ้งเมื่อ edit แล้วมี target_job_id อยู่แล้ว แต่ยังไม่ได้ค้นใหม่ */}
              {editing && f.target_job_id && !selectedJob && (
                <div className="mb-2 glass-soft rounded-xl px-3 py-2.5 flex items-start gap-2 border border-sky-200">
                  <Icon name="info" size={14} className="shrink-0 mt-0.5 text-sky-600" />
                  <p className="text-xs text-sky-700">
                    ผูกงานเดิมไว้แล้ว — กดเปลี่ยนโหมดถ้าต้องการแก้ (ไม่แตะ = คงค่าเดิม)
                  </p>
                </div>
              )}
              {selectedJob ? (
                /* การ์ดงานที่เลือกแล้ว */
                <div className="glass-soft rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-brand-dark text-sm">
                      {selectedJob.job_code ?? "—"} · {selectedJob.customer_name}
                    </div>
                    <div className="text-xs text-ink-3 mt-0.5">
                      แบบ: {DESIGN_STATE_LABEL[selectedJob.design_state] ?? selectedJob.design_state}
                      {selectedJob.customer_tel && ` · ${selectedJob.customer_tel}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearTargetJob}
                    className="press shrink-0 text-xs text-ink-3 hover:text-red-600 px-1.5 py-1 rounded-lg"
                  >
                    [เปลี่ยน]
                  </button>
                </div>
              ) : (
                /* ช่องค้นหา */
                <div className="space-y-1.5">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">
                      <Icon name="search" size={14} />
                    </span>
                    <input
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                      placeholder="พิมพ์ชื่อลูกค้า หรือเบอร์โทร…"
                      className={`${inp} pl-8`}
                    />
                    {jobSearchBusy && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3">
                        <Icon name="refresh" size={13} className="animate-spin" />
                      </span>
                    )}
                  </div>
                  {jobSearchResults.length > 0 && (
                    <div className="glass-soft rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                      {jobSearchResults.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => selectTargetJob(j)}
                          className="w-full text-left px-3 py-2.5 hover:bg-white/60 border-b border-gray-100 last:border-0 transition-colors"
                        >
                          <div className="font-semibold text-sm text-brand-dark">
                            {j.job_code ?? "—"} · {j.customer_name}
                          </div>
                          <div className="text-xs text-ink-3 mt-0.5">
                            แบบ: {DESIGN_STATE_LABEL[j.design_state] ?? j.design_state}
                            {j.customer_tel && ` · ${j.customer_tel}`}
                            {j.customer_area && ` · ${j.customer_area}`}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {jobSearch.trim() && !jobSearchBusy && jobSearchResults.length === 0 && (
                    <p className="text-xs text-ink-3">ไม่พบงาน — ลองค้นด้วยชื่อหรือเบอร์อื่น</p>
                  )}
                </div>
              )}
              {/* toggle มีแก้ใบเสนอ + แบบ */}
              <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={f.clear_revise}
                  onChange={(e) => set("clear_revise", e.target.checked)}
                  className="w-4 h-4 accent-brand"
                />
                <span className="text-xs text-ink-2">มีแก้ใบเสนอ + แบบ (ตั้ง REVISING อัตโนมัติตอนปิดคิว)</span>
              </label>
            </Field>
          ) : jobCat === "ประเมินหน้างาน" ? (
            /* ---- ประเมินหน้างาน: ลูกค้าใหม่ / ลูกค้าเก่า ---- */
            <Field label="ลูกค้า *" wide>
              {/* toggle ลูกค้าใหม่ / ลูกค้าเก่า */}
              <div className="flex gap-2 mb-2">
                {(["new", "old"] as CustMode[]).map((mode) => {
                  const isActive = f.custMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        if (f.custMode === mode) return;
                        setF((s) => ({
                          ...s,
                          custMode: mode,
                          oldCustomerMode: "",
                          customer_name: "",
                          tel: "",
                          target_job_id: null,
                          target_customer_id: null,
                        }));
                        setSelectedCust(null);
                        setSelectedJob(null);
                        setCustSearch("");
                        setCustSearchResults([]);
                        setJobSearch("");
                        setJobSearchResults([]);
                      }}
                      className={`press flex-1 rounded-lg px-3 py-2 text-sm font-semibold border transition-colors min-h-[44px]
                        ${isActive
                          ? "bg-brand text-white border-brand"
                          : "glass-soft text-ink-2 hover:bg-white/60"
                        }`}
                    >
                      {mode === "new" ? "ลูกค้าใหม่" : "ลูกค้าเก่า"}
                    </button>
                  );
                })}
              </div>

              {f.custMode === "new" ? (
                /* ลูกค้าใหม่ — พิมพ์ชื่อเอง */
                <input
                  value={f.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  placeholder="คุณ…"
                  className={inp}
                />
              ) : (
                /* ลูกค้าเก่า — ค้น → เลือก → เลือก mode หน้างาน */
                <div className="space-y-2.5">
                  {/* (BUG-1) แจ้งเมื่อ edit แล้วมี target อยู่แล้ว แต่ยังไม่ได้ค้นใหม่ */}
                  {editing && !selectedCust && (f.target_customer_id != null || f.target_job_id != null) && (
                    <div className="glass-soft rounded-xl px-3 py-2.5 flex items-start gap-2 border border-sky-200">
                      <Icon name="info" size={14} className="shrink-0 mt-0.5 text-sky-600" />
                      <p className="text-xs text-sky-700">
                        {f.target_customer_id != null
                          ? "ผูกลูกค้าเดิม (หน้างานใหม่) ไว้แล้ว — กดเปลี่ยนโหมดถ้าต้องการแก้ (ไม่แตะ = คงค่าเดิม)"
                          : "ผูกงานเดิม (หน้างานเดิม) ไว้แล้ว — กดเปลี่ยนโหมดถ้าต้องการแก้ (ไม่แตะ = คงค่าเดิม)"}
                      </p>
                    </div>
                  )}
                  {/* ค้นลูกค้า */}
                  {!selectedCust ? (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">
                          <Icon name="search" size={14} />
                        </span>
                        <input
                          value={custSearch}
                          onChange={(e) => setCustSearch(e.target.value)}
                          placeholder="พิมพ์ชื่อลูกค้า หรือเบอร์โทร…"
                          className={`${inp} pl-8`}
                        />
                        {custSearchBusy && (
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3">
                            <Icon name="refresh" size={13} className="animate-spin" />
                          </span>
                        )}
                      </div>
                      {custSearchResults.length > 0 && (
                        <div className="glass-soft rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                          {custSearchResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selectCustomer(c)}
                              className="w-full text-left px-3 py-2.5 hover:bg-white/60 border-b border-gray-100 last:border-0 transition-colors"
                            >
                              <div className="font-semibold text-sm text-brand-dark">{c.name}</div>
                              <div className="text-xs text-ink-3 mt-0.5">
                                {c.phone && `โทร: ${c.phone}`}
                                {c.address && ` · ${c.address}`}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {custSearch.trim() && !custSearchBusy && custSearchResults.length === 0 && (
                        <p className="text-xs text-ink-3">ไม่พบลูกค้า — ลองค้นด้วยชื่อหรือเบอร์อื่น</p>
                      )}
                    </div>
                  ) : (
                    /* การ์ดลูกค้าที่เลือกแล้ว */
                    <div className="glass-soft rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-brand-dark text-sm">{selectedCust.name}</div>
                        <div className="text-xs text-ink-3 mt-0.5">
                          {selectedCust.phone && `โทร: ${selectedCust.phone}`}
                          {selectedCust.address && ` · ${selectedCust.address}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={clearCustomer}
                        className="press shrink-0 text-xs text-ink-3 hover:text-red-600 px-1.5 py-1 rounded-lg"
                      >
                        [เปลี่ยน]
                      </button>
                    </div>
                  )}

                  {/* เลือก mode หน้างาน (แสดงเมื่อเลือกลูกค้าแล้ว) */}
                  {selectedCust && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-ink-2">เลือกหน้างาน:</p>
                      <div className="flex gap-2">
                        {(["existing_site", "new_site"] as OldCustomerMode[]).map((mode) => {
                          if (!mode) return null;
                          const isActive = f.oldCustomerMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => selectOldCustomerMode(mode)}
                              className={`press flex-1 rounded-lg px-2 py-2 text-sm font-semibold border transition-colors min-h-[44px]
                                ${isActive
                                  ? "bg-sky-600 text-white border-sky-600"
                                  : "glass-soft text-ink-2 hover:bg-white/60"
                                }`}
                            >
                              {mode === "existing_site" ? "หน้างานเดิม" : "หน้างานใหม่"}
                            </button>
                          );
                        })}
                      </div>
                      {f.oldCustomerMode === "existing_site" && (
                        <p className="text-[11px] text-sky-700 bg-sky-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                          <Icon name="info" size={12} />
                          สร้างงานใหม่ที่ไซต์เดิม (ดึงที่อยู่/โลเคชั่น/คอนแทคเดิมมาให้)
                        </p>
                      )}
                      {f.oldCustomerMode === "new_site" && (
                        <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                          <Icon name="info" size={12} />
                          สร้างงานใหม่ใต้ลูกค้าเดิม — ลูกค้าไม่เพิ่มซ้ำ
                        </p>
                      )}
                    </div>
                  )}

                  {/* ไซต์อ้างอิง (เมื่อเลือก หน้างานเดิม) — auto-pick งานล่าสุด, เปลี่ยนได้ */}
                  {selectedCust && f.oldCustomerMode === "existing_site" && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-ink-2">ไซต์อ้างอิง</p>

                      {/* กำลังโหลด auto */}
                      {siteInfoBusy && !selectedJob && (
                        <div className="glass-soft rounded-xl px-3 py-2.5 flex items-center gap-2 text-sky-600">
                          <Icon name="refresh" size={14} className="animate-spin shrink-0" />
                          <span className="text-xs">กำลังโหลดไซต์ล่าสุด…</span>
                        </div>
                      )}

                      {/* auto-picked แล้ว — โชว์การ์ด */}
                      {selectedJob && !changingSite && (
                        <div className="glass-soft rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                          {siteInfoBusy && (
                            <span className="shrink-0 text-sky-500 mt-0.5">
                              <Icon name="refresh" size={14} className="animate-spin" />
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-brand-dark text-sm">
                              ไซต์อ้างอิง: {selectedJob.job_code ?? "—"} · {selectedJob.customer_area ?? selectedJob.customer_name}
                            </div>
                            <div className="text-xs text-ink-3 mt-0.5">
                              {selectedJob.customer_name}
                              {selectedJob.customer_tel && ` · ${selectedJob.customer_tel}`}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={clearTargetJob}
                            className="press shrink-0 text-xs text-ink-3 hover:text-sky-600 px-1.5 py-1 rounded-lg"
                          >
                            [เปลี่ยนไซต์]
                          </button>
                        </div>
                      )}

                      {/* ไม่มีงานเลย — โน้ต + ให้กรอกเอง */}
                      {noJobsForCust && !selectedJob && !siteInfoBusy && (
                        <div className="glass-soft rounded-xl px-3 py-2 flex items-start gap-2 border border-amber-200">
                          <Icon name="info" size={13} className="shrink-0 mt-0.5 text-amber-600" />
                          <p className="text-xs text-amber-700">
                            ลูกค้านี้ยังไม่มีงานเดิมในระบบ — กรอกที่อยู่/โลเคชั่นเองด้านล่าง
                          </p>
                        </div>
                      )}

                      {/* search box — แสดงเมื่อกำลังเปลี่ยนไซต์ */}
                      {changingSite && (
                        <div className="space-y-1.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">
                              <Icon name="search" size={14} />
                            </span>
                            <input
                              value={jobSearch}
                              onChange={(e) => setJobSearch(e.target.value)}
                              placeholder="พิมพ์ชื่อลูกค้า หรือเบอร์โทร…"
                              className={`${inp} pl-8`}
                            />
                            {jobSearchBusy && (
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3">
                                <Icon name="refresh" size={13} className="animate-spin" />
                              </span>
                            )}
                          </div>
                          {jobSearchResults.length > 0 && (
                            <div className="glass-soft rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                              {jobSearchResults.map((j) => (
                                <button
                                  key={j.id}
                                  type="button"
                                  onClick={() => selectTargetJob(j)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-white/60 border-b border-gray-100 last:border-0 transition-colors"
                                >
                                  <div className="font-semibold text-sm text-brand-dark">
                                    {j.job_code ?? "—"} · {j.customer_name}
                                  </div>
                                  <div className="text-xs text-ink-3 mt-0.5">
                                    แบบ: {DESIGN_STATE_LABEL[j.design_state] ?? j.design_state}
                                    {j.customer_tel && ` · ${j.customer_tel}`}
                                    {j.customer_area && ` · ${j.customer_area}`}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {jobSearch.trim() && !jobSearchBusy && jobSearchResults.length === 0 && (
                            <p className="text-xs text-ink-3">ไม่พบงาน — ลองค้นด้วยชื่อหรือเบอร์อื่น</p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setChangingSite(false);
                              setJobSearch("");
                              setJobSearchResults([]);
                              // กู้งานที่ auto-pick ไว้ก่อนหน้า (ถ้ามี)
                              if (lastAutoJobRef.current) {
                                setSelectedJob(lastAutoJobRef.current);
                              }
                            }}
                            className="press text-xs text-ink-3 hover:text-ink-1 px-1.5 py-1 rounded-lg"
                          >
                            [ยกเลิก]
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ชื่อลูกค้า (auto-fill จากลูกค้าเดิม แต่แก้ได้) */}
                  {selectedCust && (
                    <div>
                      <p className="text-xs font-medium text-ink-2 mb-1">
                        {f.oldCustomerMode === "new_site" ? "ชื่อลูกค้า (แก้ได้ถ้าต่าง)" : "ชื่อลูกค้า"}
                      </p>
                      <input
                        value={f.customer_name}
                        onChange={(e) => set("customer_name", e.target.value)}
                        placeholder="คุณ…"
                        className={inp}
                        readOnly={f.oldCustomerMode === "existing_site" && !!selectedJob}
                      />
                    </div>
                  )}
                </div>
              )}
            </Field>
          ) : (
            <Field label="ชื่อลูกค้า *" wide>
              <input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)}
                placeholder="คุณ…" className={inp} />
            </Field>
          )}

          {/* Main sales rep (role=MAIN only) — เพิ่มเซลล์ใหม่เองได้ */}
          <Field label="เซลล์">
            {addingSales ? (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    value={newSalesName}
                    onChange={(e) => setNewSalesName(e.target.value)}
                    placeholder="ชื่อเซลล์ใหม่"
                    className={`${inp} flex-1`}
                  />
                  <select value={newSalesTeam} onChange={(e) => setNewSalesTeam(e.target.value as QueueTeam)}
                    className="glass-soft rounded-lg px-2 py-1.5 text-xs outline-none shrink-0">
                    <option value="BKK">กทม.</option>
                    <option value="PHUKET">ภูเก็ต</option>
                  </select>
                  <button type="button" onClick={addMainSales} disabled={addSalesBusy}
                    className="press glass-soft rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-dark disabled:opacity-60 shrink-0">
                    {addSalesBusy ? "…" : "บันทึก"}
                  </button>
                  <button type="button" onClick={() => { setAddingSales(false); setNewSalesName(""); setAddSalesErr(""); }}
                    className="press glass-soft rounded-lg px-2 text-xs text-ink-3 shrink-0">
                    <Icon name="close" size={13} />
                  </button>
                </div>
                {addSalesErr && <p className="text-[11px] text-red-600">{addSalesErr}</p>}
              </div>
            ) : (
              <div className="flex gap-1.5">
                <select value={f.sales_id} onChange={(e) => set("sales_id", e.target.value)} className={`${inp} flex-1`}>
                  <option value="">— ยังไม่ระบุ —</option>
                  {mainSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.team === "PHUKET" ? "ภูเก็ต" : "กทม."})
                    </option>
                  ))}
                </select>
                {!readOnly && (
                  <button type="button" onClick={() => setAddingSales(true)}
                    className="press glass-soft rounded-lg px-2.5 text-xs text-ink-2 shrink-0"
                    title="เพิ่มเซลล์เอง">
                    <Icon name="plus" size={14} />
                  </button>
                )}
              </div>
            )}
          </Field>

          {/* Assistant (role=ASSISTANT) */}
          <Field label="ผู้ช่วยเซลล์">
            {addingAssistant ? (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    value={newAssistantName}
                    onChange={(e) => setNewAssistantName(e.target.value)}
                    placeholder="ชื่อผู้ช่วย"
                    className={`${inp} flex-1`}
                  />
                  <button type="button" onClick={addAssistant} disabled={addAssistBusy}
                    className="press glass-soft rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-dark disabled:opacity-60">
                    {addAssistBusy ? "…" : "บันทึก"}
                  </button>
                  <button type="button" onClick={() => { setAddingAssistant(false); setNewAssistantName(""); setAddAssistErr(""); }}
                    className="press glass-soft rounded-lg px-2 text-xs text-ink-3">
                    <Icon name="close" size={13} />
                  </button>
                </div>
                {addAssistErr && <p className="text-[11px] text-red-600">{addAssistErr}</p>}
              </div>
            ) : managingAssist ? (
              /* (ข้อ 1) โหมดจัดการ — ลิสต์ชื่อผู้ช่วยทั้งหมด กดลบได้ทีละคน */
              <div className="space-y-1.5">
                {localAssistants.length === 0 ? (
                  <p className="text-[11px] text-ink-3 px-1 py-1.5">ยังไม่มีผู้ช่วยในระบบ</p>
                ) : (
                  localAssistants.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 glass-soft rounded-lg px-2.5 py-1.5">
                      <span className="flex-1 text-sm truncate">{a.name}</span>
                      <button type="button" onClick={() => deleteAssistant(a.id, a.name)}
                        className="press inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 shrink-0"
                        title={`ลบ ${a.name}`}>
                        <Icon name="trash" size={13} /> ลบ
                      </button>
                    </div>
                  ))
                )}
                <button type="button" onClick={() => setManagingAssist(false)}
                  className="press text-xs font-semibold text-brand-dark underline px-1 pt-0.5">เสร็จ</button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <select value={f.assistant_id} onChange={(e) => set("assistant_id", e.target.value)}
                  className={`${inp} flex-1`}>
                  <option value="">— ไม่มีผู้ช่วย —</option>
                  {localAssistants.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {!readOnly && localAssistants.length > 0 && (
                  <button type="button" onClick={() => setManagingAssist(true)}
                    className="press rounded-lg px-2.5 text-xs text-red-600 bg-red-50 border border-red-200 shrink-0"
                    title="จัดการ/ลบรายชื่อผู้ช่วย">
                    <Icon name="trash" size={14} />
                  </button>
                )}
                {!readOnly && (
                  <button type="button" onClick={() => setAddingAssistant(true)}
                    className="press glass-soft rounded-lg px-2.5 text-xs text-ink-2 shrink-0"
                    title="เพิ่มผู้ช่วยเอง">
                    <Icon name="plus" size={14} />
                  </button>
                )}
              </div>
            )}
          </Field>

          {!readOnly && (
            <Field label="จัดวันอัตโนมัติ (เสนอวันว่างเร็วสุดตามกฎ)" wide>
              <button type="button" onClick={suggestAuto} disabled={suggesting}
                className="press inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "#1F4E78" }}>
                <Icon name="calendar" size={15} />
                {suggesting ? "กำลังหา…" : "เสนอวัน-เวลา-เซลล์ ที่ว่างเร็วสุด"}
              </button>
              <p className="text-[11px] mt-1.5 text-ink-3">
                เลือกเซลล์/เวลาเองไว้ก่อนได้ → ระบบจะหาแค่วันที่ใกล้สุด · งานหลายจุดจะจัดบ่ายให้อัตโนมัติ
              </p>
              {suggestMsg && <p className="text-[11px] mt-1 text-ink-2">{suggestMsg}</p>}
            </Field>
          )}

          <Field label="วันที่นัด">
            <DateField value={f.queue_date} onChange={(iso) => set("queue_date", iso)} className={inp} />
          </Field>
          <Field label="เวลา (slot)">
            <div className="space-y-1.5">
              <div className="flex gap-2">
                {(["", "10:00", "14:00"] as const).map((slot) => {
                  const isActive = f.queue_time === slot;
                  const label = slot === "" ? "— ยังไม่ระบุ" : slot === "10:00" ? "เช้า 10:00" : "บ่าย 14:00";
                  return (
                    <button key={slot} type="button"
                      onClick={() => set("queue_time", slot)}
                      className={`press flex-1 rounded-lg px-2 py-2 text-sm font-semibold border transition-colors min-h-[44px]
                        ${isActive
                          ? slot === "10:00" ? "bg-sky-600 text-white border-sky-600"
                            : slot === "14:00" ? "bg-amber-500 text-white border-amber-500"
                            : "bg-gray-200 text-ink border-gray-300"
                          : "glass-soft text-ink-2 hover:bg-white/60"
                        }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
              {/* กรอกเวลาเอง — ไม่ล็อกแค่ 10:00/14:00 */}
              <label className="flex items-center gap-2 text-xs text-ink-3">
                หรือกรอกเวลาเอง
                <input type="time" step={60} value={f.queue_time} onChange={(e) => set("queue_time", e.target.value.slice(0, 5))}
                  className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none tabular-nums" />
              </label>
            </div>
          </Field>

          {/* แสดงคำเตือน conflict */}
          {(conflicts.length > 0 || checkingConflict) && (
            <div className="col-span-1 sm:col-span-2">
              {checkingConflict ? (
                <p className="text-[11px] text-ink-3 flex items-center gap-1">
                  <Icon name="refresh" size={11} className="animate-spin" /> ตรวจสอบ slot…
                </p>
              ) : (
                <div className="space-y-1">
                  {conflicts.map((c, i) => (
                    <p key={i} role="alert"
                      className={`text-[12px] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5
                        ${c.kind === "leave" ? "bg-red-50 text-red-700" :
                          c.kind === "full" ? "bg-orange-50 text-orange-800" :
                          "bg-amber-50 text-amber-800"}`}>
                      <Icon name={c.kind === "leave" ? "warn" : "info"} size={13} />
                      {c.msg}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <Field label="ช่องทางติดต่อลูกค้า">
            <div className="flex gap-1.5">
              <select value={f.contact_channel} onChange={(e) => set("contact_channel", e.target.value)}
                className="glass-soft rounded-lg px-2 py-2 text-sm outline-none shrink-0">
                <option value="LINE">Line</option>
                <option value="FB">FB</option>
              </select>
              <input value={f.line_contact} onChange={(e) => set("line_contact", e.target.value)}
                placeholder={f.contact_channel === "FB" ? "ชื่อ/ลิงก์ FB" : "ชื่อ/ID Line"} className={`${inp} flex-1`} />
            </div>
          </Field>

          {/* เบอร์โทร — onBlur format ใส่ขีด (ฟีเจอร์ C) */}
          <Field label="เบอร์โทร">
            <input
              value={f.tel}
              onChange={(e) => set("tel", e.target.value)}
              onBlur={(e) => {
                set("tel", formatThaiPhone(e.target.value));
              }}
              placeholder="085-691-9545"
              className={inp}
              inputMode="tel"
              // readonly ถ้าเคลียร์แบบ + เลือกงานแล้ว หรือ ลูกค้าเก่าหน้างานเดิม + เลือกงานแล้ว
              readOnly={
                (jobCat === "เคลียร์แบบ" && !!selectedJob) ||
                (jobCat === "ประเมินหน้างาน" && f.custMode === "old" && f.oldCustomerMode === "existing_site" && !!selectedJob)
              }
            />
          </Field>

          {/* ที่อยู่ / โลเคชั่น: ซ่อนใน mode เคลียร์แบบ (ไม่จำเป็น) */}
          {jobCat !== "เคลียร์แบบ" && (
            <>
              <Field label="ที่อยู่" wide>
                <textarea value={f.address} onChange={(e) => set("address", e.target.value)} rows={2}
                  className={`${inp} resize-none`} />
              </Field>

              {/* ── โลเคชั่น: ลิงก์(ให้เซลล์) + สเตตัสชัด + ปักหมุดง่าย ── */}
              <div className="sm:col-span-2 space-y-2">
                {/* ขั้น 1: ลิงก์แมพ — บันทึกไว้ส่งให้เซลล์เสมอ แม้ระบบอ่านพิกัดไม่ได้ */}
                <label className="block text-sm font-medium text-ink-2">
                  1) ลิงก์แมพ <span className="font-normal text-ink-3">— วางลิงก์ที่ลูกค้าส่งมา (เก็บไว้ส่งให้เซลล์เสมอ)</span>
                </label>
                <input value={f.location_url}
                  onChange={(e) => { set("location_url", e.target.value); setResolved(null); setManualCoords(null); setCoordText(""); }}
                  onBlur={resolveLink}
                  placeholder="วางลิงก์ Google Maps ที่นี่" className={inp} />

                {/* ขั้น 2: สเตตัสใหญ่ ชัดเจน — บอกตลอดว่าเซฟพิกัดลงระบบแล้วหรือยัง */}
                {resolving ? (
                  <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2.5 text-sm text-sky-800 flex items-center gap-2">
                    <Icon name="refresh" size={16} className="animate-spin shrink-0" /> กำลังอ่านพิกัดจากลิงก์…
                  </div>
                ) : coords ? (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-800">
                    <div className="font-semibold flex items-center gap-1.5"><Icon name="check" size={16} className="shrink-0" /> บันทึกโลเคชั่นลงระบบแล้ว ✓</div>
                    <div className="text-[12px] mt-0.5 text-emerald-700">
                      {manualCoords ? "ปักหมุดเอง" : resolved ? "ระบบอ่านลิงก์ + ปักหมุดให้อัตโนมัติ" : "อ่านพิกัดจากลิงก์"} · {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                    </div>
                  </div>
                ) : f.location_url ? (
                  <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2.5 text-sm text-amber-900">
                    <div className="font-semibold flex items-center gap-1.5"><Icon name="warn" size={16} className="shrink-0" /> ระบบอ่านพิกัดจากลิงก์นี้ไม่ได้</div>
                    <div className="text-[12px] mt-0.5">ลิงก์ถูกเก็บให้เซลล์เรียบร้อย — แต่ต้อง <b>ปักหมุดเอง 1 ครั้ง</b> เพื่อใช้จัดคิว (เลือกวิธีด้านล่าง 👇)</div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-sm text-ink-3">
                    📍 วางลิงก์ด้านบน หรือปักหมุดบนแผนที่ด้านล่าง (เพื่อใช้จัดคิวอัตโนมัติ)
                  </div>
                )}

                {/* ขั้น 3: ปักเอง — โชว์เด่นเฉพาะตอน "ยังไม่มีพิกัด" (อ่านลิงก์ไม่ได้/ยังไม่ปัก) */}
                {!coords && !resolving && (
                  <div className="rounded-lg bg-amber-50/60 border border-amber-200 p-3 space-y-2">
                    <p className="text-[12px] font-semibold text-amber-900">ปักหมุดเอง — เลือกทางใดก็ได้:</p>
                    <p className="text-[12px] text-ink-2">① <b>คลิกหรือลากหมุด</b> บนแผนที่ด้านล่าง</p>
                    <div className="text-[12px] text-ink-2">
                      ② หรือ <b>วางพิกัด</b>: {f.location_url && /^https?:\/\//i.test(f.location_url) && (
                        <a href={f.location_url} target="_blank" rel="noopener noreferrer" className="text-brand font-semibold underline">เปิดแมพ</a>
                      )} {f.location_url && /^https?:\/\//i.test(f.location_url) && "→ "}กดค้างที่หมุดใน Google Maps → ก๊อปตัวเลขพิกัด → วางช่องนี้
                      <input value={coordText}
                        onChange={(e) => { const v = e.target.value; setCoordText(v); const c = parseLatLng(v); if (c) setManualCoords(c); }}
                        placeholder="เช่น 13.65782, 100.47339"
                        className={`${inp} mt-1`} />
                    </div>
                  </div>
                )}

                {/* แผนที่ปักหมุด */}
                <MapPicker
                  lat={coords?.lat ?? null}
                  lng={coords?.lng ?? null}
                  onChange={(lat, lng) => { setManualCoords({ lat, lng }); setCoordText(""); }}
                />
              </div>

              {/* (0070) ออกเอกสารในนาม — เลือกได้ตั้งแต่ลงคิว → กดเสร็จแล้วเป็น "นามออกบิล" ให้ลูกค้าอัตโนมัติ */}
              <Field label="ออกเอกสารในนาม" wide>
                <div className="flex flex-col gap-1.5 text-sm">
                  {([
                    ["SITE", "ตามชื่อหน้างาน (ใช้ชื่อ/ที่อยู่ลูกค้าด้านบน)"],
                    ["OTHER_ADDR", "ที่อยู่อื่น (ออกบิลคนละที่กับหน้างาน)"],
                    ["COMPANY", "ในนามบริษัท (นิติบุคคล)"],
                  ] as const).map(([v, label]) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="bill_choice" checked={f.bill_choice === v} onChange={() => set("bill_choice", v)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                {f.bill_choice === "OTHER_ADDR" && (
                  <textarea value={f.bill_address} onChange={(e) => set("bill_address", e.target.value)} rows={2}
                    placeholder="ที่อยู่ออกบิล (คนละที่กับหน้างาน)" className={`${inp} mt-2 resize-none`} />
                )}
                {f.bill_choice === "COMPANY" && (
                  <div className="mt-2 space-y-2">
                    <input value={f.bill_name} onChange={(e) => set("bill_name", e.target.value)} placeholder="ชื่อบริษัท" className={inp} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={f.bill_tax_id} onChange={(e) => set("bill_tax_id", e.target.value)} placeholder="เลขผู้เสียภาษี 13 หลัก" className={inp} />
                      <input value={f.bill_branch} onChange={(e) => set("bill_branch", e.target.value)} placeholder="สำนักงานใหญ่ / สาขาที่ 00001" className={inp} />
                    </div>
                    <textarea value={f.bill_address} onChange={(e) => set("bill_address", e.target.value)} rows={2} placeholder="ที่อยู่บริษัท (ตามภาษี)" className={`${inp} resize-none`} />
                    <input value={f.bill_postal} onChange={(e) => set("bill_postal", e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="รหัสไปรษณีย์" className={`${inp} max-w-[180px]`} />
                  </div>
                )}
                <p className="text-[11px] text-ink-3 mt-1.5">พอกดคิวเสร็จ ระบบบันทึกเป็น &quot;นามออกบิล&quot; ให้ลูกค้าอัตโนมัติ · แก้ทีหลังได้ในทะเบียนลูกค้า</p>
              </Field>
            </>
          )}

          <Field label="ขนาดงาน">
            <select value={f.job_size} onChange={(e) => set("job_size", e.target.value as "" | JobSize)} className={inp}>
              <option value="">— เลือก —</option>
              {(Object.keys(JOB_SIZE_META) as JobSize[]).map((k) => (
                <option key={k} value={k}>{JOB_SIZE_META[k]}</option>
              ))}
            </select>
          </Field>

          <Field label="ค่าประเมิน">
            {f.feeCustom ? (
              <div className="flex gap-1.5">
                <input type="number" value={f.assess_fee}
                  onChange={(e) => set("assess_fee", e.target.value)} className={inp} />
                <button type="button" onClick={() => { set("feeCustom", false); set("assess_fee", ""); }}
                  className="press glass-soft rounded-lg px-2 text-xs text-ink-2">เลือก</button>
              </div>
            ) : (
              <select value={f.assess_fee} onChange={(e) => {
                if (e.target.value === "__custom") { set("feeCustom", true); set("assess_fee", ""); }
                else set("assess_fee", e.target.value);
              }} className={inp}>
                <option value="">— เลือก —</option>
                {FEE_OPTIONS.map((v) => <option key={v} value={v}>{v.toLocaleString()}</option>)}
                <option value="__custom">พิมพ์เอง…</option>
              </select>
            )}
          </Field>

          {/* ---- การชำระ — dropdown (ฟีเจอร์ A) ---- */}
          <Field label="การชำระ">
            <div className="space-y-1.5">
              <select
                value={f.payment}
                onChange={(e) => set("payment", e.target.value)}
                className={inp}
              >
                {/* ถ้าค่าเดิมไม่ตรง 4 ตัวเลือก → แสดงเป็น option แรก กันข้อมูลหาย */}
                {paymentNotInList && (
                  <option value={f.payment}>{f.payment}</option>
                )}
                <option value="">— ยังไม่ระบุ —</option>
                {PAYMENT_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {/* hint มัดจำหน้างาน */}
              {f.payment === "มัดจำหน้างาน" && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                  <Icon name="warn" size={12} className="shrink-0 mt-0.5" />
                  ปิดคิวแล้วจะมัดจำอัตโนมัติ เข้าผลิตทันที (ไม่รอแบบ) + ติดป้ายด่วน
                </p>
              )}
            </div>
          </Field>

          <Field label="สถานะ">
            <select value={f.status} onChange={(e) => set("status", e.target.value as QueueStatus)} className={inp}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].th}</option>)}
            </select>
          </Field>
          <Field label="ชำระค่าประเมิน">
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
              <input type="checkbox" checked={f.fee_paid}
                onChange={(e) => set("fee_paid", e.target.checked)}
                className="w-4 h-4 accent-emerald-600" />
              <span className="text-ink-2">ชำระค่าประเมินแล้ว</span>
            </label>
          </Field>
          <Field label="ใบเสร็จ">
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
              <input type="checkbox" checked={f.receipt_done}
                onChange={(e) => set("receipt_done", e.target.checked)}
                className="w-4 h-4 accent-brand" />
              <span className="text-ink-2">ส่งใบเสร็จให้ลูกค้าแล้ว</span>
            </label>
          </Field>

          <Field label="หมายเหตุแอดมิน" wide>
            <input value={f.note_admin} onChange={(e) => set("note_admin", e.target.value)} className={inp} />
          </Field>
        </fieldset>

        {err && (
          <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>
        )}

        <div className="flex items-center gap-2 mt-5">
          {!readOnly && (
            <button onClick={save} disabled={busy}
              className="press inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
              <Icon name="check" size={16} /> {busy ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มคิว"}
            </button>
          )}
          <Badge tone={STATUS_META[f.status].tone}>{STATUS_META[f.status].th}</Badge>
          {!readOnly && editing && (
            <button onClick={remove} disabled={busy}
              className="press inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60">
              <Icon name="trash" size={16} /> ลบ
            </button>
          )}
          <button onClick={onClose} className="press rounded-xl px-4 py-2.5 text-sm text-ink-2 ml-auto">
            {readOnly ? "ปิด" : "ยกเลิก"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full glass-soft rounded-lg px-3 py-2 outline-none";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "col-span-1 sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
