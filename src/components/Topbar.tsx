// src/components/Topbar.tsx
import { useCallback, useEffect, useState } from "react";
import LayerLoadModal from "./LayerLoadModal";

type Msg = { type: "ok" | "err"; text: string } | null;

export default function Topbar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  const parseCoords = (text: string): { lat: number; lon: number } | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const norm = trimmed.replace(/,/g, " ").replace(/\s+/g, " ");
    const parts = norm.split(" ");
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    ) {
      return { lat, lon };
    }
    return null;
  };

  const flash = useCallback((m: Msg) => {
    setMsg(m);
    if (m) window.setTimeout(() => setMsg(null), 2500);
  }, []);

  const goToCoords = useCallback(() => {
    const parsed = parseCoords(query);
    if (!parsed) {
      flash({
        type: "err",
        text: "Format koordinat tidak valid. Gunakan: lat, lon (mis. -8.565127, 115.209106)",
      });
      return;
    }
    const { lat, lon } = parsed;
    window.dispatchEvent(
      new CustomEvent("goto-coords", {
        detail: { lat, lon, zoom: 16, animate: true },
      })
    );
    flash({
      type: "ok",
      text: `Loncat ke koordinat: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
    });
  }, [query, flash]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") goToCoords();
  };

  const openInGoogleMaps = () => {
    const parsed = parseCoords(query);
    if (!parsed) {
      flash({ type: "err", text: "Koordinat tidak valid untuk Google Maps." });
      return;
    }
    const { lat, lon } = parsed;
    window.open(
      `https://www.google.com/maps?q=${lat},${lon}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  useEffect(() => {}, []);

  return (
    <div className="topbar">
      <div className="brand">
        <img src="/smart-gov-revenue-small.png" alt="Logo" className="logo" />
        <span>SmartGov Revenue</span>
      </div>

      <div className="spacer" />
      <div className="title">Retribution Map</div>
      <div className="spacer" />

      <div className="searchwrap">
        <div className="search" title="Cari koordinat: -8.565127, 115.209106">
          <span className="icon">search</span>
          <input
            placeholder="Cari koordinat (lat, lon)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <button
          className="iconbtn"
          title="Loncat ke koordinat di peta"
          onClick={goToCoords}
        >
          <span className="iconlayers">travel_explore</span>
        </button>

        <button
          className="iconbtn"
          title="Buka di Google Maps"
          onClick={openInGoogleMaps}
        >
          <span className="iconlayers">map</span>
        </button>
      </div>

      {msg && (
        <div
          className={`toast ${msg.type === "ok" ? "ok" : "err"}`}
          style={{
            position: "absolute",
            top: 64,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 12,
            background:
              msg.type === "ok"
                ? "rgba(16,185,129,0.15)"
                : "rgba(239,68,68,0.15)",
            color: msg.type === "ok" ? "#10b981" : "#ef4444",
            border: `1px solid ${
              msg.type === "ok" ? "#10b98155" : "#ef444455"
            }`,
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ width: 16 }} />
      <div className="spacer" />

      <div className="tabs">
        <div className="tab active">Peta</div>
      </div>

      <div className="spacer" />
      <div className="actions">
        <button className="iconbtn" title="User">
          <span className="icon">account_circle</span>
        </button>
      </div>

      <LayerLoadModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
