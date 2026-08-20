"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { QueueModal } from "@/components/queue/QueueModal";
import { LeaveModal } from "@/components/queue/LeaveModal";
import { OfficeScheduleModal } from "@/components/queue/OfficeScheduleModal";
import { LeaveSummaryModal } from "@/components/queue/LeaveSummaryModal";
import {
  QueueCalendarView, toIsoWeek,
  type AvailRow,
} from "@/components/queue/QueueCalendarView";
import {
  STATUS_META, STATUS_ORDER, JOB_SIZE_META, dayLabel, dayColor, thaiDate,
  detectTeam, isOfficeOn,
  type QueueEntry, type QueueSales, type QueueStatus, type QueueTeam, type OfficeHalf,
} from "@/lib/queue";

// ---- helpers ----------------------------------------------------------------

const isMapUrl = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps|\/maps\/)/i.test(v);
const fmtBaht = (n: number | null) => (n == null ? "" : n.toLocaleString("th-TH"));

// ---- copy ฟอร์มคิวรายวัน/รายเซลล์ (ไว้ส่งต่อทาง Line) ------------------------
const copyVerb = (jobType: string | null) => {
  const v = (jobType ?? "").trim();
  // ประเมินหน้างาน → "เข้าประเมิน" · ประเภทอื่น/กรอกเอง → "เข้า<ประเภทที่กรอก>" (ไม่ force เสนองาน)
  return v === "" || v === "ประเมินหน้างาน" || v === "ประเมิน" ? "เข้าประเมิน" : `เข้า${v}`;
};
const copyTime = (t: string | null) => {
  const m = String(t ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1]}.${m[2]}` : "-";
};
const copyDateBE = (iso: string) => {
  const [y, mo, da] = iso.split("-").map(Number);
  return `${da}/${mo}/${y}`; // ค.ศ. เต็ม (เลิกใช้ พ.ศ.)
};
// ฟอร์มตามที่เจ้าของกำหนด — ไม่มีข้อมูลส่วนไหนใส่ "-"
function buildSalesDayCopy(date: string, salesName: string, entries: QueueEntry[]): string {
  const head = `คิวประเมิน ${dayLabel(date)} ${copyDateBE(date)} (${salesName})`;
  const blocks = entries.map((e) => {
    const fee = e.assess_fee != null ? `ค่าประเมิน ${e.assess_fee.toLocaleString("th-TH")} บาท` : "-";
    return [
      `${copyTime(e.queue_time)} น. ${copyVerb(e.job_type)}${e.customer_name}`,
      "",
      `( ${e.contact_channel === "FB" ? "FB" : "Line"}: ${e.line_contact?.trim() || "-"} )`,
      "",
      `${e.customer_name} ${e.tel?.trim() || "-"}`,
      e.address?.trim() || "-",
      "",
      e.location_url?.trim() || "-",
      "",
      fee,
    ].join("\n");
  });
  return head + "\n\n" + blocks.join("\n\n\n");
}

// แปลงเวลาเป็นนาที — รองรับทั้ง "09:30", "9:30", "14.00", "9.30" (ข้อมูล import เก่าใช้ "." + ชม.หลักเดียว)
// คืน 99999 ถ้าไม่มี/พาร์สไม่ได้ → คิวไม่ระบุเวลาตกท้ายเซลล์
function timeToMin(t: string | null): number {
  if (!t) return 99999;
  const m = String(t).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return 99999;
  return Number(m[1]) * 60 + Number(m[2]);
}

// เปรียบเทียบคิว: วัน → เซลล์ (ตามลำดับใน salesRank = team→name) → เวลา → ลูกค้า
// salesRank: map sales_id → ลำดับ (ยิ่งน้อยยิ่งมาก่อน); เซลล์ที่ไม่อยู่ในลิสต์/ไม่ระบุ → ท้ายสุด
// ลิงก์ไปออกใบเสร็จ/ใบกำกับภาษี "ค่าประเมินหน้างาน" (VAT 7%) prefill จากคิว — เปิดแท็บใหม่ คิวไม่หาย
//   ลูกค้าในทะเบียน (target_customer_id) → ส่ง cid ให้ดึงหัวบิลเต็ม (เหมือนฟอร์มอื่น)
function feeReceiptHref(e: QueueEntry): string {
  const p = new URLSearchParams();
  if (e.customer_name) p.set("name", e.customer_name);
  if (e.tel) p.set("phone", e.tel);
  if (e.address) p.set("address", e.address);
  if (e.assess_fee != null) p.set("fee", String(e.assess_fee));
  if (e.target_customer_id != null) p.set("cid", String(e.target_customer_id));
  return `/billing-notes/new-fee?${p.toString()}`;
}

function makeQueueCmp(salesRank: Map<string, number>) {
  return (a: QueueEntry, b: QueueEntry): number => {
    const da = a.queue_date ?? "0000-00-00";
    const db = b.queue_date ?? "0000-00-00";
    if (da !== db) return da.localeCompare(db);

    const ra = a.sales_id ? salesRank.get(a.sales_id) ?? 9998 : 9999;
    const rb = b.sales_id ? salesRank.get(b.sales_id) ?? 9998 : 9999;
    if (ra !== rb) return ra - rb;

    // เผื่อชื่อซ้ำลำดับ — เรียงชื่อเซลล์แบบไทยให้เสถียร
    const na = a.sales?.name ?? "";
    const nb = b.sales?.name ?? "";
    if (na !== nb) return na.localeCompare(nb, "th");

    const ta = timeToMin(a.queue_time);
    const tb = timeToMin(b.queue_time);
    if (ta !== tb) return ta - tb;

    return (a.customer_name ?? "").localeCompare(b.customer_name ?? "", "th");
  };
}

function thisMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function thisWeek(): string {
  return toIsoWeek(new Date());
}

function isoWeekLabel(w: string): string {
  const m = w.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return w;
  // Monday of that week
  const [, yr, wk] = m;
  const jan4 = new Date(Date.UTC(Number(yr), 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000 + (Number(wk) - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 5 * 86400000); // Saturday (จ-ส)
  const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const fmt = (d: Date) => `${d.getUTCDate()} ${TH_MON[d.getUTCMonth() + 1]}`;
  return `สัปดาห์ที่ ${m[2]} (${fmt(monday)}–${fmt(sunday)})`;
}

function addWeeks(isoWeek: string, delta: number): string {
  const m = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return isoWeek;
  const [, yr, wk] = m;
  const jan4 = new Date(Date.UTC(Number(yr), 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000 + (Number(wk) - 1) * 7 * 86400000);
  const next = new Date(monday.getTime() + delta * 7 * 86400000);
  return toIsoWeek(new Date(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate()));
}

// "YYYY-MM-DD" → iso week string
function dateToWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoWeek(new Date(y, m - 1, d));
}

// รายการในตารางวัน: คิว / อยู่ออฟฟิศประจำ / วันลา (แทรกรวมกันเรียงตามเซลล์→เวลา)
type DayItem =
  | { kind: "queue"; entry: QueueEntry }
  | { kind: "office"; sales: QueueSales; half: "AM" | "PM" }
  | { kind: "leave"; sales: QueueSales; av: AvailRow };

// ป้าย/สไตล์ของแถว office/leave
function dayItemMeta(it: Extract<DayItem, { kind: "office" | "leave" }>): {
  timeText: string; label: string; rowCls: string; tagCls: string; tagText: string;
} {
  if (it.kind === "office") {
    const isAM = it.half === "AM";
    return {
      timeText: isAM ? "เช้า" : "บ่าย",
      label: `${it.sales.name} อยู่ออฟฟิศ (${isAM ? "เช้า" : "บ่าย"})`,
      rowCls: "bg-indigo-50/40", tagCls: "bg-indigo-100 text-indigo-700", tagText: "ออฟฟิศ",
    };
  }
  const a = it.av;
  const note = a.note ? ` · ${a.note}` : "";
  if (a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY" || a.kind === "WFH") {
    const isWfh = a.kind === "WFH";
    return {
      timeText: "ทั้งวัน",
      label: `${it.sales.name} ${a.kind === "HOLIDAY" ? "วันหยุด" : isWfh ? "WFH (ทำงานที่บ้าน)" : "ลาทั้งวัน"}${note}`,
      rowCls: isWfh ? "bg-sky-50/50" : "bg-red-50/50",
      tagCls: isWfh ? "bg-sky-100 text-sky-700" : "bg-red-100 text-red-700",
      tagText: isWfh ? "WFH" : "ลา",
    };
  }
  if (a.kind === "OFFICE_HALF") {
    return {
      timeText: "เช้า",
      label: `${it.sales.name} อยู่ออฟฟิศเช้า${note}`,
      rowCls: "bg-indigo-50/40", tagCls: "bg-indigo-100 text-indigo-700", tagText: "ออฟฟิศ",
    };
  }
  // LEAVE_HALF
  const isAM = a.half === "AM";
  return {
    timeText: isAM ? "เช้า" : "บ่าย",
    label: `${it.sales.name} ลาครึ่งวัน (${isAM ? "เช้า" : "บ่าย"})${note}`,
    rowCls: "bg-orange-50/50", tagCls: "bg-orange-100 text-orange-700", tagText: "ลา",
  };
}

// ---- component --------------------------------------------------------------

type ViewMode = "list" | "calendar";

export default function QueuePage() {
  const [rows, setRows] = useState<QueueEntry[]>([]);
  const [sales, setSales] = useState<QueueSales[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [unlinked, setUnlinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | { entry: QueueEntry | null; preset?: { queue_date?: string; queue_time?: string; sales_id?: string } }>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copySalesDay = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 1500); }
    catch { alert("คัดลอกไม่สำเร็จ ลองใหม่"); }
  };
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Filter state
  const [filterMonth, setFilterMonth] = useState(thisMonth());
  const [filterWeek, setFilterWeek] = useState(thisWeek());
  const [filterSales, setFilterSales] = useState("");
  const [filterTeam, setFilterTeam] = useState<QueueTeam | "">("");
  const [filterStatus, setFilterStatus] = useState<QueueStatus | "">("");
  const [filterDow, setFilterDow] = useState<number | null>(null); // (ข้อ 6) กรองตามวันในสัปดาห์ 0-6
  const [filterDate, setFilterDate] = useState(""); // เสิชวันที่เจาะจง (YYYY-MM-DD) — ดูคิวรายวัน
  const [overdueOnly, setOverdueOnly] = useState(false); // ปุ่มเตือน: โชว์เฉพาะคิวเลยวันแล้วยังไม่ปิด/เสร็จ

  // วันนี้ (ระดับหน้า) — ใช้เช็ค "เลยกำหนดยังไม่ปิด" · เที่ยงคืนจริงพอสำหรับเทียบวันแบบ string
  const todayStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }, []);
  // คิว "ค้างกำหนด · ยังไม่ปิด" = มีวันนัดที่เลยวันนี้แล้ว + สถานะยังไม่ปิด (ไม่ใช่ DONE/CANCELLED)
  const isOverdueUnclosed = useCallback(
    (e: QueueEntry) =>
      !!e.queue_date && (e.queue_date as string) < todayStr &&
      (e.status === "PENDING" || e.status === "PROPOSED" || e.status === "CONFIRMED"),
    [todayStr]
  );

  // Availability (วันลา) สำหรับ calendar view
  const [avail, setAvail] = useState<AvailRow[]>([]);

  const loadAvail = useCallback(async () => {
    try {
      // โหลดวันลาของเดือนที่แสดง ± 1 เดือน (เพื่อให้ calendar view ข้ามเดือนได้)
      // ไม่กรอง date >= today อีกต่อไป — ต้องการดูวันลาย้อนหลังในตาราง + LeaveSummaryModal
      const res = await api.get<AvailRow[]>("/queue/availability");
      setAvail(res.data ?? []);
    } catch {
      // ไม่ block UI ถ้าโหลดวันลาไม่ได้
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams();
      if (viewMode === "calendar") {
        params.set("week", filterWeek);
      } else {
        if (filterMonth) params.set("month", filterMonth);
      }
      if (filterSales) params.set("sales", filterSales);
      const res = await api.get<QueueEntry[]>(`/queue?${params.toString()}`);
      setRows(res.data ?? []);
      setSales((res.meta?.sales as QueueSales[]) ?? []);
      setCanWrite(Boolean(res.meta?.can_write));
      setUnlinked(Boolean(res.meta?.unlinked));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [viewMode, filterMonth, filterWeek, filterSales]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAvail(); }, [loadAvail]);

  // อ่านลิงก์แผนที่ของคิวเก่าที่ยังไม่มีพิกัด (เมื่อก่อนเว็บอ่านลิงก์ย่อไม่ได้) → เติม lat/lng ทีเดียว
  const backfillGeo = useCallback(async () => {
    if (!confirm("อ่านลิงก์แผนที่ของคิวเก่าที่ยังไม่มีพิกัด แล้วเติมให้อัตโนมัติ?\n(ทำครั้งเดียว ไม่ต้องกรอกใหม่ · อาจใช้เวลาสักครู่)")) return;
    setGeoBusy(true); setGeoMsg("กำลังอ่านลิงก์แผนที่…");
    let totalUpd = 0;
    let failedUrls = new Set<string>();
    try {
      // วน 2 รอบเต็ม — ลิงก์ช้า/หลุดในรอบแรกจะได้โอกาสใหม่ในรอบสอง (คนละ invocation)
      for (let pass = 0; pass < 2; pass++) {
        let after = "", passUpd = 0;
        failedUrls = new Set<string>(); // เก็บเฉพาะรอบล่าสุด (ที่เหลือจริง)
        for (let i = 0; i < 400; i++) {
          const r = await api.post<{ processed: number; updated: number; failed: number; lastId: string; failedSamples?: string[] }>(
            `/queue/backfill-geo?after=${encodeURIComponent(after)}`, {});
          const d = r.data;
          passUpd += d.updated; after = d.lastId;
          (d.failedSamples ?? []).forEach((u) => failedUrls.add(u));
          setGeoMsg(`รอบ ${pass + 1}/2 · กำลังอ่าน… เติมพิกัดสะสม ${totalUpd + passUpd}`);
          if (d.processed === 0) break;
        }
        totalUpd += passUpd;
        if (passUpd === 0) break; // รอบนี้ไม่ได้เพิ่ม → หยุด (ที่เหลืออ่านไม่ได้จริง)
      }
      const remain = failedUrls.size;
      if (remain) console.warn("[backfill-geo] ลิงก์ที่ยังอ่านไม่ได้ (ตัวอย่าง):", [...failedUrls].slice(0, 20));
      setGeoMsg(`เสร็จ — เติมพิกัดได้ ${totalUpd} คิว${remain ? ` · ยังอ่านไม่ได้บางส่วน (ดูตัวอย่างใน Console / แจ้งผมได้)` : ""}`);
      load();
    } catch (e) {
      setGeoMsg("ผิดพลาด: " + (e instanceof Error ? e.message : "ลองใหม่"));
    } finally { setGeoBusy(false); }
  }, [load]);

  // ลำดับเซลล์ตามที่ API ส่งมา (เรียง team → name แล้ว) ใช้จัดกลุ่มคิวตามเซลล์
  const salesRank = useMemo(() => {
    const m = new Map<string, number>();
    sales.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [sales]);

  // ---- client-side filter ----
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const cmp = makeQueueCmp(salesRank);
    return [...rows]
      .filter((e) => {
        // text search
        if (kw) {
          const haystack = [e.customer_name, e.tel, e.address, e.sales?.name, e.queue_date, e.job_type, e.line_contact]
            .filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(kw)) return false;
        }
        // team filter
        if (filterTeam) {
          const team = e.sales?.team ?? detectTeam(e.address, e.lat, e.lng);
          if (team !== filterTeam) return false;
        }
        // ซ่อนคิวที่ "ยกเลิก" จากลิสต์หลัก — กดยกเลิกแล้วต้องหายจริง ไม่เด้งกลับ
        // (ยังดูย้อนหลังได้ด้วยตัวกรองสถานะ = ยกเลิก)
        if (e.status === "CANCELLED" && filterStatus !== "CANCELLED") return false;
        // status filter
        if (filterStatus && e.status !== filterStatus) return false;
        // (ข้อ 6) กรองตามวันในสัปดาห์ — เฉพาะคิวที่มีวันนัด (รอจัดคิวไม่กระทบ)
        if (filterDow != null && e.queue_date) {
          if (new Date(e.queue_date + "T00:00:00").getDay() !== filterDow) return false;
        }
        // (ข้อ 6) เสิชวันที่เจาะจง — โชว์เฉพาะคิววันนั้น
        if (filterDate && e.queue_date !== filterDate) return false;
        // ปุ่มเตือน "ค้างยังไม่ปิด" — โชว์เฉพาะคิวเลยวันแล้วยังไม่ปิด
        if (overdueOnly && !isOverdueUnclosed(e)) return false;
        return true;
      })
      .sort(cmp);
  }, [rows, q, filterTeam, filterStatus, filterDow, filterDate, overdueOnly, isOverdueUnclosed, salesRank]);

  // จำนวนคิว "ค้างกำหนด · ยังไม่ปิด" ทั้งหมดที่โหลดมา (ไม่ขึ้นกับตัวกรองอื่น) — โชว์บนปุ่มเตือน
  const overdueUnclosedCount = useMemo(() => rows.filter(isOverdueUnclosed).length, [rows, isOverdueUnclosed]);

  // แยก "รอจัดคิว" (queue_date=null) ออกจากที่นัดแล้ว
  const pendingRows = useMemo(() => list.filter((e) => !e.queue_date), [list]);
  const scheduledRows = useMemo(() => list.filter((e) => !!e.queue_date), [list]);

  // แก้บั๊ก "เดือน 7 ขึ้นลูกค้าเดือน 6": API ยกคิวเดือนก่อนที่ยังไม่ปิดมาด้วย (กันงานค้างหาย)
  // → แยกคิวที่วันก่อนวันแรกของเดือนที่ดู เป็นกล่อง "ค้าง/เลยกำหนด" ไม่ให้สร้าง section วันเดือนก่อนปนในเดือนนี้
  //   เมื่อค้นวันเจาะจง (filterDate) ไม่แยก — โชว์วันนั้นปกติ
  const monthStart = `${filterMonth}-01`;
  const overdueRows = useMemo(
    () => (filterDate ? [] : scheduledRows.filter((e) => (e.queue_date as string) < monthStart)),
    [scheduledRows, monthStart, filterDate]
  );
  const inMonthRows = useMemo(
    () => (filterDate ? scheduledRows : scheduledRows.filter((e) => (e.queue_date as string) >= monthStart)),
    [scheduledRows, monthStart, filterDate]
  );

  // (ข้อ 3) จันทร์แต่ละสัปดาห์ของเดือนที่ดู (ไว้ทำปุ่มเลื่อน)
  const weekMondays = useMemo(() => {
    if (!filterMonth) return [] as string[];
    const [y, m] = filterMonth.split("-").map(Number);
    const out: string[] = [];
    const d = new Date(y, m - 1, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1); // จันทร์แรกของเดือน
    while (d.getMonth() === m - 1) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      d.setDate(d.getDate() + 7);
    }
    return out.slice(0, 5);
  }, [filterMonth]);

  // เลื่อนไปบล็อกวันแรกที่ >= จันทร์ของสัปดาห์นั้น
  const jumpToWeek = useCallback((monday: string) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[id^="qday-"]'));
    const target = els.find((el) => el.id.slice(5) >= monday) ?? els[els.length - 1];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // จัดกลุ่มตามวัน
  const byDay = useMemo(() => {
    const map = new Map<string, QueueEntry[]>();
    // ใช้เฉพาะคิวในเดือนที่ดู (คิวเดือนก่อนไปอยู่กล่อง "ค้าง/เลยกำหนด")
    inMonthRows.forEach((e) => {
      const d = e.queue_date!;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    });
    return map;
  }, [inMonthRows]);

  // รวมคิว + อยู่ออฟฟิศประจำ + วันลา ของวันนั้น เรียงตาม "เวลา" ก่อน (เซลล์เป็น tiebreak)
  // office ประจำ = แสดงเฉพาะวันนี้เป็นต้นไป (ไม่ย้อนหลัง) และหลบให้คิว (ช่องที่มีคิวแล้วไม่โชว์ออฟฟิศ)
  const buildDayItems = useCallback((d: string): DayItem[] => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const wd = new Date(d + "T00:00:00").getDay();
    const rankOf = (sid: string | null) => (sid ? (salesRank.get(sid) ?? 9998) : 9999);
    const acc: { item: DayItem; sRank: number; tMin: number }[] = [];

    const queues = byDay.get(d) ?? [];
    // ช่องครึ่งวันที่ "มีคิวแล้ว" ของแต่ละเซลล์ (office จะหลบ) — `${sales_id}-AM/PM`
    const occupied = new Set<string>();
    queues.forEach((e) => {
      acc.push({ item: { kind: "queue", entry: e }, sRank: rankOf(e.sales_id), tMin: timeToMin(e.queue_time) });
      if (e.sales_id) {
        const t = timeToMin(e.queue_time);
        if (t < 99999) occupied.add(`${e.sales_id}-${t < 720 ? "AM" : "PM"}`);
      }
    });
    // อยู่ออฟฟิศ (pattern + override รายวัน) — เฉพาะ d >= วันนี้ · ข้ามถ้าลาทั้งวัน หรือช่องนั้นมีคิวแล้ว
    if (d >= todayStr) {
      sales.filter((s) => s.role !== "ASSISTANT").forEach((s) => {
        const fullLeave = avail.some((a) => a.sales_id === s.id && a.date === d && (a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY" || a.kind === "WFH"));
        if (fullLeave) return;
        (["AM", "PM"] as const).forEach((half) => {
          if (!isOfficeOn(s, d, wd, half)) return;
          if (occupied.has(`${s.id}-${half}`)) return; // หลบให้คิว
          acc.push({ item: { kind: "office", sales: s, half }, sRank: rankOf(s.id), tMin: half === "AM" ? 600 : 840 });
        });
      });
    }
    // วันลา/หยุด/อยู่ออฟฟิศ (จาก sales_availability ของวันนั้น) — แสดงทุกวัน (ของจริงที่บันทึกไว้)
    avail.filter((a) => a.date === d).forEach((a) => {
      const s = sales.find((x) => x.id === a.sales_id);
      if (!s) return;
      const tMin = (a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY" || a.kind === "WFH") ? -1 : (a.kind === "LEAVE_HALF" && a.half === "PM") ? 840 : 600;
      acc.push({ item: { kind: "leave", sales: s, av: a }, sRank: rankOf(s.id), tMin });
    });

    // เรียงเซลล์ก่อน → เวลา (ลาทั้งวัน tMin=-1 ขึ้นบนสุดเสมอ)
    // sortKey: ลาทั้งวัน = -9999 · อื่น = sRank*100000 + tMin
    acc.sort((a, b) => {
      const ka = a.tMin === -1 ? -9999 : a.sRank * 100000 + a.tMin;
      const kb = b.tMin === -1 ? -9999 : b.sRank * 100000 + b.tMin;
      return ka - kb;
    });
    return acc.map((x) => x.item);
  }, [byDay, sales, avail, salesRank]);

  // วันที่ต้องมี section ในตาราง = วันที่มีคิว ∪ วันลา/หยุด ∪ วันอยู่ออฟฟิศประจำ (อนาคต)
  // กันบั๊ก: วันลาที่ไม่มีคิวต้องโผล่ในตารางด้วย
  const scheduleDays = useMemo(() => {
    const set = new Set<string>(byDay.keys());
    avail.forEach((a) => { if (a.date.startsWith(filterMonth)) set.add(a.date); });
    // override "add" รายวัน (office พิเศษเฉพาะวัน) ในเดือนนี้
    sales.forEach((s) => { if (s.role !== "ASSISTANT") (s.office_overrides ?? []).forEach((o) => { if (o.action === "add" && o.date.startsWith(filterMonth)) set.add(o.date); }); });
    // office ประจำ (อนาคต) — เพิ่มวัน Mon-Thu ที่มี office_slot
    const officeWeekdays = new Set<number>();
    sales.forEach((s) => { if (s.role !== "ASSISTANT") (s.office_slots ?? []).forEach((o) => officeWeekdays.add(o.weekday)); });
    if (officeWeekdays.size) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const [yy, mm] = filterMonth.split("-").map(Number);
      const last = new Date(yy, mm, 0).getDate();
      for (let dd = 1; dd <= last; dd++) {
        const ds = `${filterMonth}-${String(dd).padStart(2, "0")}`;
        if (ds < todayStr) continue;
        if (officeWeekdays.has(new Date(yy, mm - 1, dd).getDay())) set.add(ds);
      }
    }
    // (ข้อ 6) กดวันในสัปดาห์/เสิชวันที่ → เหลือเฉพาะวันนั้น (กรองทั้งคิว+ลา+ออฟฟิศ)
    return [...set].sort().filter(
      (ds) => (filterDow == null || new Date(ds + "T00:00:00").getDay() === filterDow)
        && (!filterDate || ds === filterDate)
    );
  }, [byDay, avail, sales, filterMonth, filterDow, filterDate]);

  // calendar: entries ในสัปดาห์ที่เลือก (queue_date มีค่า)
  const calEntries = useMemo(() => {
    // เมื่อ viewMode=calendar, load ดึง ?week= มาแล้ว แต่ยังกรองฝั่ง client ด้วย filterTeam/filterStatus/filterSales
    return rows.filter((e) => {
      if (!e.queue_date) return false;
      // ซ่อนคิวที่ยกเลิกจากปฏิทินด้วย (เว้นแต่กรองดูเฉพาะยกเลิก)
      if (e.status === "CANCELLED" && filterStatus !== "CANCELLED") return false;
      if (filterTeam) {
        const team = e.sales?.team ?? detectTeam(e.address, e.lat, e.lng);
        if (team !== filterTeam) return false;
      }
      if (filterStatus && e.status !== filterStatus) return false;
      return true;
    });
  }, [rows, filterTeam, filterStatus]);

  // ปฏิทินแสดงเฉพาะคิว "ประเมิน" ของเซลล์หลัก (MAIN) — คิวที่ผูกผู้ช่วย/โชว์รูม (เช่น ส้ม) ไม่ขึ้นปฏิทิน
  const calMainIds = useMemo(
    () => new Set(sales.filter((s) => s.role !== "ASSISTANT" && (!filterTeam || s.team === filterTeam)).map((s) => s.id)),
    [sales, filterTeam]
  );
  // จำนวนคิวที่ปฏิทินแสดงจริง (เซลล์หลัก) vs คิวโชว์รูม/ผู้ช่วยที่ดูได้ที่ตาราง
  const calShownCount = useMemo(
    () => calEntries.filter((e) => e.sales_id && calMainIds.has(e.sales_id)).length,
    [calEntries, calMainIds]
  );
  const calAssistCount = useMemo(
    () => calEntries.filter((e) => e.sales_id && !calMainIds.has(e.sales_id)).length,
    [calEntries, calMainIds]
  );

  // month options
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const base = new Date();
    for (let i = -2; i <= 3; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  const mainSales = sales.filter((s) => s.role !== "ASSISTANT");

  // เดือนที่ผู้ใช้กำลังดูอยู่ — ใช้เป็น from_date hint ให้ AI suggest
  // list view → filterMonth · calendar view → เดือนของ Monday ของ filterWeek
  const contextMonth = useMemo((): string => {
    if (viewMode === "list") return filterMonth;
    // parse ISO week → วันจันทร์ → ดึงเดือน
    const m = filterWeek.match(/^(\d{4})-W(\d{2})$/);
    if (!m) return filterMonth;
    const [, yr, wk] = m;
    const jan4 = new Date(Date.UTC(Number(yr), 0, 4));
    const jan4Dow = jan4.getUTCDay() || 7;
    const monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000 + (Number(wk) - 1) * 7 * 86400000);
    return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}`;
  }, [viewMode, filterMonth, filterWeek]);

  // ---- toggle receipt ----
  async function toggleReceipt(e: QueueEntry, checked: boolean) {
    setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, receipt_done: checked } : r)));
    try {
      await api.patch(`/queue/${e.id}`, { receipt_done: checked });
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, receipt_done: !checked } : r)));
      alert(err instanceof Error ? err.message : "อัปเดตใบเสร็จไม่สำเร็จ");
    }
  }

  // ---- toggle fee_paid (ชำระค่าประเมิน) ----
  async function toggleFeePaid(e: QueueEntry, checked: boolean) {
    setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, fee_paid: checked } : r)));
    try {
      await api.patch(`/queue/${e.id}`, { fee_paid: checked });
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, fee_paid: !checked } : r)));
      alert(err instanceof Error ? err.message : "อัปเดตค่าประเมินไม่สำเร็จ");
    }
  }

  // ---- (0031) override office รายวัน (ใส่/เอาออก เฉพาะวัน) — optimistic + API ----
  const setOffice = useCallback(async (salesId: string, date: string, half: OfficeHalf, want: boolean) => {
    setSales((prev) => prev.map((s) => {
      if (s.id !== salesId) return s;
      const ovr = (s.office_overrides ?? []).filter((o) => !(o.date === date && o.half === half));
      const wd = new Date(date + "T00:00:00").getDay();
      const inPattern = (s.office_slots ?? []).some((o) => o.weekday === wd && o.half === half);
      if (want && !inPattern) ovr.push({ date, half, action: "add" });
      if (!want && inPattern) ovr.push({ date, half, action: "remove" });
      return { ...s, office_overrides: ovr };
    }));
    try {
      await api.post("/queue/office-override", { sales_id: salesId, date, half, want });
    } catch (err) {
      alert(err instanceof Error ? err.message : "เปลี่ยนวันออฟฟิศไม่สำเร็จ");
      load(); // revert จาก server
    }
  }, [load]);

  // ---- sub-components ----
  const StatusBadge = ({ e }: { e: QueueEntry }) => (
    <Badge tone={STATUS_META[e.status].tone} dot>{STATUS_META[e.status].th}</Badge>
  );

  const MapLink = ({ url }: { url: string | null }) =>
    url && /^https?:\/\//i.test(url) ? (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
        className="inline-flex items-center gap-1 text-brand font-medium hover:underline">
        <Icon name={isMapUrl(url) ? "pin" : "external"} size={13} />
        {isMapUrl(url) ? "แผนที่" : "ลิงก์"}
      </a>
    ) : <span className="text-ink-3">—</span>;

  // (ข้อ 5) เอา "เช้า/บ่าย" ออก — โชว์เวลาล้วน ไม่รก
  const slotLabel = (t: string | null) => (t ? t.slice(0, 5) : "—");

  // ---- render ----
  return (
    <div className="space-y-5">
      <div id="queue-top" />
      {/* Header — sticky top เพื่อให้ปุ่มและ title ลอยอยู่ด้านบนเมื่อ scroll */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm -mx-4 px-4 py-3 border-b border-gray-200/60">
        <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calendar" size={18} />
          </span>
          คิวงาน
        </h1>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200/80 text-sm font-semibold">
            <button
              onClick={() => setViewMode("list")}
              className={`press px-3.5 py-2.5 flex items-center gap-1.5 transition-colors ${viewMode === "list" ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
              <Icon name="clipboard" size={15} /> ตาราง
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`press px-3.5 py-2.5 flex items-center gap-1.5 transition-colors ${viewMode === "calendar" ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
              <Icon name="calendar" size={15} /> ปฏิทิน
            </button>
          </div>

          <button onClick={load} disabled={loading}
            className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-brand-dark disabled:opacity-60">
            <Icon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">รีเฟรช</span>
          </button>
          <button onClick={() => setSummaryOpen(true)}
            className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-ink-2">
            <Icon name="calendar" size={16} /> <span className="hidden sm:inline">สรุปวันลา</span>
          </button>
          {canWrite && (
            <>
              <button onClick={() => setLeaveOpen(true)}
                className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-ink-2">
                <Icon name="calendar" size={16} /> วันลา
              </button>
              <button onClick={() => setOfficeOpen(true)}
                className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-ink-2">
                <Icon name="building" size={16} /> วันออฟฟิศ
              </button>
              <button onClick={backfillGeo} disabled={geoBusy}
                title="อ่านลิงก์แผนที่ของคิวเก่าที่ยังไม่มีพิกัด แล้วเติมให้อัตโนมัติ (กันจัดคิวข้ามจังหวัด)"
                className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-ink-2 disabled:opacity-60">
                <Icon name="pin" size={16} className={geoBusy ? "animate-pulse" : ""} />
                <span className="hidden sm:inline">{geoBusy ? "กำลังอ่าน…" : "อ่านลิงก์แมพ"}</span>
              </button>
              <button onClick={() => setModal({ entry: null })}
                className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
                <Icon name="plus" size={16} /> เพิ่มคิว
              </button>
            </>
          )}
        </div>
        </div>
        {/* (ข้อ 2) ช่องค้นหาตรึงบนสุด — ค้นชื่อที่จัดคิวได้ตลอดแม้ scroll */}
        {viewMode === "list" && (
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><Icon name="search" size={16} /></span>
            <input aria-label="ค้นหาคิว (ตรึงบน)" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา ชื่อ / เซลล์ / ที่อยู่…"
              className="w-full glass-soft rounded-xl pl-9 pr-3 py-2 text-sm outline-none" />
          </div>
        )}
        {/* (ข้อ 4) เมนูไปสัปดาห์ — อยู่ใน header sticky จึงไม่หายเวลาเลื่อนลง */}
        {viewMode === "list" && !q.trim() && weekMondays.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto mt-2 pb-0.5">
            <span className="text-xs text-ink-3 shrink-0">ไปสัปดาห์:</span>
            {weekMondays.map((mon, i) => (
              <button key={mon} type="button" onClick={() => jumpToWeek(mon)}
                className="press text-xs font-semibold glass-soft rounded-lg px-2.5 py-1 text-brand-dark hover:bg-brand/5 shrink-0">
                ส.{i + 1} <span className="text-ink-3">(จ.{Number(mon.slice(8, 10))})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* แถบสีประจำวัน (คีย์สี) — (ข้อ 6) กดเพื่อกรองเฉพาะวันนั้น */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"].map((d, i) => {
          const dowNum = (i + 1) % 7; // จันทร์=1 … เสาร์=6, อาทิตย์=0 (ตรงกับ getDay())
          const c = dayColor(dowSample(d));
          if (!c) return null;
          const active = filterDow === dowNum;
          return (
            <button key={d} type="button" onClick={() => setFilterDow(active ? null : dowNum)}
              title={`กรองเฉพาะวัน${d}`}
              className={`press inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${c.chip} ${active ? "ring-2 ring-brand ring-offset-1" : "opacity-80 hover:opacity-100"}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />{d}
            </button>
          );
        })}
        {filterDow != null && (
          <button type="button" onClick={() => setFilterDow(null)} className="press text-ink-3 underline px-1">ล้างกรองวัน</button>
        )}
        {/* (ข้อ 6) เสิชวันที่เจาะจง + ดูคิววันนี้ */}
        <span className="mx-1 text-gray-300">|</span>
        <input type="date" value={filterDate} aria-label="ดูคิววันที่"
          onChange={(e) => { const v = e.target.value; setFilterDate(v); setFilterDow(null); if (v) setFilterMonth(v.slice(0, 7)); }}
          className="glass-soft rounded-md px-2 py-1 text-[12px] outline-none [&::-webkit-calendar-picker-indicator]:opacity-60" />
        <button type="button"
          onClick={() => { const n = new Date(); const t = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; setFilterDate(t); setFilterDow(null); setFilterMonth(t.slice(0, 7)); }}
          className="press text-[12px] font-semibold glass-soft rounded-md px-2 py-1 text-brand-dark hover:bg-brand/5">คิววันนี้</button>
        {filterDate && (
          <button type="button" onClick={() => setFilterDate("")} className="press text-ink-3 underline px-1 text-[12px]">ล้างวันที่</button>
        )}
      </div>

      {geoMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-brand/10 border border-brand/20 px-3 py-2 text-sm text-brand-dark">
          <Icon name="pin" size={15} className={geoBusy ? "animate-pulse shrink-0" : "shrink-0"} />
          <span>{geoMsg}</span>
          {!geoBusy && <button onClick={() => setGeoMsg("")} className="press ml-auto text-ink-3 hover:text-ink-2"><Icon name="close" size={15} /></button>}
        </div>
      )}

      <Card className="p-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap mb-4">

          {/* Period filter: month (list) / week (calendar) */}
          {viewMode === "list" ? (
            <label className="flex items-center gap-1.5 text-sm text-ink-2">
              <Icon name="calendar" size={14} />
              <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none min-w-[120px]">
                {monthOptions.map((m) => {
                  const [yr, mo] = m.split("-");
                  return <option key={m} value={m}>{mo}/{yr}</option>;
                })}
              </select>
            </label>
          ) : (
            <div className="flex items-center gap-1 text-sm text-ink-2">
              <button onClick={() => setFilterWeek((w) => addWeeks(w, -1))}
                className="press glass-soft rounded-lg p-1.5 text-ink-2" aria-label="สัปดาห์ก่อน">
                <Icon name="arrowLeft" size={14} />
              </button>
              <span className="glass-soft rounded-lg px-3 py-1.5 text-sm tabular-nums min-w-[200px] text-center">
                {isoWeekLabel(filterWeek)}
              </span>
              <button onClick={() => setFilterWeek((w) => addWeeks(w, 1))}
                className="press glass-soft rounded-lg p-1.5 text-ink-2 rotate-180" aria-label="สัปดาห์ถัดไป">
                <Icon name="arrowLeft" size={14} />
              </button>
              <button onClick={() => setFilterWeek(thisWeek())}
                className="press glass-soft rounded-lg px-2.5 py-1.5 text-xs text-ink-2">
                วันนี้
              </button>
            </div>
          )}

          {/* Sales filter (ADMIN only) */}
          {canWrite && (
            <label className="flex items-center gap-1.5 text-sm text-ink-2">
              <Icon name="users" size={14} />
              <select value={filterSales} onChange={(e) => setFilterSales(e.target.value)}
                className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none min-w-[110px]">
                <option value="">ทุกเซลล์</option>
                {mainSales.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          {/* Team filter */}
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <Icon name="pin" size={14} />
            <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value as QueueTeam | "")}
              className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none">
              <option value="">ทุกพื้นที่</option>
              <option value="BKK">กทม.</option>
              <option value="PHUKET">ภูเก็ต</option>
            </select>
          </label>

          {/* Status filter */}
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <Icon name="check" size={14} />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as QueueStatus | "")}
              className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none min-w-[120px]">
              <option value="">ทุกสถานะ</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].th}</option>
              ))}
            </select>
          </label>

          {/* ปุ่มเตือน "ค้างยังไม่ปิด" — กดเพื่อดูเฉพาะคิวเลยวันแล้วยังไม่กดปิด/เสร็จ (list mode) */}
          {viewMode === "list" && (overdueUnclosedCount > 0 || overdueOnly) && (
            <button
              type="button"
              onClick={() => setOverdueOnly((v) => !v)}
              aria-pressed={overdueOnly}
              title="ดูเฉพาะคิวที่เลยวันนัดแล้วยังไม่กดปิด/เสร็จ"
              className={`press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold border ${
                overdueOnly
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
              }`}
            >
              <Icon name="warn" size={14} />
              ค้างยังไม่ปิด
              <span className={`tabular-nums rounded-md px-1.5 py-0.5 text-xs ${overdueOnly ? "bg-white/25" : "bg-red-200/70"}`}>
                {overdueUnclosedCount}
              </span>
            </button>
          )}

          {/* Text search (list mode only) */}
          {viewMode === "list" && (
            <label className="relative block flex-1 min-w-[180px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
                <Icon name="search" size={16} />
              </span>
              <input aria-label="ค้นหาคิว" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหา ชื่อ / เซลล์ / ที่อยู่…"
                className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
            </label>
          )}

          <span className="text-sm text-ink-3 tabular-nums ml-auto flex items-center gap-1.5">
            {viewMode === "list" ? (
              `${list.length} คิว`
            ) : (
              <>
                {calShownCount} คิวประเมิน/สัปดาห์
                {calAssistCount > 0 && (
                  <span className="text-[11px] text-ink-3 bg-gray-100 rounded-md px-1.5 py-0.5 whitespace-nowrap">
                    +{calAssistCount} โชว์รูม · ดูที่ตาราง
                  </span>
                )}
              </>
            )}
          </span>
        </div>

        {/* Error / empty states */}
        {err ? (
          <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <span>{err}</span>
            <button onClick={load} className="press font-semibold text-red-800 underline shrink-0">ลองใหม่</button>
          </div>
        ) : unlinked ? (
          <p className="text-center text-ink-3 py-12">
            บัญชีนี้ยังไม่ถูกผูกกับเซลล์ — แจ้งแอดมินให้ผูกบัญชีเพื่อดูคิวของคุณ
          </p>
        ) : loading && rows.length === 0 ? (
          <p className="text-center text-ink-3 py-12">กำลังโหลด…</p>
        ) : viewMode === "calendar" ? (
          /* ===== Calendar View ===== */
          <>
            <QueueCalendarView
              week={filterWeek}
              entries={calEntries}
              sales={sales}
              avail={avail}
              onEntryClick={(e) => setModal({ entry: e })}
              onAddSlot={canWrite ? (date, slot, salesId) => setModal({ entry: null, preset: { queue_date: date, queue_time: slot, sales_id: salesId } }) : undefined}
              onSetOffice={canWrite ? setOffice : undefined}
              filterTeam={filterTeam}
            />
            {(() => {
              const noSalesCount = calEntries.filter((e) => !e.sales_id).length;
              return noSalesCount > 0 ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                  <Icon name="warn" size={15} className="shrink-0" />
                  <span>มี {noSalesCount} คิวยังไม่ระบุเซลล์ — ดูที่มุมมองตาราง</span>
                </div>
              ) : null;
            })()}
          </>
        ) : (
          /* ===== List View ===== */
          <>
            {overdueOnly ? (
              /* ปุ่มเตือน "ค้างยังไม่ปิด" กดอยู่ → โชว์คิวเลยวันแล้วยังไม่ปิดทั้งหมด เป็นลิสต์เดียว (ทุกเดือนที่โหลดมา) */
              list.length === 0 ? (
                <p className="text-center text-emerald-700 py-12 font-medium">
                  ✓ ไม่มีคิวค้าง — ปิด/เสร็จครบทุกคิวที่เลยวันแล้ว
                </p>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 text-white text-sm font-semibold">
                      <Icon name="warn" size={14} />
                      ค้างกำหนด · ยังไม่กดปิด/เสร็จ
                      <span className="tabular-nums ml-1 bg-white/25 rounded-md px-1.5 py-0.5 text-xs">{list.length}</span>
                    </span>
                    <span className="text-xs text-ink-3">เรียงวันเก่าสุดก่อน · กดแต่ละคิวเพื่อปิด/เลื่อน</span>
                  </div>
                  <div className="xl:hidden space-y-2">
                    {list.map((e) => <MobileCard key={e.id} e={e} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} />)}
                  </div>
                  <div className="hidden xl:block overflow-x-auto rounded-xl border border-red-100">
                    <DesktopTable rows={list} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} slotLabel={slotLabel} />
                  </div>
                </div>
              )
            ) : q.trim() ? (
              /* (ข้อ 3) เสิชชื่อ → ผลลัพธ์เด้งขึ้นบนสุดทันที (flat ไม่ต้องเลื่อนหา) */
              list.length === 0 ? (
                <p className="text-center text-ink-3 py-12">ไม่พบ &quot;{q}&quot;</p>
              ) : (
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand/10 text-brand-dark text-sm font-semibold mb-2">
                    <Icon name="search" size={14} /> ผลค้นหา
                    <span className="tabular-nums ml-1 bg-brand/15 rounded-md px-1.5 py-0.5 text-xs">{list.length}</span>
                  </div>
                  <div className="xl:hidden space-y-2">
                    {list.map((e) => <MobileCard key={e.id} e={e} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} />)}
                  </div>
                  <div className="hidden xl:block overflow-x-auto rounded-xl border border-gray-100">
                    <DesktopTable rows={list} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} slotLabel={slotLabel} />
                  </div>
                </div>
              )
            ) : (scheduleDays.length === 0 && overdueRows.length === 0 && (filterDow != null || filterDate || pendingRows.length === 0)) ? (
              <p className="text-center text-ink-3 py-12">
                {filterDow != null || filterDate
                  ? 'ไม่มีคิว/วันลาในวันที่เลือก — กดล้างเพื่อดูทั้งหมด'
                  : filterTeam || filterStatus ? "ไม่พบรายการที่กรอง" : "ยังไม่มีคิว/วันลาในช่วงนี้"}
              </p>
            ) : (
              <>
            {/* กล่อง "ค้าง/เลยกำหนด" — คิวเดือนก่อนที่ยังไม่ปิด (แยกออกจากวันของเดือนนี้ · กันโผล่ปนข้ามเดือน) */}
            {overdueRows.length > 0 && filterDow == null && !filterDate && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold">
                    <Icon name="calendar" size={14} />
                    ค้าง / เลยกำหนด (เดือนก่อน · ยังไม่ปิด)
                    <span className="tabular-nums ml-1 bg-red-200/70 rounded-md px-1.5 py-0.5 text-xs">{overdueRows.length}</span>
                  </span>
                </div>
                <div className="xl:hidden space-y-2">
                  {overdueRows.map((e) => <MobileCard key={e.id} e={e} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} />)}
                </div>
                <div className="hidden xl:block overflow-x-auto rounded-xl border border-red-100">
                  <DesktopTable rows={overdueRows} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} slotLabel={slotLabel} />
                </div>
              </div>
            )}

            {/* กล่อง "รอจัดคิว" — ซ่อนตอนกรองวัน (ข้อ 6) เพราะรอจัดคิวยังไม่มีวันนัด */}
            {pendingRows.length > 0 && filterDow == null && !filterDate && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold">
                    <Icon name="calendar" size={14} />
                    รอจัดคิว
                    <span className="tabular-nums ml-1 bg-amber-200/70 rounded-md px-1.5 py-0.5 text-xs">{pendingRows.length}</span>
                  </span>
                </div>
                {/* mobile cards */}
                <div className="xl:hidden space-y-2">
                  {pendingRows.map((e) => <MobileCard key={e.id} e={e} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} />)}
                </div>
                {/* desktop table */}
                <div className="hidden xl:block overflow-x-auto rounded-xl border border-amber-100">
                  <DesktopTable rows={pendingRows} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} slotLabel={slotLabel} />
                </div>
              </div>
            )}

            {/* คิว + วันลา/อยู่ออฟฟิศ จัดกลุ่มตามวัน (รวมวันที่ไม่มีคิวแต่มีลา/ออฟฟิศ) */}
            {scheduleDays.length > 0 && (
              <div className="space-y-4">
                {scheduleDays.map((d) => {
                  const items = buildDayItems(d);
                  if (items.length === 0) return null;
                  const dayRows = byDay.get(d) ?? [];
                  const c = dayColor(d);
                  const label = `${dayLabel(d)} ${thaiDate(d)}`;
                  // จัดกลุ่มคิวตามเซลล์ (เรียงเวลา) สำหรับปุ่มคัดลอกฟอร์มรายเซลล์
                  const copyGroups = (() => {
                    const m = new Map<string, { name: string; entries: QueueEntry[] }>();
                    dayRows.forEach((e) => {
                      if (!e.sales) return;
                      const g = m.get(e.sales.id) ?? { name: e.sales.name, entries: [] };
                      g.entries.push(e);
                      m.set(e.sales.id, g);
                    });
                    return [...m.values()].map((g) => ({
                      name: g.name,
                      entries: [...g.entries].sort((a, b) => timeToMin(a.queue_time) - timeToMin(b.queue_time)),
                    }));
                  })();
                  return (
                    <div key={d} id={`qday-${d}`} className="scroll-mt-28">
                      {/* Day header */}
                      <div className={`flex items-center gap-2 flex-wrap mb-2 px-2 py-1.5 rounded-xl ${c?.chip ?? "bg-gray-100"}`}>
                        <span className="w-2 h-2 rounded-full" style={{ background: c?.dot }} />
                        <span className="font-semibold text-sm">{label}</span>
                        <span className="tabular-nums text-xs opacity-70 ml-1">{dayRows.length} คิว</span>
                        {copyGroups.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                            {copyGroups.map((g) => {
                              const key = `${d}-${g.name}`;
                              const done = copiedKey === key;
                              return (
                                <button key={key} type="button"
                                  onClick={() => copySalesDay(key, buildSalesDayCopy(d, g.name, g.entries))}
                                  title={`คัดลอกฟอร์มคิว ${g.name} ของวันนี้`}
                                  className="press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold bg-white/80 text-brand-dark border border-gray-200/70 hover:bg-white">
                                  <Icon name={done ? "check" : "clipboard"} size={13} />
                                  {done ? "คัดลอกแล้ว" : `คัดลอก ${g.name}`}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {/* mobile cards */}
                      <div className="xl:hidden space-y-2">
                        {items.map((it, i) => it.kind === "queue"
                          ? <MobileCard key={it.entry.id} e={it.entry} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} />
                          : <MobileScheduleRow key={`s${i}`} it={it} />)}
                      </div>
                      {/* desktop table */}
                      <div className="hidden xl:block overflow-x-auto rounded-xl border border-gray-200/60">
                        <DayTable items={items} onOpen={setModal} onToggleReceipt={toggleReceipt} onToggleFeePaid={toggleFeePaid} canWrite={canWrite} slotLabel={slotLabel} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </>
            )}
          </>
        )}
      </Card>

      {modal && (
        <QueueModal
          entry={modal.entry}
          preset={modal.preset}
          salesList={sales}
          readOnly={!canWrite}
          contextMonth={contextMonth}
          onClose={() => setModal(null)}
          onSaved={(savedDate) => {
            setModal(null);
            // (ข้อ 2) กันคิวที่เพิ่งบันทึก "หาย": เคลียร์ตัวกรองแคบ + เด้งไปเดือนของคิว + เลื่อนหา
            setQ(""); setFilterDow(null); setFilterDate("");
            const mo = savedDate ? savedDate.slice(0, 7) : "";
            if (mo && mo !== filterMonth) setFilterMonth(mo); // effect reload เอง
            else load();
            if (savedDate) setTimeout(() => document.getElementById(`qday-${savedDate}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 600);
          }}
        />
      )}

      {leaveOpen && (
        <LeaveModal
          salesList={sales}
          onClose={() => setLeaveOpen(false)}
          onSaved={(savedDate?: string, savedRecord?: AvailRow) => {
            setLeaveOpen(false);
            // optimistic: เติม record ที่เพิ่งสร้างเข้า state ทันที (กัน race ตอน refetch หลัง POST)
            if (savedRecord?.id) {
              setAvail((prev) => (prev.some((a) => a.id === savedRecord.id) ? prev : [...prev, savedRecord]));
            }
            // ถ้าบันทึกวันลาคนละเดือนกับที่กำลังดูอยู่ → เปลี่ยน filterMonth ให้ตรง
            if (savedDate) {
              const savedMonth = savedDate.slice(0, 7); // "YYYY-MM"
              if (savedMonth !== filterMonth) setFilterMonth(savedMonth);
            }
            loadAvail(); // sync กับ server (เผื่อมี record อื่น)
          }}
        />
      )}

      {officeOpen && (
        <OfficeScheduleModal
          salesList={sales}
          onClose={() => setOfficeOpen(false)}
          onSaved={() => { setOfficeOpen(false); load(); }}
        />
      )}

      {summaryOpen && (
        <LeaveSummaryModal
          salesList={sales}
          avail={avail}
          month={filterMonth}
          onClose={() => setSummaryOpen(false)}
          onDelete={async (id) => {
            await api.del(`/queue/availability?id=${id}`);
            setAvail((prev) => prev.filter((a) => a.id !== id));
            loadAvail();
          }}
        />
      )}

      {/* (ข้อ 1) ปุ่มเลื่อนขึ้นบนสุด — ลอยมุมขวาล่าง เห็นตลอด */}
      <button type="button" aria-label="ขึ้นบนสุด"
        onClick={() => document.getElementById("queue-top")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="press fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-brand text-white shadow-lg inline-flex items-center justify-center hover:opacity-90">
        <Icon name="arrowLeft" size={20} className="rotate-90" />
      </button>
    </div>
  );
}

// ---- sub-components ---------------------------------------------------------

type TableProps = {
  rows: QueueEntry[];
  onOpen: (s: { entry: QueueEntry }) => void;
  onToggleReceipt: (e: QueueEntry, v: boolean) => void;
  onToggleFeePaid: (e: QueueEntry, v: boolean) => void;
  canWrite: boolean;
  slotLabel: (t: string | null) => string;
};

const QueueTableHead = () => (
  <thead>
    <tr className="text-left text-ink-3 text-xs border-b border-gray-200/70 whitespace-nowrap bg-white/50">
      <th className="px-1.5 py-2 font-semibold">สถานะ</th>
      <th className="px-1.5 py-2 font-semibold">เวลา</th>
      <th className="px-1.5 py-2 font-semibold">ประเภท</th>
      <th className="px-1.5 py-2 font-semibold">เซลล์</th>
      <th className="px-1.5 py-2 font-semibold">ผู้ช่วย</th>
      <th className="px-1.5 py-2 font-semibold">ติดต่อ</th>
      <th className="px-1.5 py-2 font-semibold">ชื่อ</th>
      <th className="px-1.5 py-2 font-semibold">เบอร์</th>
      <th className="px-1.5 py-2 font-semibold">ที่อยู่</th>
      <th className="px-1.5 py-2 font-semibold">แผนที่</th>
      <th className="px-1.5 py-2 font-semibold">ขนาด</th>
      <th className="px-1.5 py-2 font-semibold text-right">ค่าประเมิน</th>
      <th className="px-1.5 py-2 font-semibold">ชำระ</th>
      <th className="px-1.5 py-2 font-semibold text-center">ค่าประเมิน</th>
      <th className="px-1.5 py-2 font-semibold text-center">ใบเสร็จ</th>
      <th className="px-1.5 py-2 font-semibold">หมายเหตุ</th>
    </tr>
  </thead>
);

function QueueRow({ e, onOpen, onToggleReceipt, onToggleFeePaid, canWrite, slotLabel }: {
  e: QueueEntry; onOpen: (s: { entry: QueueEntry }) => void;
  onToggleReceipt: (e: QueueEntry, v: boolean) => void;
  onToggleFeePaid: (e: QueueEntry, v: boolean) => void;
  canWrite: boolean; slotLabel: (t: string | null) => string;
}) {
  const c = dayColor(e.queue_date);
  const isMapUrlFn = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps|\/maps\/)/i.test(v);
  return (
    <tr onClick={() => onOpen({ entry: e })}
      className={`border-b border-gray-200/50 ${c?.row ?? ""} cursor-pointer hover:brightness-95 align-top`}>
      <td className="px-1.5 py-2.5">
        <Badge tone={STATUS_META[e.status].tone} dot>{STATUS_META[e.status].th}</Badge>
      </td>
      <td className="px-1.5 py-2.5 whitespace-nowrap tabular-nums text-ink-2 font-medium">
        {slotLabel(e.queue_time)}
      </td>
      <td className="px-1.5 py-2.5 text-ink-2">{e.job_type || "—"}</td>
      <td className="px-1.5 py-2.5 text-ink-2 whitespace-nowrap">{e.sales?.name || "—"}</td>
      <td className="px-1.5 py-2.5 text-ink-2 whitespace-nowrap">{e.assistant?.name || "—"}</td>
      <td className="px-1.5 py-2.5 text-ink-2 max-w-[120px] truncate" title={e.line_contact ?? ""}>{e.line_contact ? `${e.contact_channel === "FB" ? "FB" : "Line"}: ${e.line_contact}` : "—"}</td>
      <td className="px-1.5 py-2.5 font-medium text-ink whitespace-nowrap">{e.customer_name}</td>
      <td className="px-1.5 py-2.5 text-ink-2 whitespace-nowrap">{e.tel || "—"}</td>
      <td className="px-1.5 py-2.5 text-ink-2 max-w-[110px] truncate" title={e.address ?? ""}>{e.address || "—"}</td>
      <td className="px-1.5 py-2.5">
        {e.location_url && /^https?:\/\//i.test(e.location_url) ? (
          <a href={e.location_url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
            className="inline-flex items-center gap-1 text-brand font-medium hover:underline">
            <Icon name={isMapUrlFn(e.location_url) ? "pin" : "external"} size={13} />
            {isMapUrlFn(e.location_url) ? "แผนที่" : "ลิงก์"}
          </a>
        ) : <span className="text-ink-3">—</span>}
      </td>
      <td className="px-1.5 py-2.5 text-ink-2 whitespace-nowrap">{e.job_size ? JOB_SIZE_META[e.job_size] : "—"}</td>
      <td className="px-1.5 py-2.5 text-right tabular-nums text-ink-2">{e.assess_fee != null ? e.assess_fee.toLocaleString("th-TH") : "—"}</td>
      <td className="px-1.5 py-2.5 text-ink-2">{e.payment || "—"}</td>
      <td className="px-1.5 py-2.5 text-center" onClick={(ev) => ev.stopPropagation()}>
        <input type="checkbox" checked={e.fee_paid ?? false} disabled={!canWrite}
          onChange={(ev) => onToggleFeePaid(e, ev.target.checked)}
          className="w-4 h-4 accent-emerald-600"
          title="ชำระค่าประเมินแล้ว" />
      </td>
      <td className="px-1.5 py-2.5 text-center" onClick={(ev) => ev.stopPropagation()}>
        <div className="inline-flex items-center gap-2">
          <input type="checkbox" checked={e.receipt_done} disabled={!canWrite}
            onChange={(ev) => onToggleReceipt(e, ev.target.checked)}
            title="มาร์คว่าออกใบเสร็จแล้ว"
            className="w-4 h-4 accent-brand" />
          {canWrite && (
            <a href={feeReceiptHref(e)} target="_blank" rel="noopener noreferrer"
              title="ออกใบเสร็จ / ใบกำกับภาษี ค่าประเมิน (VAT 7%)"
              className="press text-brand hover:text-brand-dark inline-flex">
              <Icon name="receipt" size={15} />
            </a>
          )}
        </div>
      </td>
      <td className="px-1.5 py-2.5 text-ink-2 max-w-[85px] truncate" title={e.note_admin ?? ""}>{e.note_admin || "—"}</td>
    </tr>
  );
}

// แถวอยู่ออฟฟิศ/วันลา ในตารางวัน (สถานะ + เวลา + ป้ายยาว colspan)
function OfficeLeaveRow({ it }: { it: Extract<DayItem, { kind: "office" | "leave" }> }) {
  const m = dayItemMeta(it);
  return (
    <tr className={`border-b border-gray-200/50 ${m.rowCls} align-top`}>
      <td className="px-1.5 py-2.5">
        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${m.tagCls}`}>{m.tagText}</span>
      </td>
      <td className="px-1.5 py-2.5 whitespace-nowrap tabular-nums text-ink-2 font-medium">{m.timeText}</td>
      <td className="px-1.5 py-2.5 text-ink-2" colSpan={14}>
        <span className="inline-flex items-center gap-1.5">
          <Icon name={it.kind === "office" ? "building" : "calendar"} size={13} /> {m.label}
        </span>
      </td>
    </tr>
  );
}

function DesktopTable({ rows, onOpen, onToggleReceipt, onToggleFeePaid, canWrite, slotLabel }: TableProps) {
  return (
    <table className="w-full text-sm">
      <QueueTableHead />
      <tbody>
        {rows.map((e) => (
          <QueueRow key={e.id} e={e} onOpen={onOpen} onToggleReceipt={onToggleReceipt} onToggleFeePaid={onToggleFeePaid} canWrite={canWrite} slotLabel={slotLabel} />
        ))}
      </tbody>
    </table>
  );
}

// ตารางวัน — คิว + อยู่ออฟฟิศ + วันลา แทรกรวมกัน
function DayTable({ items, onOpen, onToggleReceipt, onToggleFeePaid, canWrite, slotLabel }: {
  items: DayItem[]; onOpen: (s: { entry: QueueEntry }) => void;
  onToggleReceipt: (e: QueueEntry, v: boolean) => void;
  onToggleFeePaid: (e: QueueEntry, v: boolean) => void;
  canWrite: boolean; slotLabel: (t: string | null) => string;
}) {
  return (
    <table className="w-full text-sm">
      <QueueTableHead />
      <tbody>
        {items.map((it, i) => it.kind === "queue"
          ? <QueueRow key={it.entry.id} e={it.entry} onOpen={onOpen} onToggleReceipt={onToggleReceipt} onToggleFeePaid={onToggleFeePaid} canWrite={canWrite} slotLabel={slotLabel} />
          : <OfficeLeaveRow key={`s${i}`} it={it} />)}
      </tbody>
    </table>
  );
}

// การ์ดอยู่ออฟฟิศ/วันลา (mobile)
function MobileScheduleRow({ it }: { it: Extract<DayItem, { kind: "office" | "leave" }> }) {
  const m = dayItemMeta(it);
  return (
    <div className={`rounded-xl px-3.5 py-2.5 border border-gray-200/60 ${m.rowCls} flex items-center gap-2 text-sm`}>
      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${m.tagCls}`}>{m.tagText}</span>
      <Icon name={it.kind === "office" ? "building" : "calendar"} size={13} className="text-ink-3" />
      <span className="text-ink-2">{m.label}</span>
      <span className="ml-auto text-xs text-ink-3 tabular-nums">{m.timeText}</span>
    </div>
  );
}

type CardProps = {
  e: QueueEntry;
  onOpen: (s: { entry: QueueEntry }) => void;
  onToggleReceipt: (e: QueueEntry, v: boolean) => void;
  onToggleFeePaid: (e: QueueEntry, v: boolean) => void;
  canWrite: boolean;
};

function MobileCard({ e, onOpen, onToggleReceipt, onToggleFeePaid, canWrite }: CardProps) {
  const c = dayColor(e.queue_date);
  const isMapUrlFn = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps|\/maps\/)/i.test(v);
  const slotLabel = (t: string | null) => {
    if (!t) return "";
    const hh = t.slice(0, 5);
    if (hh === "10:00") return " · เช้า 10:00";
    if (hh === "14:00") return " · บ่าย 14:00";
    return ` · ${t}`;
  };
  return (
    <div onClick={() => onOpen({ entry: e })}
      className={`rounded-xl p-3.5 border border-gray-200/60 ${c?.row ?? "bg-white/50"} cursor-pointer`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{e.customer_name}</span>
        <Badge tone={STATUS_META[e.status].tone} dot>{STATUS_META[e.status].th}</Badge>
      </div>
      <div className="text-xs text-ink-3 mt-1">
        {e.queue_date ? `${dayLabel(e.queue_date)} ${thaiDate(e.queue_date)}` : "รอจัดวัน"}
        {slotLabel(e.queue_time)}
        {e.sales?.name ? ` · เซลล์ ${e.sales.name}` : ""}
        {e.assistant?.name ? ` · ผู้ช่วย ${e.assistant.name}` : ""}
        {e.job_type ? ` · ${e.job_type}` : ""}
        {e.job_size ? ` · ${JOB_SIZE_META[e.job_size]}` : ""}
      </div>
      {e.tel && (
        <div className="text-sm text-ink-2 mt-1">
          {e.tel}{e.line_contact ? ` · LINE ${e.line_contact}` : ""}
        </div>
      )}
      {e.address && <div className="text-sm text-ink-2 mt-1">{e.address}</div>}
      {(e.assess_fee != null || e.payment) && (
        <div className="text-xs text-ink-2 mt-1 tabular-nums">
          {e.assess_fee != null && (
            <span>ค่าประเมิน {e.assess_fee.toLocaleString("th-TH")} บาท</span>
          )}
          {e.assess_fee != null && e.payment && <span> · </span>}
          {e.payment && <span>ชำระ {e.payment}</span>}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 gap-2">
        {e.location_url && /^https?:\/\//i.test(e.location_url) ? (
          <a href={e.location_url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
            className="inline-flex items-center gap-1 text-brand font-medium hover:underline text-sm">
            <Icon name={isMapUrlFn(e.location_url) ? "pin" : "external"} size={13} />
            {isMapUrlFn(e.location_url) ? "แผนที่" : "ลิงก์"}
          </a>
        ) : <span className="text-ink-3 text-sm">—</span>}
        <div className="flex items-center gap-3 ml-auto" onClick={(ev) => ev.stopPropagation()}>
          <label className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={e.fee_paid ?? false} disabled={!canWrite}
              onChange={(ev) => onToggleFeePaid(e, ev.target.checked)}
              className="w-4 h-4 accent-emerald-600" /> ชำระแล้ว
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={e.receipt_done} disabled={!canWrite}
              onChange={(ev) => onToggleReceipt(e, ev.target.checked)}
              className="w-4 h-4 accent-brand" /> ใบเสร็จ
          </label>
          {canWrite && (
            <a href={feeReceiptHref(e)} target="_blank" rel="noopener noreferrer"
              className="press inline-flex items-center gap-1 text-xs font-semibold text-brand min-h-[44px]">
              <Icon name="receipt" size={14} /> ออกใบเสร็จ
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Sample dates per day-of-week for color key (2024-01-01 = Monday)
function dowSample(day: string): string {
  const map: Record<string, string> = {
    "อาทิตย์": "2024-01-07", "จันทร์": "2024-01-01", "อังคาร": "2024-01-02",
    "พุธ": "2024-01-03", "พฤหัสบดี": "2024-01-04", "ศุกร์": "2024-01-05", "เสาร์": "2024-01-06",
  };
  return map[day] ?? "2024-01-01";
}
