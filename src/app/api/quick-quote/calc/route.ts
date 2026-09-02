import { readFile } from "node:fs/promises";
import path from "node:path";
import { getQuotePin } from "@/lib/quick-quote/pin";

export const dynamic = "force-dynamic";

/**
 * POST /api/quick-quote/calc  { pin }  → HTML เครื่องคิดราคา 3.9 (text/html) ถ้ารหัสถูก
 *
 * เสิร์ฟไฟล์ public/calculator/index.html ผ่าน gate PIN — หน้า /quote (เซลล์มือถือ) เอาไปใส่ iframe srcdoc
 *   → เครื่องคิด (ราคาฝังในไฟล์) ถูกปล่อยเฉพาะใส่รหัสถูก ไม่มี URL หลุด (กันคู่แข่งเห็นราคา)
 * inject: ซ่อนปุ่มที่ต้อง login (ส่งเข้าระบบ/AI ตรวจ) + polish มือถือ · public route (ไม่ต้อง login)
 */
function injectPublicMode(html: string): string {
  const inject = `
<style id="jr-public-sell">
  /* โหมดเซลล์ (public) — ซ่อนของที่ต้อง login */
  .btn-send-jr, #aiReviewBtn { display:none !important; }
  /* มือถือ: กันล้นจอ + แตะง่าย */
  html,body{ -webkit-text-size-adjust:100%; }
  .wrap{ padding:10px 10px 90px !important; }
  @media(max-width:640px){
    button, select, input, textarea{ font-size:16px !important; } /* กัน iOS zoom */
    .btn-prim,.btn-sec{ min-height:46px; }
  }
</style>
<script>
  // ตัดของที่ใช้ไม่ได้ในโหมด public (ต้อง login) ออกจาก DOM
  window.addEventListener('DOMContentLoaded', function(){
    try{
      var s=document.querySelector('.btn-send-jr'); if(s){ var w=s.closest('div'); (w||s).remove(); }
      var ai=document.getElementById('aiReviewBtn'); if(ai) ai.remove();
      // ลบโน้ตแดงที่อ้างถึงปุ่ม "ส่งเข้าระบบ" (ซึ่งถูกซ่อนแล้ว)
      document.querySelectorAll('.note').forEach(function(n){ if(n.textContent && n.textContent.indexOf('ส่งเข้าระบบ')>=0) n.remove(); });
    }catch(e){}
  });
</script>
`;
  // แทรกก่อน </body> (ไม่มีก็ต่อท้าย)
  return html.includes("</body>") ? html.replace("</body>", inject + "</body>") : html + inject;
}

export async function POST(req: Request) {
  const expected = await getQuotePin();
  if (!expected) {
    return new Response("ยังไม่ได้ตั้งรหัสผ่าน — รัน migration 0132 หรือ set app_config quote_pin ก่อน", { status: 503 });
  }
  let pin = "";
  try {
    const body = await req.json();
    pin = String(body?.pin ?? "").trim();
  } catch {
    return new Response("payload ไม่ถูกต้อง", { status: 400 });
  }
  if (!pin || pin !== expected) {
    await new Promise((r) => setTimeout(r, 400)); // หน่วงกันเดา
    return new Response("รหัสผ่านไม่ถูกต้อง", { status: 401 });
  }
  let html: string;
  try {
    html = await readFile(path.join(process.cwd(), "public", "calculator", "index.html"), "utf8");
  } catch {
    return new Response("โหลดเครื่องคิดราคาไม่สำเร็จ", { status: 500 });
  }
  return new Response(injectPublicMode(html), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
