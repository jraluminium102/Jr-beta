/**
 * ใบปะหน้าตาม Rev อัตโนมัติ (เจ้าของ 3 พ.ย.69: "rev เปลี่ยนสี ช่องสีก็เปลี่ยนให้เองเลย · ถ้าออโต้ไม่ได้ให้เตือน")
 *   กติกา: ถ้าคอลัมน์ซ้าย (สั่งของเตรียมผลิต) ยัง "ตรงกับที่ระบบสร้างจากใบเสนอเดิมเป๊ะ" = ไม่มีใครแก้มือ
 *          → สร้างใหม่จากใบเสนอ Rev ใหม่ทับให้เลย (คอลัมน์กลาง/ขวาที่พิมพ์มือ เก็บไว้ + เติมของใหม่แบบไม่ซ้ำ)
 *          ถ้ามีแก้มือ → ไม่แตะ ปล่อยป้าย "มี Rev" (rev_stale) ให้คนเปิดดูแล้วกด "อัปเดตจากใบเสนอล่าสุด" เอง
 */
import { buildGroups, toLeftLines, buildSideColumns } from "@/lib/cover-sheet/generate.mjs";

type Sb = { from: (t: string) => any };
type Item = { name?: string | null; detail?: string | null; group_label?: string | null; sort_order?: number | null };
type Line = { text: string; color?: string; hl?: boolean; kind?: string; n?: number };

export type CoverSyncResult = "auto" | "manual" | "none";

const textsOf = (lines: unknown): string[] => (Array.isArray(lines) ? lines : []).map((l: any) => String(l?.text ?? "").trim()).filter(Boolean);
// คอลัมน์กลาง/ขวา = บรรทัด {text,color,hl} ต่อท้ายของที่พิมพ์มือ แบบไม่ซ้ำข้อความ (ตรรกะเดียวกับ mergeSide ใน editor)
const dedupAppend = (cur: unknown, add: Line[]): Line[] => {
  const base = (Array.isArray(cur) ? cur : []) as Line[];
  const have = new Set(base.map((l) => String(l?.text ?? "").trim()).filter(Boolean));
  const out = [...base];
  for (const l of add) { const t = String(l?.text ?? "").trim(); if (t && !have.has(t)) { out.push({ text: l.text, color: l.color ?? "", hl: !!l.hl }); have.add(t); } }
  return out;
};

export async function autoSyncCoverSheet(sb: Sb, args: {
  jobId: string; quotationId: number; newRevNo: number; oldItems: Item[]; newItems: Item[]; userId: string | null;
}): Promise<CoverSyncResult> {
  const { data: row } = await sb.from("cover_sheets").select("*").eq("job_id", args.jobId).maybeSingle();
  if (!row) return "none";
  const pinned = (row as { quotation_id?: number | null }).quotation_id;
  if (pinned != null && Number(pinned) !== Number(args.quotationId)) return "manual";   // ใบปะหน้าอ้างใบอื่น — ไม่เดา
  const mode = (row as { mode?: string }).mode === "grouped" ? "grouped" : "short";
  const content = ((row as { content?: Record<string, unknown> }).content ?? {}) as Record<string, unknown>;

  // แก้มือหรือยัง? เทียบข้อความคอลัมน์ซ้ายปัจจุบัน กับที่สร้างจาก "ใบเสนอก่อน Rev"
  const genOld = toLeftLines(buildGroups(args.oldItems), mode) as Line[];
  const curTexts = textsOf(content.left);
  const oldTexts = textsOf(genOld);
  const untouched = curTexts.length === oldTexts.length && curTexts.every((t, i) => t === oldTexts[i]);
  if (!untouched) return "manual";

  // สร้างใหม่จาก Rev ใหม่ — สี/ไฮไลต์ที่เคยตั้งต่อบรรทัดเดิม คงไว้ถ้าข้อความเดิมยังอยู่
  const genNew = toLeftLines(buildGroups(args.newItems), mode) as Line[];
  const styleByText = new Map<string, { color?: string; hl?: boolean }>();
  for (const l of (Array.isArray(content.left) ? content.left : []) as Line[]) styleByText.set(String(l.text ?? "").trim(), { color: l.color, hl: l.hl });
  const left = genNew.map((l) => {
    const st = styleByText.get(String(l.text ?? "").trim());
    return st ? { ...l, color: st.color ?? l.color ?? "", hl: st.hl ?? l.hl ?? false } : l;
  });
  const { mid, right } = buildSideColumns(args.newItems) as unknown as { mid: Line[]; right: Line[] };
  const next = { ...content, left, mid: dedupAppend(content.mid, mid), right: dedupAppend(content.right, right) };

  const upd: Record<string, unknown> = { content: next, quotation_id: args.quotationId, quotation_rev_no: args.newRevNo, updated_at: new Date().toISOString(), ...(args.userId ? { updated_by: args.userId } : {}) };
  let { error } = await sb.from("cover_sheets").update(upd).eq("job_id", args.jobId);
  if (error && /quotation_rev_no|quotation_id/i.test(error.message ?? "")) {
    const { quotation_rev_no: _r, quotation_id: _q, ...rest } = upd; void _r; void _q;
    ({ error } = await sb.from("cover_sheets").update(rest).eq("job_id", args.jobId));
  }
  if (error) { console.warn("[cover auto-sync]", error.message); return "manual"; }
  return "auto";
}
