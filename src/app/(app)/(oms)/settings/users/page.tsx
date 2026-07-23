"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { thDate } from "@/lib/format";
import { Spinner } from "@/components/ui/primitives";
import type { Role } from "@/lib/database.types";
import { ROLE_LABEL } from "@/lib/types";

type U = { id: string; email: string | null; full_name: string | null; avatar_url: string | null; role: Role; is_active: boolean; created_at: string };
const ROLES: Role[] = ["ADMIN", "SALES", "DESIGNER", "PRODUCTION", "INSTALLER", "ACCOUNTING", "VIEWER", "CHANG", "STORE"];

export default function UsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<U[]>("/users").then((r) => r.data) });
  const mut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<U> }) => api.patch(`/users/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const rows = data ?? [];

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "STORE" as Role });
  const [addErr, setAddErr] = useState("");
  const addMut = useMutation({
    mutationFn: () => api.post("/users", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setShowAdd(false); setForm({ full_name: "", email: "", password: "", role: "STORE" }); setAddErr(""); },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => setAddErr(e?.message ?? "สร้างไม่สำเร็จ"),
  });
  const canSubmit = form.full_name.trim() && /.+@.+\..+/.test(form.email) && form.password.length >= 6;

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-white">จัดการผู้ใช้</h1>
        <button onClick={() => { setShowAdd((v) => !v); setAddErr(""); }}
          className="press rounded-xl px-4 py-2 text-sm font-semibold bg-white/90 text-brand-dark">
          {showAdd ? "✕ ปิด" : "+ เพิ่มผู้ใช้"}
        </button>
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--t-low)" }}>กำหนดบทบาท (RBAC) และเปิด-ปิดการเข้าถึง</p>

      {showAdd && (
        <div className="glass-card rounded-2xl p-4 mb-5 space-y-2.5">
          <div className="text-white font-semibold text-sm">เพิ่มผู้ใช้ใหม่ (สร้างบัญชี + ตั้งรหัส + บทบาท)</div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <label className="block"><span className="text-[11px]" style={{ color: "var(--t-low)" }}>ชื่อ-นามสกุล</span>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="เช่น สมชาย สโตร์"
                className="w-full glass-soft rounded-lg px-3 py-2 mt-1 text-sm text-white outline-none" /></label>
            <label className="block"><span className="text-[11px]" style={{ color: "var(--t-low)" }}>บทบาท</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full glass-card rounded-lg px-3 py-2 mt-1 text-sm text-white outline-none [&>option]:text-gray-800">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </select></label>
            <label className="block"><span className="text-[11px]" style={{ color: "var(--t-low)" }}>อีเมล (ใช้ล็อกอิน)</span>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="store@jr-aluminium.com" autoComplete="off"
                className="w-full glass-soft rounded-lg px-3 py-2 mt-1 text-sm text-white outline-none" /></label>
            <label className="block"><span className="text-[11px]" style={{ color: "var(--t-low)" }}>รหัสผ่าน (อย่างน้อย 6 ตัว)</span>
              <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="text" placeholder="ตั้งรหัสให้พนักงาน" autoComplete="off"
                className="w-full glass-soft rounded-lg px-3 py-2 mt-1 text-sm text-white outline-none" /></label>
          </div>
          {addErr && <p className="text-sm text-rose-100 bg-rose-500/20 border border-rose-300/30 rounded-lg px-3 py-2">{addErr}</p>}
          <div className="flex items-center gap-2">
            <button onClick={() => addMut.mutate()} disabled={!canSubmit || addMut.isPending}
              className="press rounded-xl px-4 py-2 text-sm font-semibold bg-emerald-500 text-white disabled:opacity-50">
              {addMut.isPending ? "กำลังสร้าง…" : "สร้างบัญชี"}
            </button>
            <span className="text-[11px]" style={{ color: "var(--t-low)" }}>พนักงานล็อกอินที่หน้า /login ด้วยอีเมล+รหัสนี้</span>
          </div>
        </div>
      )}
      {isLoading ? <Spinner /> : (
        <div className="space-y-2.5">
          {rows.map((u) => (
            <div key={u.id} className="glass-card rounded-2xl p-4 flex items-center gap-3 flex-wrap">
              {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold">{(u.full_name ?? u.email ?? "U").charAt(0).toUpperCase()}</div>}
              <div className="flex-1 min-w-[140px]">
                <div className="text-white text-sm font-medium">{u.full_name ?? "—"}</div>
                <div className="text-[12px]" style={{ color: "var(--t-low)" }}>{u.email} · เข้าร่วม {thDate(u.created_at)}</div>
              </div>
              <select value={u.role} onChange={(e) => mut.mutate({ id: u.id, patch: { role: e.target.value as Role } })} aria-label="บทบาท"
                className="focusable glass-card rounded-xl px-3 py-2 text-sm text-white outline-none min-h-[40px] [&>option]:text-gray-800">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </select>
              <button onClick={() => mut.mutate({ id: u.id, patch: { is_active: !u.is_active } })}
                className={`focusable pressable rounded-xl px-3 py-2 text-[12px] font-medium min-h-[40px] border ${u.is_active ? "bg-emerald-500/20 text-emerald-100 border-emerald-300/30" : "bg-rose-500/20 text-rose-100 border-rose-300/30"}`}>
                {u.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
