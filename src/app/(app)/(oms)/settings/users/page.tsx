"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { thDate } from "@/lib/format";
import { Spinner } from "@/components/ui/primitives";
import type { Role } from "@/lib/database.types";

type U = { id: string; email: string | null; full_name: string | null; avatar_url: string | null; role: Role; is_active: boolean; created_at: string };
const ROLES: Role[] = ["ADMIN", "SALES", "DESIGNER", "PRODUCTION", "INSTALLER", "ACCOUNTING", "VIEWER"];

export default function UsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<U[]>("/users").then((r) => r.data) });
  const mut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<U> }) => api.patch(`/users/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const rows = data ?? [];

  return (
    <div className="p-4 sm:p-6 fade-in">
      <h1 className="text-xl sm:text-2xl font-bold text-white">จัดการผู้ใช้</h1>
      <p className="text-sm mb-5" style={{ color: "var(--t-low)" }}>กำหนดบทบาท (RBAC) และเปิด-ปิดการเข้าถึง</p>
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
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
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
