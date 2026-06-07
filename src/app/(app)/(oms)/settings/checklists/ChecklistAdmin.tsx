"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ChecklistTemplate, ChecklistItem } from "@/lib/database.types";
import Icon from "@/components/Icon";
import { ROLE_LABEL } from "@/lib/types";
import type { UserRole } from "@/lib/types";

type TemplateWithItems = ChecklistTemplate & { items?: ChecklistItem[] };

// ─── Template List ────────────────────────────────────────────────────────────

function TemplateCard({
  tpl,
  isAdmin,
  onSelect,
  onToggle,
}: {
  tpl: ChecklistTemplate;
  isAdmin: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
}) {
  return (
    <div className={`glass rounded-2xl p-4 flex flex-col gap-2 ${!tpl.is_active ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-brand-dark">{tpl.name}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {tpl.target_role.map((r) => (
              <span key={r} className="text-[11px] bg-brand-soft text-brand-dark rounded px-1.5 py-0.5">
                {ROLE_LABEL[r as UserRole] ?? r}
              </span>
            ))}
          </div>
          {tpl.product_keys.length > 0 && (
            <div className="text-[11px] text-ink-3 mt-1">
              สินค้า: {tpl.product_keys.join(", ")}
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onSelect(tpl.id)}
            className="press glass-soft rounded-lg px-3 py-2 text-xs text-brand-dark font-medium min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <Icon name="file" size={14} /> จัดการ Items
          </button>
          {isAdmin && (
            <button
              onClick={() => onToggle(tpl.id, !tpl.is_active)}
              className="press glass-soft rounded-lg px-3 py-2 text-xs text-ink-2 min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {tpl.is_active ? <><Icon name="trash" size={14} /> ซ่อน</> : "แสดง"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Template Form ────────────────────────────────────────────────────────

const ALL_ROLES: UserRole[] = ["ADMIN","SALES","DESIGNER","PRODUCTION","INSTALLER","ACCOUNTING","VIEWER"];

function AddTemplateForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<UserRole[]>(["ADMIN"]);
  const [productKeys, setProductKeys] = useState("");
  const [error, setError] = useState("");

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.post("/checklists/templates", {
      name: name.trim(),
      target_role: roles,
      product_keys: productKeys.trim()
        ? productKeys.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-templates"] });
      setName(""); setProductKeys(""); setError("");
      onSuccess();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "เกิดข้อผิดพลาด"),
  });

  function toggleRole(r: UserRole) {
    setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="font-semibold text-brand-dark">เพิ่มชุดเช็คลิสต์ใหม่</div>
      <div>
        <label className="block text-xs font-medium text-ink-2 mb-1">ชื่อชุดเช็ค *</label>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ช่างวัดหน้างาน"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2 mb-1.5">บทบาทที่ใช้ได้ *</label>
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map((r) => (
            <button
              key={r} type="button"
              onClick={() => toggleRole(r)}
              className={`press px-3 py-1.5 rounded-lg text-xs font-medium border min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand ${
                roles.includes(r)
                  ? "bg-brand text-white border-brand"
                  : "glass-soft text-ink-2 border-transparent"
              }`}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2 mb-1">
          กรองสินค้า (product_key คั่นด้วย , ว่างเว้น = ทุกสินค้า)
        </label>
        <input
          value={productKeys} onChange={(e) => setProductKeys(e.target.value)}
          placeholder="เช่น sliding_sms, casement_sms"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        onClick={() => { if (name.trim() && roles.length > 0) mut.mutate(); }}
        disabled={!name.trim() || roles.length === 0 || mut.isPending}
        className="press bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px] w-full focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
      >
        {mut.isPending ? "กำลังบันทึก…" : "บันทึกชุดเช็คลิสต์"}
      </button>
    </div>
  );
}

// ─── Items Editor ─────────────────────────────────────────────────────────────

function ItemsEditor({ templateId, isAdmin }: { templateId: number; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ items: ChecklistItem[] }>({
    queryKey: ["checklist-template-detail", templateId],
    queryFn: () => api.get<{ items: ChecklistItem[] }>(`/checklists/templates/${templateId}`).then((r) => r.data),
  });

  const [text, setText] = useState("");
  const [seq, setSeq] = useState(10);
  const [requiresSign, setRequiresSign] = useState(false);
  const [addError, setAddError] = useState("");

  const addMut = useMutation({
    mutationFn: () =>
      api.post(`/checklists/templates/${templateId}/items`, {
        seq, text: text.trim(),
        requires_sign: requiresSign,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-template-detail", templateId] });
      setText(""); setSeq(10); setRequiresSign(false); setAddError("");
    },
    onError: (e) => setAddError(e instanceof ApiError ? e.message : "เกิดข้อผิดพลาด"),
  });

  const delMut = useMutation({
    mutationFn: (itemId: number) =>
      fetch(`/api/checklists/templates/${templateId}/items?item_id=${itemId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-template-detail", templateId] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      {isLoading && <div className="text-sm text-ink-3">กำลังโหลด…</div>}

      {/* รายการที่มีอยู่ */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="glass rounded-xl p-3 flex items-start gap-3">
              <span className="text-xs text-ink-3 w-6 shrink-0 pt-0.5 tabular-nums">{it.seq}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{it.text}</div>
                {it.requires_sign && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                      ต้องเซ็น
                    </span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <button
                  onClick={() => delMut.mutate(it.id)}
                  disabled={delMut.isPending}
                  aria-label="ลบ item"
                  className="press glass-soft w-9 h-9 rounded-lg inline-flex items-center justify-center text-red-500 shrink-0 focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && !isLoading && (
        <p className="text-sm text-ink-3 text-center py-4">ยังไม่มีรายการ — เพิ่มด้านล่าง</p>
      )}

      {/* ฟอร์มเพิ่ม item */}
      {isAdmin && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="text-sm font-medium text-ink">เพิ่มรายการตรวจ</div>
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <div>
              <label className="block text-[11px] text-ink-3 mb-1">ลำดับ</label>
              <input
                type="number" value={seq} onChange={(e) => setSeq(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] text-ink-3 mb-1">ข้อความ *</label>
              <input
                value={text} onChange={(e) => setText(e.target.value)}
                placeholder="เช่น วัดช่องเปิดจริง"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox" checked={requiresSign}
              onChange={(e) => setRequiresSign(e.target.checked)}
              className="rounded focus:ring-brand"
            />
            ต้องมีลายเซ็น
          </label>
          {addError && <p className="text-sm text-red-500">{addError}</p>}
          <button
            onClick={() => { if (text.trim()) addMut.mutate(); }}
            disabled={!text.trim() || addMut.isPending}
            className="press bg-brand text-white rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          >
            {addMut.isPending ? "กำลังเพิ่ม…" : "+ เพิ่มรายการ"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChecklistAdmin({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const { data, isLoading } = useQuery<ChecklistTemplate[]>({
    queryKey: ["checklist-templates"],
    queryFn: () =>
      api.get<ChecklistTemplate[]>("/checklists/templates?include_inactive=1").then((r) => r.data),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.patch(`/checklists/templates/${id}`, { is_active: active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-templates"] }),
  });

  const templates = data ?? [];
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">จัดการเช็คลิสต์</h1>
          <p className="text-sm text-ink-2 mt-0.5">ชุดเช็คลิสต์ผูกกับบทบาท สำหรับใบปะหน้างาน</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="press bg-brand text-white rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <Icon name="plus" size={16} /> เพิ่มชุดเช็ค
          </button>
        )}
      </div>

      {showAddForm && isAdmin && (
        <AddTemplateForm onSuccess={() => setShowAddForm(false)} />
      )}

      <div className="grid md:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Template list */}
        <div className="space-y-3">
          {isLoading && <div className="text-sm text-ink-3">กำลังโหลด…</div>}
          {templates.length === 0 && !isLoading && (
            <p className="text-sm text-ink-3 text-center py-8">ยังไม่มีชุดเช็คลิสต์</p>
          )}
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              tpl={t}
              isAdmin={isAdmin}
              onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
              onToggle={(id, active) => toggleMut.mutate({ id, active })}
            />
          ))}
        </div>

        {/* Items panel */}
        {selected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedId(null)}
                aria-label="ปิด"
                className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <Icon name="arrowLeft" size={18} />
              </button>
              <h2 className="text-base font-bold text-brand-dark">{selected.name}</h2>
            </div>
            <ItemsEditor templateId={selected.id} isAdmin={isAdmin} />
          </div>
        ) : (
          <div className="glass rounded-2xl p-10 text-center text-sm text-ink-3">
            เลือกชุดเช็คลิสต์เพื่อจัดการรายการ
          </div>
        )}
      </div>
    </div>
  );
}
