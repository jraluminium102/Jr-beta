"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Upload, Save, Printer, Trash2, FileText, Pencil, Check, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import { uploadDrawingFiles } from "@/lib/job-drawings/pdf-render";
import { drawingPublicUrl } from "@/lib/job-drawings/storage";
import { DEFAULT_ANNOT_SIZE, type DrawingAnnotation, type JobDrawing, type JobDrawingsGetResponse } from "@/lib/job-drawings/types";
import DrawingCanvas from "./DrawingCanvas";
import PrefillPanel from "./PrefillPanel";

const btn = "focusable pressable inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40";

// เติม "หัวแบบ" อัตโนมัติ = ที่อยู่บ้านลูกค้า(มุมซ้ายบน) + ชื่อลูกค้า(กลางบน) เป็น annotation แก้/ลากได้
//   ทำต่อหน้า · id คงที่ hdr-*-{page} กันซ้ำ · ข้ามถ้ามี annotation ข้อความตรงกับชื่อ/ที่อยู่อยู่แล้ว (กันซ้ำของที่แสตมป์เอง)
function seedHeaderAnnotations(anns: DrawingAnnotation[], pageCount: number, name: string, address: string): { annotations: DrawingAnnotation[]; added: boolean } {
  const out = [...anns];
  let added = false;
  const nm = (name ?? "").trim();
  const ad = (address ?? "").trim();
  for (let p = 0; p < pageCount; p++) {
    const onPage = out.filter((a) => a.page === p);
    if (ad && !onPage.some((a) => a.id === `hdr-addr-${p}`) && !onPage.some((a) => (a.text ?? "").trim() === ad)) {
      out.push({ id: `hdr-addr-${p}`, page: p, xf: 0.006, yf: 0.006, size: 0.013, text: ad, color: "", align: "left" });
      added = true;
    }
    if (nm && !onPage.some((a) => a.id === `hdr-name-${p}`) && !onPage.some((a) => (a.text ?? "").trim() === nm)) {
      out.push({ id: `hdr-name-${p}`, page: p, xf: 0.05, yf: 0.006, size: 0.018, text: nm, color: "", align: "center" });
      added = true;
    }
  }
  return { annotations: out, added };
}

// เติม path (สัมพัทธ์) → public URL ก่อนใช้แสดงรูป + เติม id ให้ annotation เก่าที่ไม่มี (กันชนตอนแก้)
function hydrateDrawing(d: JobDrawing): JobDrawing {
  return {
    ...d,
    pages: (d.pages ?? []).map((p) => ({ ...p, path: p.path.startsWith("http") ? p.path : drawingPublicUrl(p.path) })),
    annotations: (d.annotations ?? []).map((a, i) => ({ ...a, id: a.id || `legacy-${i}-${Math.random().toString(36).slice(2)}` })),
  };
}

export default function DrawingEditorPage({ params }: { params: { jobId: string } }) {
  const jobId = params.jobId;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["job-drawings", jobId],
    queryFn: () => api.get<JobDrawingsGetResponse>(`/job-drawings?job_id=${jobId}`),
  });

  const job = data?.data?.job ?? null;
  const prefill = data?.data?.prefill ?? [];
  const canWrite = data?.data?.can_write ?? false;   // สิทธิ์แก้จริง (ADMIN/PRODUCTION/DESIGNER) — role อ่านอย่างเดียวเห็นแต่ดู/พิมพ์
  const drawings = useMemo(() => (data?.data?.drawings ?? []).map(hydrateDrawing), [data]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<DrawingAnnotation[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  // คลิปบอร์ดก๊อปกล่องข้อความ — เก็บสไตล์ทั้งก้อน (ข้อความ/สี/ไฮไลต์/ขนาด/จัดแนว) ไว้ "วาง" ข้ามหน้าได้
  const [clip, setClip] = useState<Pick<DrawingAnnotation, "text" | "color" | "hl" | "size" | "align"> | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  // เลือกแบบแรกให้อัตโนมัติเมื่อโหลดเสร็จ (ครั้งแรกเท่านั้น — ไม่ทับตอนแก้ต่อ)
  useEffect(() => {
    if (selectedId === null && drawings.length > 0) setSelectedId(drawings[0].id);
  }, [drawings, selectedId]);

  const selected = drawings.find((d) => d.id === selectedId) ?? null;

  // โหลด annotations ของแบบที่เลือกเข้า state แก้ไข (ทุกครั้งที่สลับแบบ / โหลดใหม่แล้วยังไม่มีการแก้ค้าง)
  //   + เติม "หัวแบบ" (ที่อยู่+ชื่อ) อัตโนมัติเป็น annotation แก้/ลากได้ (ยังไม่ dirty — กด "แก้/ลาก/บันทึก" ค่อยเก็บถาวร)
  useEffect(() => {
    if (!selected || dirty) return;
    const { annotations: seeded } = seedHeaderAnnotations(selected.annotations, selected.pages.length, job?.customer_name ?? "", job?.address ?? "");
    setAnnotations(seeded);
    setActivePage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, dirty]);

  if (isLoading) return <div className="max-w-[1500px] mx-auto pb-10"><Spinner /></div>;
  if (error || !job) {
    return (
      <div className="max-w-[1500px] mx-auto pb-10">
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" sub={error instanceof ApiError ? error.message : "ลองรีเฟรช"} />
      </div>
    );
  }

  if (!job.deposited) {
    return (
      <div className="max-w-[900px] mx-auto pb-10">
        <Link href={`/cover-sheet/${jobId}`} className="focusable pressable inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white mb-4">
          <ArrowLeft size={16} /> กลับใบปะหน้า
        </Link>
        <EmptyState title="งานนี้ยังไม่มัดจำ" sub="สแตมป์สเปคลงแบบทำได้เฉพาะงานที่ลูกค้ามัดจำแล้วเท่านั้น — บันทึกมัดจำก่อนแล้วกลับมาใหม่" />
      </div>
    );
  }

  const addAnnotation = (pageIndex: number, xf: number, yf: number, text: string) => {
    const a: DrawingAnnotation = {
      id: crypto.randomUUID(), page: pageIndex, xf: Math.min(0.92, xf), yf: Math.min(0.95, yf),
      size: DEFAULT_ANNOT_SIZE, text, color: "", align: "left",
    };
    setAnnotations((cur) => [...cur, a]);
    setDirty(true);
  };
  // ปุ่ม "+" ในแผงข้าง — เพิ่มลงหน้าที่กำลังใช้งาน ไล่ตำแหน่งลงเรื่อย ๆ กันซ้อนทับกันเป๊ะ
  const addAtActivePage = (text: string) => {
    const countOnPage = annotations.filter((a) => a.page === activePage).length;
    const yf = 0.06 + (countOnPage % 10) * 0.045;
    addAnnotation(activePage, 0.06, yf, text);
  };
  const patchAnnotation = (id: string, patch: Partial<DrawingAnnotation>) => {
    setAnnotations((cur) => cur.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setDirty(true);
  };
  const removeAnnotation = (id: string) => {
    setAnnotations((cur) => cur.filter((a) => a.id !== id));
    setDirty(true);
  };
  // ก๊อปกล่องข้อความลงคลิปบอร์ด (ยังไม่วาง) — เก็บสไตล์ทั้งก้อน · แล้วไปกด "วาง" หน้าไหนก็ได้
  const copyAnnotation = (id: string) => {
    const src = annotations.find((a) => a.id === id);
    if (!src) return;
    setClip({ text: src.text, color: src.color, hl: src.hl, size: src.size, align: src.align });
    setCopyMsg("ก๊อปแล้ว — เลื่อนไปหน้าที่ต้องการ แล้วกด “วางกล่องที่ก๊อป” ในแผงขวา");
    setTimeout(() => setCopyMsg(null), 4000);
  };
  // วางกล่องที่ก๊อป ลง "หน้าที่กำลังดู" (activePage) — ข้ามหน้าได้ · ไล่ตำแหน่งลงกันซ้อน
  const pasteAnnotation = () => {
    if (!clip) return;
    const countOnPage = annotations.filter((a) => a.page === activePage).length;
    const yf = Math.min(0.95, 0.06 + (countOnPage % 10) * 0.045);
    setAnnotations((cur) => [...cur, {
      id: crypto.randomUUID(), page: activePage, xf: 0.06, yf,
      size: clip.size ?? DEFAULT_ANNOT_SIZE, text: clip.text ?? "",
      color: clip.color ?? "", align: clip.align ?? "left", hl: clip.hl,
    }]);
    setDirty(true);
  };

  const doSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/job-drawings/${selected.id}`, { annotations });
      setDirty(false);
      setSaveMsg("บันทึกแล้ว ✓");
      qc.invalidateQueries({ queryKey: ["job-drawings", jobId] });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const doUpload = async (file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadErr("รองรับเฉพาะไฟล์ PDF"); return;
    }
    setUploading(true); setUploadErr(null); setUploadMsg("เริ่มอัปโหลด…");
    try {
      const up = await uploadDrawingFiles(jobId, file, (msg) => setUploadMsg(msg));
      const r = await api.post<JobDrawing>("/job-drawings", {
        job_id: jobId,
        title: file.name.replace(/\.pdf$/i, ""),
        pdf_path: up.pdf_path,
        original_name: up.original_name,
        pages: up.pages,
      });
      await qc.invalidateQueries({ queryKey: ["job-drawings", jobId] });
      setSelectedId(r.data.id);
      setDirty(false);
      setUploadMsg(null);
    } catch (e) {
      setUploadErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doDelete = async (d: JobDrawing) => {
    if (!window.confirm(`ลบแบบ "${d.title || d.original_name}" ทั้งหมด (${d.pages.length} หน้า)? ลบแล้วกู้คืนไม่ได้`)) return;
    try {
      await api.del(`/job-drawings/${d.id}`);
      if (selectedId === d.id) { setSelectedId(null); setDirty(false); }
      qc.invalidateQueries({ queryKey: ["job-drawings", jobId] });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "ลบไม่สำเร็จ");
    }
  };

  const saveTitle = async () => {
    if (!selected) return;
    try {
      await api.patch(`/job-drawings/${selected.id}`, { title: titleDraft });
      setEditingTitle(false);
      qc.invalidateQueries({ queryKey: ["job-drawings", jobId] });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกชื่อไม่สำเร็จ");
    }
  };

  return (
    <div className="max-w-[1500px] mx-auto pb-16">
      {/* แถบบน */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link href={`/cover-sheet/${jobId}`} className="focusable pressable inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
          <ArrowLeft size={16} /> กลับใบปะหน้า
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {canWrite && (
            <>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={`${btn} text-white bg-sky-500`}>
                <Upload size={15} /> {uploading ? "กำลังอัปโหลด…" : "อัปโหลดแบบ (PDF)"}
              </button>
            </>
          )}
          {selected && (
            <>
              {canWrite && (
                <button type="button" onClick={doSave} disabled={saving || !dirty} className={`${btn} text-white bg-emerald-600`}>
                  <Save size={15} /> {saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}
                </button>
              )}
              <Link href={`/cover-sheet/${jobId}/drawing/print?d=${selected.id}`} className={`${btn} text-gray-900 bg-white`}>
                <Printer size={15} /> พิมพ์
              </Link>
            </>
          )}
        </div>
      </div>

      {saveMsg && <div className="mb-3 rounded-lg bg-emerald-500 text-white text-[13px] font-medium px-3 py-2 inline-block">{saveMsg}</div>}
      {copyMsg && <div className="mb-3 rounded-lg bg-sky-500 text-white text-[13px] font-medium px-3 py-2 inline-block">📋 {copyMsg}</div>}
      {uploadMsg && <div className="mb-3 rounded-lg bg-sky-500 text-white text-[13px] font-medium px-3 py-2 inline-block">{uploadMsg}</div>}
      {uploadErr && <div className="mb-3 rounded-lg bg-rose-600 text-white text-[13px] font-medium px-3 py-2 inline-block">{uploadErr}</div>}

      <div className="text-center mb-4">
        <span className="text-white/70 text-[15px]">ชื่อลูกค้า</span>{" "}
        <span className="text-white text-2xl font-bold">{job.customer_name || "—"}</span>
        {job.job_code && <span className="text-white/50 text-[13px] ml-2 tnum">({job.job_code})</span>}
      </div>

      {drawings.length === 0 ? (
        <EmptyState title="งานนี้ยังไม่มีแบบที่อัปโหลด" sub="กด “อัปโหลดแบบ (PDF)” ด้านบนเพื่อเริ่ม" />
      ) : (
        <>
          {/* แท็บเลือกแบบ (1 งานมีได้หลายแผ่น) */}
          {drawings.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {drawings.map((d) => (
                <button key={d.id} type="button"
                  onClick={() => { if (dirty && !window.confirm("มีการแก้ที่ยังไม่บันทึก จะสลับแบบไหม? การแก้ล่าสุดจะหาย")) return; setSelectedId(d.id); setDirty(false); }}
                  className={`text-[13px] rounded-lg px-3 py-2 min-h-[38px] font-medium inline-flex items-center gap-1.5 ${selectedId === d.id ? "bg-white text-gray-900" : "bg-white/10 text-white/80 hover:bg-white/18"}`}>
                  <FileText size={13} /> {d.title || d.original_name || `แบบ #${d.id}`}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
              <div>
                {/* ชื่อชุดแบบ + ลบ */}
                <div className="glass-card rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-2">
                  {editingTitle ? (
                    <>
                      <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                        autoFocus
                        className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300" />
                      <button type="button" onClick={saveTitle} className="w-8 h-8 grid place-items-center rounded-md bg-emerald-500 text-white"><Check size={14} /></button>
                      <button type="button" onClick={() => setEditingTitle(false)} className="w-8 h-8 grid place-items-center rounded-md bg-white/15 text-white"><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <FileText size={15} className="text-white/70 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-white font-medium text-[14px]">{selected.title || selected.original_name || `แบบ #${selected.id}`}</span>
                      {canWrite && (
                        <>
                          <button type="button" title="แก้ชื่อ" onClick={() => { setTitleDraft(selected.title); setEditingTitle(true); }}
                            className="w-8 h-8 grid place-items-center rounded-md hover:bg-white/15 text-white/70"><Pencil size={14} /></button>
                          <button type="button" title="ลบแบบนี้" onClick={() => doDelete(selected)}
                            className="w-8 h-8 grid place-items-center rounded-md hover:bg-rose-500/30 text-rose-200"><Trash2 size={14} /></button>
                        </>
                      )}
                    </>
                  )}
                </div>
                <DrawingCanvas
                  pages={selected.pages}
                  annotations={annotations}
                  activePage={activePage}
                  onSetActivePage={setActivePage}
                  onPatch={patchAnnotation}
                  onRemove={removeAnnotation}
                  onCopy={copyAnnotation}
                  onDropText={addAnnotation}
                  canWrite={canWrite}
                />
              </div>
              <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-2rem)] lg:overflow-auto">
                <PrefillPanel groups={prefill} onAddText={addAtActivePage} onAddBlank={() => addAtActivePage("")} onPaste={pasteAnnotation} hasClip={!!clip} disabled={!canWrite} activePageLabel={activePage + 1} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
