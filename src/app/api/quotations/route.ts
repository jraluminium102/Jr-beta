import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { computeTotals, lineTotal, sumDiscountLines } from "@/lib/money";
import { getDocCutoff } from "@/lib/doc-cutoff";
import type { Customer } from "@/lib/types";
import { CHECKLIST_MARKER } from "@/lib/checklist-marker";
import { audit } from "@/lib/bff/handler";

// GET /api/quotations  → รายการใบเสนอราคา (ซ่อนเอกสารทดสอบก่อนวันตัด · ?includeTest=1 โชว์ทั้งหมด)
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const includeTest = new URL(req.url).searchParams.get("includeTest") === "1";
  const cutoff = includeTest ? "" : await getDocCutoff();
  const supabase = createClient();
  let query = supabase
    .from("quotations")
    .select("id, code, customer_snapshot, issue_date, status, net, created_at, job_id, jobs:job_id(job_code)")
    .order("created_at", { ascending: false });
  if (cutoff) query = query.gte("issue_date", cutoff);
  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/quotations  → สร้างใบเสนอราคา (ออกรหัสอัตโนมัติ + คำนวณยอดฝั่ง server)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return fail("ต้องมีรายการอย่างน้อย 1 บรรทัด");

  const vat_rate = Number(body.vat_rate) || 0;
  const discount_pct = Number(body.discount_pct) || 0;
  const discount_amt_in = body.discount_amt != null ? Number(body.discount_amt) || 0 : undefined; // โหมดบาท (ชนะ %)
  const discount_label = String(body.discount_label ?? "").slice(0, 120);
  // ส่วนลดหลายรายการ (0105) — sanitize + รวมยอดฝั่ง server (authoritative)
  const discountLines = Array.isArray(body.discounts)
    ? (body.discounts as { label?: unknown; pct?: unknown; amt?: unknown }[])
        .slice(0, 20)
        .map((d) => ({ label: String(d?.label ?? "").slice(0, 120), pct: Math.max(0, Number(d?.pct) || 0), amt: Math.max(0, Number(d?.amt) || 0) }))
    : [];
  const wht_rate = Number(body.wht_rate) || 0;
  if (discount_pct < 0 || discount_pct > 100) return fail("ส่วนลดต้องอยู่ 0–100%");

  const supabase = createClient();

  // 0) ลูกค้า: เลือกจากทะเบียน (customer_id) หรือ "ลูกค้านอกระบบ" กรอกชื่อใหม่ → สร้างเข้าระบบก่อน
  //    (เจ้าของสั่ง 22 ส.ค.69: ใบเสนอนอกระบบ ชื่อลูกค้าจะในระบบ/นอกระบบก็ได้ แต่เอาเข้าระบบทั้งคู่)
  let customerId = body.customer_id;
  if (!customerId) {
    const nc = body.new_customer;
    const ncName = nc && typeof nc === "object" ? String(nc.name ?? "").trim() : "";
    if (!ncName) return fail("ต้องเลือกลูกค้า หรือกรอกชื่อลูกค้าใหม่");
    const { data: created, error: ncErr } = await supabase
      .from("customers")
      .insert({
        name: ncName,
        job: String(nc.job ?? "").trim(),
        address: String(nc.address ?? "").trim(),
        phone: String(nc.phone ?? "").trim(),
        tax_id: String(nc.tax_id ?? "").trim(),
        contact_channel: "OTHER",
        created_by: profile.id,
      })
      .select("id")
      .single<{ id: number }>();
    if (ncErr || !created) return fail("สร้างลูกค้าใหม่ไม่สำเร็จ: " + (ncErr?.message ?? ""), 500);
    customerId = created.id;
  }

  // 1) snapshot ข้อมูลลูกค้า ณ วันออก
  const { data: cust, error: cErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single<Customer>();
  if (cErr || !cust) return fail("ไม่พบลูกค้า", 404);

  // เลือก "นามออกบิล": ที่ระบุ (billing_profile_id) → นามหลัก → ข้อมูลลูกค้า (fallback ไม่ให้ snapshot ว่าง)
  const sbp = supabase as unknown as { from: (t: string) => any };
  const bpId = Number(body.billing_profile_id) || null;
  const bpCols = "bill_name,address,postal_code,tax_id,branch,kind,contact_person,phone";
  type Prof = { bill_name: string; address: string; postal_code: string; tax_id: string; branch: string; kind: string; contact_person: string; phone: string };
  let billProfile: Prof | null = null;
  if (bpId) {
    const { data } = await sbp.from("billing_profiles").select(bpCols).eq("id", bpId).eq("customer_id", cust.id).maybeSingle();
    billProfile = (data as Prof) ?? null;
  }
  if (!billProfile) {
    const { data } = await sbp.from("billing_profiles").select(bpCols).eq("customer_id", cust.id).eq("is_default", true).eq("is_active", true).maybeSingle();
    billProfile = (data as Prof) ?? null;
  }
  const snapshot: Record<string, unknown> = billProfile ? {
    name: billProfile.bill_name, job: cust.job,
    address: billProfile.address, postal_code: billProfile.postal_code, tax_id: billProfile.tax_id,
    branch: billProfile.branch, kind: billProfile.kind, line_id: cust.line_id,
    contact_channel: (cust as { contact_channel?: string }).contact_channel,
    phone: billProfile.phone || cust.phone, contact_person: billProfile.contact_person || cust.contact_person,
  } : {
    name: cust.name, job: cust.job, address: cust.address, tax_id: cust.tax_id,
    kind: "INDIVIDUAL", line_id: cust.line_id, phone: cust.phone, contact_person: cust.contact_person,
    contact_channel: (cust as { contact_channel?: string }).contact_channel,
  };

  // หัวบิลแก้ในหน้าสร้างใบเสนอ (ออกในนามนิติบุคคล) — ทับเฉพาะฟิลด์ identity (ไม่แตะยอด/งาน)
  const ho = body.header_override;
  if (ho && typeof ho === "object" && String(ho.name ?? "").trim()) {
    snapshot.name = String(ho.name).trim();
    snapshot.kind = ho.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL";
    snapshot.tax_id = String(ho.tax_id ?? "").trim();
    snapshot.branch = String(ho.branch ?? "สำนักงานใหญ่").trim() || "สำนักงานใหญ่";
    snapshot.postal_code = String(ho.postal_code ?? "").trim();
    snapshot.address = String(ho.address ?? "").trim();
    snapshot.contact_person = String(ho.contact_person ?? "").trim();
    snapshot.phone = String(ho.phone ?? "").trim();
  }

  // 2) ผูกใบเสนอกับงาน (job) — เฉพาะเมื่อ "เลือกงานมาชัดเจน" (body.job_id) เท่านั้น
  //    ⚠ เจ้าของสั่ง 24 ส.ค.69: ห้าม auto-รวมใบเสนอใหม่เข้างานเดิมแค่เพราะชื่อลูกค้าซ้ำ
  //      (ลูกค้าคนเดียวมีหลายออเดอร์ = คนละงาน · เดิม fallback auto-link งาน active ล่าสุด → อัดรวมกันมั่ว)
  //    ถ้าไม่เลือกงาน → jobId = null · ตอนวางบิลจะสร้างงานใหม่ให้เอง (POST /billing-notes) = แต่ละออเดอร์แยกงาน
  let jobId: string | null = null;
  // ใบเดิมของงานที่จะถูกยกเลิกแทนที่ด้วยใบนี้ (ใบเบาเช็คลิสต์ / ผู้ใช้เลือกแทนใบเดิม) — ยกเลิกก่อน insert (DB ล็อก 1 งาน 1 ใบ)
  let replaceQuotations: { id: number; code: string }[] = [];
  const requestedJobId = typeof body.job_id === "string" && body.job_id.trim() ? body.job_id.trim() : null;
  if (requestedJobId) {
    // validate: งานต้องเป็นของลูกค้านี้ + ยังไม่ COMPLETED/CANCELLED
    const { data: requestedJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", requestedJobId)
      .eq("customer_id", cust.id)
      .not("status", "in", "(COMPLETED,CANCELLED)")
      .maybeSingle<{ id: string }>();
    if (requestedJob?.id) {
      jobId = requestedJob.id;
      // ═══ กติกา "1 งาน = 1 ใบเสนอที่ใช้งานอยู่" (เจ้าของสั่ง 16 ต.ค.69: "ไม่ต้องการให้ปนกันแต่แรก ระบบควรแยกให้เลย") ═══
      //   เดิมยอมให้กด "ยืนยันผูกงานเดิม" ได้ → ใบเสนอหลายออเดอร์ค้างใต้งานเดียว → ผลิต/ใบปะหน้า/ใบตัด ต้องเดาใบ
      //   ตอนนี้ไม่มีทางผูกใบที่ 2 เข้างานเดียวกันอีก (DB ล็อกซ้ำอีกชั้นที่ migration 0156):
      //   · ใบเดิมเป็นแค่ "ใบเบาเช็คลิสต์" ไม่มีบิล → ใบจริงแทนที่ให้อัตโนมัติ (ยกเลิกใบเบา · ออเดอร์เดียวกัน)
      //   · ใบเดิมเป็นใบจริง ไม่มีบิล 1 ใบ → ผู้ใช้เลือก: แทนใบเดิม (replace_quotation_id) หรือแยกเป็นออเดอร์ใหม่ (ส่งซ้ำโดยไม่ส่ง job_id)
      //   · ใบเดิมมีบิลแล้ว / มีหลายใบ / มีบิลนอกระบบ → แยกเป็นออเดอร์ใหม่เท่านั้น (แก้ใบเดิมให้ใช้ Rev)
      const { data: exQ } = await supabase
        .from("quotations")
        .select("id, code, note")
        .eq("job_id", jobId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      const ex = (exQ ?? []) as { id: number; code: string; note: string | null }[];
      const { data: exBn } = await supabase
        .from("billing_notes")
        .select("id, quotation_id")
        .eq("job_id", jobId)
        .neq("status", "cancelled");
      const bns = (exBn ?? []) as { id: number; quotation_id: number | null }[];
      // บิลเก่าบางใบ job_id ว่าง แต่ชี้ใบเสนอของงานนี้ → นับว่ามีบิลด้วย
      if (ex.length) {
        const { data: exBnQ } = await supabase
          .from("billing_notes")
          .select("id, quotation_id")
          .in("quotation_id", ex.map((q) => q.id))
          .neq("status", "cancelled");
        for (const b of (exBnQ ?? []) as { id: number; quotation_id: number | null }[]) {
          if (!bns.some((x) => x.id === b.id)) bns.push(b);
        }
      }
      const billedQ = new Set(bns.map((b) => b.quotation_id).filter((x): x is number => x != null));
      const hasExternalBill = bns.some((b) => b.quotation_id == null);
      if (ex.length > 0 || hasExternalBill) {
        let lightOnly = false;
        if (!hasExternalBill && ex.length === 1 && !billedQ.has(ex[0].id) && String(ex[0].note ?? "").startsWith(CHECKLIST_MARKER)) {
          // ใบเบา = รายการเดียว "ใบเสนอราคา (ทำนอกระบบ)" · ถ้า Rev เป็นรายการจริงแล้ว = ใบจริง ต้องถามก่อน
          const { data: li } = await supabase.from("quotation_items").select("name").eq("quotation_id", ex[0].id);
          const names = ((li ?? []) as { name: string }[]).map((r) => r.name);
          lightOnly = names.length <= 1 && names.every((n) => n === "ใบเสนอราคา (ทำนอกระบบ)");
        }
        const canReplaceId = !hasExternalBill && ex.length === 1 && !billedQ.has(ex[0].id) ? ex[0].id : null;
        const replaceId = Number(body.replace_quotation_id) || 0;
        if (lightOnly) {
          replaceQuotations = ex.map((q) => ({ id: q.id, code: q.code }));
        } else if (replaceId && canReplaceId === replaceId) {
          replaceQuotations = [{ id: ex[0].id, code: ex[0].code }];
        } else {
          return fail(
            canReplaceId
              ? `งานนี้มีใบเสนอราคา ${ex[0].code} อยู่แล้ว (1 งาน = 1 ใบเสนอ) — เลือก: ใบนี้แทนใบเดิม หรือแยกเป็นออเดอร์ใหม่ (งานใหม่)`
              : `งานนี้มี${billedQ.size || hasExternalBill ? "ออเดอร์ที่วางบิลแล้ว" : "ใบเสนอหลายใบอยู่แล้ว"} (${ex.map((q) => q.code).join(", ") || "บิลนอกระบบ"}) — ใบนี้จะถูกแยกเป็นออเดอร์ใหม่ (งานใหม่) · ถ้าจะแก้ใบเดิมให้ใช้ Rev ที่ใบเดิม`,
            409,
            { needs_choice: true, can_replace: canReplaceId, existing: ex.map((q) => ({ id: q.id, code: q.code, has_bill: billedQ.has(q.id) })) },
          );
        }
      }
    } else {
      // ผู้ใช้เลือกงานมาแล้วแต่ใช้ไม่ได้ (ถูกปิด/ยกเลิก/id เพี้ยน) → ห้าม fallback เงียบ ให้เลือกใหม่
      return fail("งานที่เลือกผูกใช้ไม่ได้แล้ว (อาจถูกปิดหรือยกเลิก) — กรุณาเลือกงานใหม่", 409);
    }
  }

  // 2b) ไม่ได้เลือกงานมา → ผูกงานจากคิวประเมินที่ "ยังรอใบเสนอ" ให้อัตโนมัติ (เจ้าของ 26 ต.ค.69)
  //   "สร้างใบเสนอจากคิวประเมินตามปกติ ส่วนมากก็ผูกงาน แต่บางใบไม่ผูก"
  //   ต้นเหตุ: เดิม trigger trg_quotation_link (DB) ยัดใบที่ไม่มีงานเข้างานล่าสุดของลูกค้าให้เงียบ ๆ → 0156 ปิดไป (กันออเดอร์ปน)
  //     ใบที่ไม่ได้เข้าผ่านปุ่มจากเช็คลิสต์ (ส่ง job_id มาเอง) เลยหลุดงานคิวประเมินทั้งหมด
  //   ตอนนี้: ผูกเฉพาะงาน active ที่ "ยังว่าง" (ไม่มีใบเสนอที่ใช้งานอยู่ + ไม่มีบิล) และมีงานแบบนี้ "งานเดียว" เท่านั้น
  //     = งานที่เปิดจากคิวประเมินรอใบเสนอ → ไม่มีทางปนออเดอร์ (งานว่าง) · มีหลายงานว่าง = ไม่เดา ปล่อยไว้ (วางบิลแล้วได้งานใหม่)
  //   body.new_order = ผู้ใช้กด "ออเดอร์ใหม่" เอง → ไม่ผูก
  if (!jobId && !requestedJobId && body.new_order !== true) {
    const { data: cj } = await supabase
      .from("jobs")
      .select("id")
      .eq("customer_id", cust.id)
      .not("status", "in", "(COMPLETED,CANCELLED)");
    const jobIds = ((cj ?? []) as { id: string }[]).map((j) => j.id);
    if (jobIds.length) {
      const [{ data: usedQ }, { data: usedB }] = await Promise.all([
        supabase.from("quotations").select("job_id").in("job_id", jobIds).neq("status", "cancelled"),
        supabase.from("billing_notes").select("job_id").in("job_id", jobIds).neq("status", "cancelled"),
      ]);
      const used = new Set([...((usedQ ?? []) as { job_id: string }[]), ...((usedB ?? []) as { job_id: string }[])].map((r) => r.job_id));
      const empty = jobIds.filter((id) => !used.has(id));
      if (empty.length === 1) jobId = empty[0];
    }
  }

  // 3) คำนวณยอด (แหล่งความจริงเดียว · ส่งบาทมา = ใช้ตรง ๆ ชนะ %)
  const subtotalCalc = items.reduce((a: number, i: { qty: number; unit_price: number }) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0);
  const discount_amt_use = discountLines.length ? sumDiscountLines(subtotalCalc, discountLines) : discount_amt_in;
  const t = computeTotals({ items, vat_rate, discount_pct, wht_rate, ...(discount_amt_use != null ? { discount_amt: discount_amt_use } : {}) });
  const storedPct = discount_amt_use != null
    ? (t.subtotal > 0 ? Math.round((t.discount_amt / t.subtotal) * 10000) / 100 : 0)
    : discount_pct;
  const headerLabel = discountLines.length ? (discountLines.length === 1 ? discountLines[0].label : "") : discount_label;

  // กันบันทึกซ้ำ (เจ้าของ 26 ต.ค.69 "กดบันทึกซ้ำ ละจะเซฟซ้ำทำไม" — QT2569100080/0081 ยอดเดียวกัน 2 ใบ)
  //   คนเดิม + ลูกค้าเดิม + ยอดสุทธิเดิม + จำนวนรายการเท่ากัน ภายใน 2 นาที = กดซ้ำ → คืนใบเดิม ไม่ออกเลขใหม่
  //   (หน้าฟอร์มล็อกปุ่มแล้ว · ชั้นนี้กันกรณีเน็ตช้า/ส่งซ้ำ/เปิด 2 แท็บ)
  if (!replaceQuotations.length) {
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("quotations")
      .select("id, code, quotation_items(name, qty, unit_price)")
      .eq("customer_id", cust.id)
      .eq("created_by", profile.id)
      .eq("net", t.net)
      .neq("status", "cancelled")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    const dup = (recent ?? [])[0] as { id: number; code: string; quotation_items?: { name: string; qty: number; unit_price: number }[] } | undefined;
    // QA 30 ต.ค.69: เดิมเทียบแค่ "จำนวนข้อเท่ากัน" → ใบที่ตั้งใจออกใหม่ (แก้ชื่อ/ราคาต่อข้อ แต่ยอดสุทธิเท่าเดิม) ถูกกลืน
    //   → เทียบ ชื่อ+จำนวน+ราคาต่อหน่วย ทุกข้อ (เรียงแล้ว) ต้องตรงกันทั้งชุดถึงถือว่ากดซ้ำ
    const sig = (xs: { name?: unknown; qty?: unknown; unit_price?: unknown }[]) =>
      xs.map((x) => `${String(x.name ?? "").trim()}|${Number(x.qty) || 0}|${Number(x.unit_price) || 0}`).sort().join("\n");
    if (dup && Array.isArray(dup.quotation_items) && dup.quotation_items.length === items.length && sig(dup.quotation_items) === sig(items)) {
      return ok({ id: dup.id, code: dup.code, replaced: [], duplicate: true }, 200);
    }
  }

  // 3) ออกรหัสอัตโนมัติ (พ.ศ. · reset รายเดือน) ผ่าน RPC
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "QT" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 4) insert หัวเอกสาร
  const qBase: Record<string, unknown> = {
    code,
    customer_id: cust.id,
    job_id: jobId,
    billing_profile_id: billProfile ? bpId : null,
    customer_snapshot: snapshot,
    issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
    status: "draft",
    vat_rate, discount_pct: storedPct, discount_label: headerLabel, wht_rate,
    subtotal: t.subtotal, discount_amt: t.discount_amt, vat_amt: t.vat_amt,
    total: t.total, wht_amt: t.wht_amt, net: t.net,
    note: body.note ?? "",
    created_by: profile.id,
  };
  // เงื่อนไขท้ายใบ + ส่วนลดหลายรายการ (คอลัมน์ใหม่ · ส่งเฉพาะที่มี · fallback ถ้า migration ยังไม่รัน)
  const qCond: Record<string, unknown> = { discounts: discountLines };  // 0105 breakdown
  if (Array.isArray(body.conditions_work)) qCond.conditions_work = body.conditions_work;
  if (Array.isArray(body.conditions_quote)) qCond.conditions_quote = body.conditions_quote;
  // แทนใบเดิม: ยกเลิกก่อน insert (DB ล็อก 1 งาน 1 ใบ) · ถ้า insert พลาด คืนสถานะเดิมให้
  const prevStatus = new Map<number, string>();
  const restoreReplaced = async () => {
    for (const [id, st] of prevStatus) await supabase.from("quotations").update({ status: st }).eq("id", id);
  };
  for (const rq of replaceQuotations) {
    const { data: cur } = await supabase.from("quotations").select("status").eq("id", rq.id).maybeSingle<{ status: string }>();
    const { data: upd, error: cErr } = await supabase.from("quotations").update({ status: "cancelled" }).eq("id", rq.id).select("id");
    // ไม่มีแถวกลับ = ไม่มีสิทธิ์แก้ใบนั้น (RLS) → ห้ามไปต่อ ไม่งั้นงานเดียวมี 2 ใบ
    if (cErr || !(upd ?? []).length) {
      await restoreReplaced();
      return fail(`ยกเลิกใบเดิม ${rq.code} ไม่สำเร็จ${cErr ? ": " + cErr.message : " (ไม่มีสิทธิ์แก้ใบนี้)"}`, cErr ? 500 : 403);
    }
    prevStatus.set(rq.id, cur?.status ?? "draft");
  }
  let { data: q, error: qErr } = await supabase
    .from("quotations").insert({ ...qBase, ...qCond }).select("id, code").single();
  // กันพัง: ถ้า migration 0076 (conditions_*) หรือ 0105 (discounts) ยังไม่รัน → insert ซ้ำแบบตัดคอลัมน์ใหม่ออก
  if (qErr && /conditions_|discounts/i.test(qErr.message)) {
    ({ data: q, error: qErr } = await supabase
      .from("quotations").insert(qBase).select("id, code").single());
  }
  if (qErr || !q) {
    await restoreReplaced();
    if (/ONE_QUOTATION_PER_JOB/.test(qErr?.message ?? "")) return fail("งานนี้มีใบเสนอราคาที่ใช้งานอยู่แล้ว (1 งาน = 1 ใบเสนอ) — แยกเป็นออเดอร์ใหม่ หรือใช้ Rev ที่ใบเดิม", 409, { needs_choice: true, can_replace: null, existing: [] });
    return fail("บันทึกใบเสนอไม่สำเร็จ: " + (qErr?.message ?? ""), 500);
  }

  // 5) insert รายการ — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
  const rows = items.map((it: any, i: number) => ({
    quotation_id: q.id,
    name: String(it.name ?? "").trim() || "(ไม่มีชื่อรายการ)",
    detail: String(it.detail ?? ""),
    qty: Number(it.qty) || 0,
    unit_price: Number(it.unit_price) || 0,
    line_total: lineTotal(Number(it.qty) || 0, Number(it.unit_price) || 0),
    sort_order: i,
    category: String(it.category ?? ""),     // หมวดสินค้า → สถิติขายดี (0046)
    product_id: String(it.product_id ?? ""),
    group_label: String(it.group_label ?? ""), // หัวข้อชุด (0076) → จัดกลุ่มในใบพิมพ์
    calc_recipe: it.calc_recipe ?? null,       // สูตรคิดราคา 4.0 (0093) — โหลดกลับเข้าเครื่องคิดได้
  }));
  let { error: iErr } = await supabase.from("quotation_items").insert(rows);
  // กันพัง: ถ้า migration 0076 (group_label) / 0093 (calc_recipe) ยังไม่รัน → insert ซ้ำแบบตัดคอลัมน์นั้นออก
  if (iErr && /group_label|calc_recipe/i.test(iErr.message)) {
    const rowsNoGl = rows.map(({ group_label, calc_recipe, ...r }: any) => r);
    ({ error: iErr } = await supabase.from("quotation_items").insert(rowsNoGl));
  }
  if (iErr) {
    await supabase.from("quotations").delete().eq("id", q.id);
    await restoreReplaced();
    return fail("บันทึกรายการไม่สำเร็จ: " + iErr.message, 500);
  }

  // ย้อนรอยได้ว่าใบไหนถูกแทนด้วยใบไหน ใครทำ
  for (const [id, st] of prevStatus) {
    await audit({
      jobId: jobId ?? null,
      userId: profile.id,
      action: "CANCEL_QUOTATION_REPLACED",
      table: "quotations",
      recordId: String(id),
      oldValue: { status: st },
      newValue: { status: "cancelled", replaced_by: q.code },
    });
  }

  return ok({ id: q.id, code: q.code, replaced: replaceQuotations.map((r) => r.code) }, 201);
}
