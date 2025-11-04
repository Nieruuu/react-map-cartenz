// src/components/FooterBars.tsx
import { useMapStore } from "../hooks/useMapStore";

export default function FooterBars() {
  const { zoom, scaleText } = useMapStore();
  const safeZoom = typeof zoom === "number" ? zoom : 0;
  return (
    <>
      {/* kiri bawah – versi */}
      <div className="infochip">2025 © Rafly lagi ngetes gaiissss</div>

      {/* kanan bawah – scale & tombol biru */}
      <div className="footerbar">
        <div className="scale">
          <span>{Math.round(safeZoom)}z</span>
          <span>{scaleText}</span>
        </div>
      </div>
    </>
  );
}
