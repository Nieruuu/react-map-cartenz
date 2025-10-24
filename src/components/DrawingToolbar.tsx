import React, { useEffect } from "react";

interface DrawingToolbarProps {
  onDone: () => void;
  onCancel: () => void;
  featureCount: number;
  isLoading: boolean;
  isMultiMode: boolean;
}

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  onDone,
  onCancel,
  featureCount,
  isLoading,
  isMultiMode,
}) => {
  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onDone();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDone, onCancel]);

  return (
    <div
      style={{
        position: "fixed",
        top: "150px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2000,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(8px)",
        borderRadius: "12px",
        padding: "12px 20px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        transition: "all 0.2s ease-in-out",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: "500",
          color: "#374151",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span className="icon" style={{ color: "#0ea5e9" }}>
          edit
        </span>
        <span>
          {featureCount === 0
            ? "Mulai menggambar polygon..."
            : isMultiMode
            ? `${featureCount === 1 ? "1 polygon" : `${featureCount} polygon`} akan digabung menjadi 1 MultiPolygon`
            : featureCount === 1
            ? "1 polygon digambar"
            : `${featureCount} polygon digambar`}
        </span>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          onClick={onDone}
          disabled={featureCount === 0 || isLoading}
          style={{
            backgroundColor: isLoading ? "#9ca3af" : "#10b981",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: featureCount === 0 || isLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.2s ease",
            opacity: featureCount === 0 || isLoading ? 0.6 : 1,
          }}
          title="Selesai dan simpan ke server (Enter)"
        >
          <span className="icon">check</span>
          {isLoading ? "Menyimpan..." : "Selesai"}
        </button>

        <button
          onClick={onCancel}
          disabled={isLoading}
          style={{
            backgroundColor: isLoading ? "#9ca3af" : "#ef4444",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: isLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.2s ease",
            opacity: isLoading ? 0.6 : 1,
          }}
          title="Batalkan gambar (Escape)"
        >
          <span className="icon">close</span>
          Batal
        </button>
      </div>

      <div
        style={{
          fontSize: "12px",
          color: "#6b7280",
          fontStyle: "italic",
        }}
      >
        <span>Enter: Selesai</span> • <span>Esc: Batal</span>
      </div>
    </div>
  );
};

export default DrawingToolbar;
