"use client";
// ============================================================
// MapPicker — เลือกพิกัดบนแผนที่โดยตรง (Leaflet + OpenStreetMap ฟรี ไม่ต้องมี API key)
// แก้ปัญหาระยะยาว: เลิกพึ่ง "การแกะลิงก์ Google Maps" (เปราะ/ช้า/พังเป็นระยะ)
// → เก็บพิกัดที่ต้นทาง: ปักหมุด/ลาก/คลิก/ค้นหา ได้พิกัดแน่นอนทันที
// ใช้ผ่าน next/dynamic({ ssr:false }) เท่านั้น (Leaflet แตะ window)
// ============================================================
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// หมุดแบบ divIcon (เลี่ยงปัญหา asset ของ marker default ตอน bundle)
const PIN = L.divIcon({
  className: "",
  html:
    '<div style="transform:translate(-50%,-100%);font-size:30px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">📍</div>',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

// ศูนย์กลางเริ่มต้น = แถวร้าน (พุทธบูชา ทุ่งครุ กทม.)
const DEFAULT_CENTER: [number, number] = [13.62, 100.49];

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }, [lat, lng, map]);
  return null;
}

export default function MapPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");

  // ค้นหาสถานที่ด้วยชื่อ/ที่อยู่ (Nominatim ฟรี) — ช่วยตอนลิงก์อ่านไม่ได้/ไม่มีลิงก์
  async function doSearch() {
    const term = q.trim();
    if (!term) return;
    setSearching(true); setSearchMsg("");
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=th&q=" +
        encodeURIComponent(term);
      const res = await fetch(url, { headers: { "Accept-Language": "th" } });
      const arr = (await res.json()) as { lat: string; lon: string }[];
      if (arr.length) {
        onChange(Number(arr[0].lat), Number(arr[0].lon));
        setSearchMsg("");
      } else {
        setSearchMsg("ไม่พบสถานที่นี้ — ลองพิมพ์ละเอียดขึ้น หรือคลิกบนแผนที่เอง");
      }
    } catch {
      setSearchMsg("ค้นหาไม่สำเร็จ — คลิกบนแผนที่เพื่อปักหมุดเองได้");
    } finally {
      setSearching(false);
    }
  }

  const center: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }}
          placeholder="ค้นหาชื่อสถานที่/ที่อยู่ เพื่อหาบนแผนที่…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="button" onClick={doSearch} disabled={searching}
          className="press rounded-lg px-3 py-2 text-sm font-semibold bg-brand text-white disabled:opacity-60 shrink-0">
          {searching ? "ค้นหา…" : "ค้นหา"}
        </button>
      </div>
      {searchMsg && <p className="text-[11px] text-amber-700">{searchMsg}</p>}

      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 280 }}>
        <MapContainer
          center={center}
          zoom={lat != null ? 16 : 11}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCapture onPick={onChange} />
          {lat != null && lng != null && (
            <Marker
              position={[lat, lng]}
              draggable
              icon={PIN}
              eventHandlers={{
                dragend(e) {
                  const p = (e.target as L.Marker).getLatLng();
                  onChange(p.lat, p.lng);
                },
              }}
            />
          )}
          <Recenter lat={lat} lng={lng} />
        </MapContainer>
      </div>
      <p className="text-[11px] text-ink-3">
        คลิกบนแผนที่ หรือลากหมุด เพื่อกำหนดจุดที่แน่นอน (ใช้คำนวณระยะ/จัดคิวอัตโนมัติ)
      </p>
    </div>
  );
}
