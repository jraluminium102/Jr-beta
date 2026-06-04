"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/primitives";
import Icon from "@/components/Icon";
import { PRODUCTS } from "@/lib/calculator/engine";

// ─── Types ────────────────────────────────────────────────────────────────────
interface GalleryRow {
  id: number;
  product_key: string;
  title: string;
  storage_path: string;
  public_url: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ─── Product key list (จาก engine.ts — ใช้ id ตรง) ───────────────────────────
const PRODUCT_OPTIONS = PRODUCTS.map((p) => ({ id: p.id, label: `${p.name} (${p.cat})` }));

// ─── Component ────────────────────────────────────────────────────────────────
export default function GalleryAdmin({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [filterKey, setFilterKey] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [form, setForm] = useState({ product_key: PRODUCT_OPTIONS[0]?.id ?? "", title: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploadErr, setUploadErr] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  // fetch gallery rows
  const { data, isLoading } = useQuery({
    queryKey: ["gallery", filterKey],
    queryFn: () => {
      const q = filterKey ? `?product_key=${encodeURIComponent(filterKey)}&include_inactive=1` : "?include_inactive=1";
      return api.get<GalleryRow[]>(`/gallery${q}`).then((r) => r.data);
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.patch(`/gallery/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gallery"] }),
  });

  const softDelete = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/gallery/${id}`, { method: "DELETE" }).then(() => {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gallery"] }),
  });

  async function handleUpload() {
    setUploadErr("");
    if (!file) { setUploadErr("เลือกไฟล์รูปก่อน"); return; }
    if (!form.product_key) { setUploadErr("เลือกสินค้าก่อน"); return; }
    setUploadBusy(true);
    try {
      // 1. ขอ signed upload URL
      const urlRes = await fetch("/api/gallery/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_key: form.product_key, filename: file.name }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) { setUploadErr(urlJson.error ?? "ขอ URL ไม่สำเร็จ"); return; }
      const { signed_url, storage_path } = urlJson.data as { signed_url: string; storage_path: string };

      // 2. PUT ไฟล์ขึ้น Supabase Storage
      const putRes = await fetch(signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!putRes.ok) { setUploadErr("อัปโหลดรูปไม่สำเร็จ"); return; }

      // 3. บันทึก metadata ลง product_gallery
      const saveRes = await fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_key: form.product_key, title: form.title, storage_path }),
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok) { setUploadErr(saveJson.error ?? "บันทึกข้อมูลไม่สำเร็จ"); return; }

      setAddMode(false);
      setFile(null);
      setForm({ product_key: PRODUCT_OPTIONS[0]?.id ?? "", title: "" });
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["gallery"] });
    } catch {
      setUploadErr("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    } finally {
      setUploadBusy(false);
    }
  }

  const rows = data ?? [];

  return (
    <div className="p-4 sm:p-6 fade-in space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Icon name="image" size={22} />
            คลังภาพสินค้า
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--t-low)" }}>
            ผูกรูปผลงาน / ตัวอย่างกับสินค้าแต่ละรายการ
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => { setAddMode(true); setUploadErr(""); }}
            className="focusable pressable inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand min-h-[44px]"
          >
            <Icon name="upload" size={16} />
            เพิ่มรูปใหม่
          </button>
        )}
      </div>

      {/* Filter by product key */}
      <div>
        <label className="text-xs font-medium text-white/60 block mb-1">กรองตามสินค้า</label>
        <select
          value={filterKey}
          onChange={(e) => setFilterKey(e.target.value)}
          className="focusable glass-card rounded-xl px-3 py-2 text-sm text-white outline-none min-h-[44px] [&>option]:text-gray-800"
        >
          <option value="">— ทั้งหมด —</option>
          {PRODUCT_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Add form */}
      {addMode && canWrite && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-bold text-white">เพิ่มรูปใหม่</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label className="block">
              <span className="text-xs font-medium text-white/60">สินค้า *</span>
              <select
                value={form.product_key}
                onChange={(e) => setForm({ ...form, product_key: e.target.value })}
                className="focusable w-full glass-card rounded-xl px-3 py-2.5 mt-1 text-white outline-none [&>option]:text-gray-800"
              >
                {PRODUCT_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-white/60">คำอธิบาย / Caption</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="เช่น งานบ้านคุณสมศักดิ์ สีอบขาว"
                className="focusable w-full glass-card rounded-xl px-3 py-2.5 mt-1 text-white outline-none"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-xs font-medium text-white/60">ไฟล์รูป * (jpg / png / webp / gif, ขนาดแนะนำ ≤2 MB)</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="focusable block mt-1 text-sm text-white/80 file:rounded-xl file:px-4 file:py-2 file:text-sm file:font-medium file:bg-white/15 file:text-white file:border-0 file:mr-3 hover:file:bg-white/25"
            />
          </label>
          {uploadErr && (
            <p role="alert" className="text-sm text-red-300 bg-red-900/30 rounded-xl px-3 py-2">{uploadErr}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploadBusy}
              className="focusable pressable rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60 min-h-[44px]"
            >
              {uploadBusy ? "กำลังอัปโหลด…" : "บันทึก"}
            </button>
            <button
              onClick={() => { setAddMode(false); setUploadErr(""); }}
              className="focusable pressable glass-card rounded-xl px-5 py-2.5 text-sm text-white/70 min-h-[44px]"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Gallery grid */}
      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-white/50 text-center py-12">ยังไม่มีรูปในคลัง</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`glass-card rounded-2xl overflow-hidden flex flex-col ${!row.is_active ? "opacity-40" : ""}`}
            >
              <div className="aspect-[4/3] bg-black/20 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.public_url}
                  alt={row.title || row.product_key}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-2.5 flex-1 flex flex-col gap-1.5">
                <p className="text-xs font-medium text-white/80 line-clamp-2">
                  {row.title || "—"}
                </p>
                <p className="text-[10px] text-white/40">{row.product_key}</p>
                {canWrite && (
                  <div className="flex gap-1.5 mt-auto pt-1">
                    <button
                      onClick={() => toggleActive.mutate({ id: row.id, is_active: !row.is_active })}
                      aria-label={row.is_active ? "ซ่อนรูปนี้" : "แสดงรูปนี้"}
                      className={`focusable pressable flex-1 rounded-lg py-1.5 text-[11px] font-medium min-h-[36px] ${
                        row.is_active
                          ? "bg-amber-500/20 text-amber-200 border border-amber-300/20"
                          : "bg-emerald-500/20 text-emerald-200 border border-emerald-300/20"
                      }`}
                    >
                      {row.is_active ? "ซ่อน" : "แสดง"}
                    </button>
                    <button
                      onClick={() => { if (confirm("ลบรูปนี้?")) softDelete.mutate(row.id); }}
                      aria-label="ลบรูปนี้"
                      className="focusable pressable rounded-lg px-2.5 py-1.5 bg-red-500/20 text-red-200 border border-red-300/20 min-h-[36px]"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
