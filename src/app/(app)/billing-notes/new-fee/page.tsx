import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewFeeClient, { type FeePrefill } from "./NewFeeClient";

export const dynamic = "force-dynamic";

// ออกใบวางบิล/ใบเสร็จ "ค่าประเมินหน้างาน" — เอกสารอิสระ ไม่ผูกใบเสนอราคา (แนว A เจ้าของ+accountant เคาะ)
//   prefill ได้จาก query (?name/phone/address/fee) เช่นกดจากหน้าคิวประเมิน · ถ้ามี ?cid (ลูกค้าในทะเบียน)
//   ดึงหัวบิลเต็มจากทะเบียนลูกค้าให้ (tax_id/ที่อยู่ — เหมือนฟอร์มอื่น) ทับค่าจากคิว
export default async function NewFeePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/billing-notes");

  const s = (k: string) => { const v = searchParams[k]; return typeof v === "string" ? v : ""; };
  const initial: FeePrefill = {
    name: s("name"), phone: s("phone"), address: s("address"), fee: s("fee"),
  };

  // ผูกลูกค้าในทะเบียน → หัวบิลเต็ม (เหมือนใบเสนอ/ใบวางบิล)
  const cid = Number(s("cid"));
  if (Number.isFinite(cid) && cid > 0) {
    const sb = createClient();
    const { data: cust } = await sb.from("customers")
      .select("name, address, tax_id, phone, contact_person").eq("id", cid).maybeSingle();
    if (cust) {
      initial.name = (cust as { name?: string }).name || initial.name;
      initial.address = (cust as { address?: string }).address || initial.address;
      initial.taxId = (cust as { tax_id?: string }).tax_id || "";
      initial.phone = (cust as { phone?: string }).phone || initial.phone;
      initial.contactPerson = (cust as { contact_person?: string }).contact_person || "";
    }
  }

  return <NewFeeClient initial={initial} />;
}
