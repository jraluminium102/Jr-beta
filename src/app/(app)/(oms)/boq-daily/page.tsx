import { redirect } from "next/navigation";

// ย้ายไปรวมกับ BOQ อลูมิเนียมเป็นเมนูเดียว 2 แท็บ (เจ้าของเคาะ 23 ก.ค.69) — คงลิงก์เก่าไว้ไม่ให้ 404
export default function BoqDailyRedirect() {
  redirect("/cutlist?tab=daily");
}
