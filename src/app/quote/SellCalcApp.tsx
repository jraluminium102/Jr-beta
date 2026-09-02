"use client";

import { useEffect, useState } from "react";

const LS_PIN = "qq.calcpin.v1";

export default function SellCalcApp() {
  const [html, setHtml] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // เปิดครั้งแรก: ถ้าเครื่องเคยใส่รหัสไว้ → ดึงเครื่องคิดมาเลย
  useEffect(() => {
    let pin = "";
    try { pin = localStorage.getItem(LS_PIN) || ""; } catch { /* private mode */ }
    if (pin) unlock(pin).catch(() => { /* รหัสเก่าใช้ไม่ได้แล้ว → โชว์หน้าใส่รหัส */ }).finally(() => setReady(true));
    else setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(pin: string) {
    const res = await fetch("/api/quick-quote/calc", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }),
    });
    if (!res.ok) { const msg = await res.text().catch(() => ""); throw new Error(msg || "เข้าไม่ได้"); }
    const h = await res.text();
    try { localStorage.setItem(LS_PIN, pin); } catch { /* private mode */ }
    setHtml(h);
  }

  if (!ready) return <Splash />;
  if (!html) return <PinGate onUnlock={unlock} />;
  return (
    <iframe
      srcDoc={html}
      title="เครื่องคิดราคา JR"
      style={{ border: 0, width: "100%", height: "100dvh", display: "block" }}
    />
  );
}

function Splash() {
  return <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f1f5f9", color: "#94a3b8", font: "14px system-ui" }}>กำลังโหลด…</div>;
}

function PinGate({ onUnlock }: { onUnlock: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null); setBusy(true);
    try { await onUnlock(pin); }
    catch (e) { setErr(e instanceof Error ? e.message : "เข้าไม่ได้"); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px",
      background: "linear-gradient(to bottom,#1e293b,#0f172a)", color: "#fff", font: "16px system-ui" }}>
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 2 }}>JR Aluminium</div>
        <div style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 28 }}>เครื่องคิดราคา (สำหรับเซลล์)</div>
        <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 16, padding: 20 }}>
          <label style={{ display: "block", textAlign: "left", fontSize: 13, color: "#e2e8f0", marginBottom: 8 }}>รหัสผ่าน</label>
          <input
            type="password" inputMode="numeric" autoFocus value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: "1px solid rgba(255,255,255,.2)",
              background: "rgba(255,255,255,.92)", color: "#0f172a", padding: "12px 16px", fontSize: 18, textAlign: "center", letterSpacing: 3, outline: "none" }}
            placeholder="••••"
          />
          {err && <div style={{ marginTop: 8, fontSize: 14, color: "#fda4af" }}>{err}</div>}
          <button
            onClick={submit} disabled={busy || pin.length < 3}
            style={{ marginTop: 16, width: "100%", borderRadius: 12, border: 0, background: "#0ea5e9", color: "#fff",
              padding: "12px", fontSize: 16, fontWeight: 600, opacity: busy || pin.length < 3 ? 0.4 : 1 }}
          >
            {busy ? "กำลังตรวจ…" : "เข้าใช้งาน"}
          </button>
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: "#94a3b8" }}>ใส่ครั้งเดียว เครื่องนี้จะจำไว้</div>
      </div>
    </div>
  );
}
