/**
 * ซิงก์ช่องทางติดต่อจากคิวงาน → ทะเบียนลูกค้า (0122 + 0170)
 *   ไลน์ใหม่ "ไม่ทับ" ไลน์เดิม: ถ้าคิวกรอกไลน์ที่ต่างจากของทะเบียน → ไลน์เดิมย้ายไป line_id_prev (เก็บได้หลายอัน)
 *   แล้ว line_id = ไลน์ใหม่ (เอกสารใช้ไลน์ล่าสุด) · กรอกว่าง = ไม่แตะไลน์ในทะเบียน
 *   ยังไม่รัน 0170 → ตกลงมาอัปเดต line_id อย่างเดียวเหมือนเดิม (ไม่ล้มการบันทึกคิว)
 */
type Sb = { from: (t: string) => any };

const splitPrev = (s: unknown) => String(s ?? "").split(" / ").map((x) => x.trim()).filter(Boolean);

export async function syncCustomerContact(sb: Sb, customerId: number, body: { line_contact?: string | null; contact_channel?: string | null }): Promise<void> {
  const newLine = body.line_contact === undefined ? undefined : String(body.line_contact ?? "").trim();
  const patch: Record<string, string> = {};
  if (body.contact_channel !== undefined && body.contact_channel != null && String(body.contact_channel).trim()) patch.contact_channel = String(body.contact_channel).trim();

  if (newLine) {
    const { data: cur, error: rErr } = await sb.from("customers").select("line_id, line_id_prev").eq("id", customerId).maybeSingle();
    const c = (cur ?? {}) as { line_id?: string | null; line_id_prev?: string | null };
    const curLine = String(c.line_id ?? "").trim();
    const hasPrevCol = !rErr;   // select พัง = คอลัมน์ 0170 ยังไม่มี
    if (curLine !== newLine) {
      patch.line_id = newLine;
      if (hasPrevCol && curLine) {
        const prev = [curLine, ...splitPrev(c.line_id_prev)].filter((x, i, a) => x !== newLine && a.indexOf(x) === i);
        patch.line_id_prev = prev.join(" / ");
      }
    }
  }
  if (!Object.keys(patch).length) return;
  let { error } = await sb.from("customers").update(patch).eq("id", customerId);
  if (error && /line_id_prev/i.test(error.message ?? "")) {
    const { line_id_prev: _p, ...rest } = patch; void _p;
    ({ error } = await sb.from("customers").update(rest).eq("id", customerId));
  }
  if (error && !/column|does not exist|schema cache/i.test(error.message ?? "")) throw new Error(error.message);
}
