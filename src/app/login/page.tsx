"use client";

import { useFormState, useFormStatus } from "react-dom";
import { login } from "./actions";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" disabled={pending}
      className="press w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
      style={{ background: "#b3151d", boxShadow: "0 6px 16px rgba(179,21,29,.3)" }}
    >
      {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, null as { error?: string } | null);

  return (
    <main className="bgwrap flex items-center justify-center p-4">
      <div className="glass rounded-3xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="text-3xl font-extrabold" style={{ color: "#b3151d" }}>
            JR <span className="text-ink-2">ERP</span>
          </div>
          <p className="text-sm text-ink-3 mt-1">ระบบบัญชี · Billing &amp; AR</p>
        </div>

        <form action={formAction} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-3">อีเมล</span>
            <input
              name="email" type="email" required autoComplete="email"
              className="w-full glass-soft rounded-xl px-3 py-2.5 mt-1 text-sm outline-none"
              placeholder="you@jr-aluminium.com"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-3">รหัสผ่าน</span>
            <input
              name="password" type="password" required autoComplete="current-password"
              className="w-full glass-soft rounded-xl px-3 py-2.5 mt-1 text-sm outline-none"
              placeholder="••••••••"
            />
          </label>

          {state?.error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
          )}

          <SubmitBtn />
        </form>

        <p className="text-[11px] text-ink-3 text-center mt-5">
          สร้างผู้ใช้ผ่าน Supabase &gt; Authentication แล้วตั้ง role ในตาราง profiles
        </p>
      </div>
    </main>
  );
}
