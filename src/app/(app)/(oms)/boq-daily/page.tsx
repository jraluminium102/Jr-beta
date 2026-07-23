import { redirect } from "next/navigation";

// ประวัติเบิก-รับเข้ารายวันย้ายไปรวมที่ "สมุดสโตร์" (/stock/moves) แล้ว — คงลิงก์เก่าไว้ไม่ให้ 404
export default function BoqDailyRedirect() {
  redirect("/stock/moves");
}
