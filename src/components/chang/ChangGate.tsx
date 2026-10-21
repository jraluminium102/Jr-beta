"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * ล็อกอินลิงก์ช่างด้วยรหัสพนักงาน (0161 · เจ้าของสั่ง 21 ต.ค.69)
 *   ครอบทุกหน้าใต้ /chang/<token> (ตารางผลิต · เบิกอลู · ใบตัด) → ล็อกอินครั้งเดียวใช้ได้ทุกหน้า
 *   เก็บในมือถือ: chang_code (ส่งเป็น header x-chang-code — server แปลงเป็นชื่อเอง) + chang_name (โชว์)
 *   ช่างโลว์เทค: พิมพ์แค่ตัวเลข (JR เติมให้) ปุ่มใหญ่
 */
const CODE_KEY = "chang_code";
const NAME_KEY = "chang_name";
const C = { bg: "#f2f2f7", card: "#ffffff", ink: "#1c1c1e", ink2: "#636366", blue: "#007aff", red: "#ff3b30", line: "#e5e5ea" };

export default function ChangGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [who, setWho] = useState<{ code: string; name: string } | null>(null);

  useEffect(() => {
    try {
      const code = localStorage.getItem(CODE_KEY) || "";
      const name = localStorage.getItem(NAME_KEY) || "";
      if (code && name) {
        setWho({ code, name });
        // ตรวจซ้ำกับ server: บัญชีถูกปิด/ลบ → ล้างแล้วให้ล็อกอินใหม่ · ชื่อเปลี่ยน → อัปเดต
        api.post<{ code: string; name: string }>("/chang-login", { code })
          .then((r) => { try { localStorage.setItem(NAME_KEY, r.data.name); } catch { /* ignore */ } setWho(r.data); })
          .catch((e) => { if (e?.status === 404 || e?.status === 401) { try { localStorage.removeItem(CODE_KEY); localStorage.removeItem(NAME_KEY); } catch { /* ignore */ } setWho(null); } });
      } else localStorage.removeItem(NAME_KEY);   // ชื่อที่เคยพิมพ์เอง (ระบบเก่า) ไม่นับ — ต้องล็อกอินด้วยรหัส
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  const logout = () => {
    try { localStorage.removeItem(CODE_KEY); localStorage.removeItem(NAME_KEY); } catch { /* ignore */ }
    setWho(null);
  };

  if (!ready) return null;
  if (!who) return <LoginCard onDone={setWho} />;
  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-3 sm:px-6" style={{ background: C.bg }}>
        <span className="rounded-full px-3 py-1.5 text-[14px] font-semibold" style={{ background: C.card, color: C.ink }}>
          👤 {who.name} <span style={{ color: C.ink2, fontWeight: 400 }}>· {who.code}</span>
        </span>
        <button onClick={logout} className="rounded-full px-3 min-h-[36px] text-[13px] font-semibold" style={{ background: C.card, color: C.red }}>ออกจากระบบ</button>
      </div>
      {children}
    </>
  );
}

function LoginCard({ onDone }: { onDone: (w: { code: string; name: string }) => void }) {
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function login() {
    const digits = num.replace(/\D/g, "");
    if (!digits) { setErr("พิมพ์รหัสพนักงาน (ตัวเลข)"); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ code: string; name: string }>("/chang-login", { code: digits });
      try { localStorage.setItem(CODE_KEY, r.data.code); localStorage.setItem(NAME_KEY, r.data.name); } catch { /* ignore */ }
      onDone(r.data);
    } catch (e) { setErr(e instanceof Error ? e.message : "เข้าระบบไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return (
    <div className="min-h-[100dvh] flex items-start sm:items-center justify-center px-4 pt-16 sm:pt-0" style={{ background: C.bg }}>
      <div className="w-full max-w-[360px] rounded-[20px] p-5" style={{ background: C.card }}>
        <h1 className="text-[22px] font-bold" style={{ color: C.ink }}>เข้าใช้งาน</h1>
        <p className="text-[14px] mt-0.5 mb-4" style={{ color: C.ink2 }}>พิมพ์รหัสพนักงานของคุณ (ตัวเลข)</p>
        <div className="flex items-center rounded-[14px] overflow-hidden" style={{ border: `2px solid ${err ? C.red : C.line}` }}>
          <span className="px-4 text-[24px] font-bold" style={{ color: C.ink2, background: C.bg, lineHeight: "60px" }}>JR</span>
          <input autoFocus inputMode="numeric" pattern="[0-9]*" value={num} maxLength={4}
            onChange={(e) => { setNum(e.target.value.replace(/\D/g, "")); setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") login(); }}
            placeholder="002" aria-label="รหัสพนักงาน"
            className="flex-1 min-w-0 h-[60px] px-3 text-[28px] font-bold tracking-widest outline-none" style={{ color: C.ink }} />
        </div>
        {err && <p role="alert" className="text-[14px] mt-2" style={{ color: C.red }}>{err}</p>}
        <button onClick={login} disabled={busy || !num}
          className="w-full mt-4 min-h-[56px] rounded-[14px] text-[18px] font-bold text-white disabled:opacity-40" style={{ background: C.blue }}>
          {busy ? "กำลังเข้า…" : "เข้าใช้งาน"}
        </button>
        <p className="text-[12.5px] mt-3" style={{ color: C.ink2 }}>เข้าครั้งเดียว มือถือจะจำไว้ · ไม่มีรหัส ให้แจ้งแอดมิน</p>
      </div>
    </div>
  );
}
