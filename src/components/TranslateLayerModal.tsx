import React, { useEffect, useRef } from "react";

type ToolbarPosition = {
  x: number;
  y: number;
};

interface TranslateLayerModalProps {
  position: ToolbarPosition;
  layerName?: string;
  featureCount?: number;
  isDirty: boolean;
  isSaving: boolean;
  isOpen: boolean;
  onFinish: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const TranslateLayerModal: React.FC<TranslateLayerModalProps> = ({
  position,
  layerName,
  featureCount,
  isDirty,
  isSaving,
  onFinish,
  onSave,
  onCancel,
}) => {
  const finishButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus first action for keyboard navigation when toolbar appears
    finishButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!isSaving) {
          onSave();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onCancel, onSave]);

  const statusText = isDirty
    ? "Perubahan belum disimpan"
    : "Tidak ada perubahan";

  return (
    <div
      role="region"
      aria-label="Translate layer controls"
      aria-live="polite"
      tabIndex={0}
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 2600,
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        backdropFilter: "blur(10px)",
        borderRadius: "14px",
        padding: "14px 18px",
        boxShadow: "0 22px 45px rgba(15, 23, 42, 0.18)",
        display: "flex",
        alignItems: "center",
        gap: "18px",
        border: "1px solid rgba(148, 163, 184, 0.35)",
        minWidth: "280px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            fontWeight: 600,
            color: "#0f172a",
            lineHeight: 1.3,
          }}
        >
          <span
            className="icon"
            aria-hidden="true"
            style={{ color: "#6366f1", fontSize: "18px" }}
          >
            layers
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {layerName || "Layer"} ({featureCount || 0} fitur)
          </span>
        </div>
        <span
          id="translate-layer-status"
          style={{
            fontSize: "12px",
            color: isDirty ? "#b91c1c" : "#64748b",
          }}
        >
          {statusText}
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "#6b7280",
            display: "flex",
            gap: "6px",
            alignItems: "center",
          }}
        >
          <span aria-hidden="true">
            Drag fitur untuk memindahkan seluruh layer
          </span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "6px",
              backgroundColor: "rgba(99, 102, 241, 0.12)",
              color: "#6366f1",
              fontSize: "11px",
            }}
          >
            Enter = Simpan, Esc = Batal
          </span>
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <button
          ref={finishButtonRef}
          type="button"
          onClick={onFinish}
          disabled={isSaving}
          title="Batalkan perubahan dan keluar dari mode geser layer (Esc)"
          style={{
            border: "1px solid #6366f1",
            backgroundColor: "white",
            color: "#6366f1",
            borderRadius: "10px",
            padding: "8px 14px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: isSaving ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          Batal
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || !isDirty}
          title="Simpan perubahan ke server (Enter)"
          style={{
            border: "none",
            backgroundColor: isSaving
              ? "#9ca3af"
              : isDirty
              ? "#6366f1"
              : "#6b7280",
            color: "white",
            borderRadius: "10px",
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: isSaving || !isDirty ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            opacity: isSaving ? 0.7 : 1,
          }}
        >
          <span className="icon" aria-hidden="true">
            save
          </span>
          {isSaving ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </div>
  );
};

export default TranslateLayerModal;
