import React, { useEffect, useRef } from "react";

type ToolbarPosition = {
  x: number;
  y: number;
};

interface VertexEditingToolbarProps {
  position: ToolbarPosition;
  featureName?: string;
  isDirty: boolean;
  isSaving: boolean;
  onFinish: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const VertexEditingToolbar: React.FC<VertexEditingToolbarProps> = ({
  position,
  featureName,
  isDirty,
  isSaving,
  onFinish,
  onSave,
  onCancel,
}) => {
  const finishButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus the first action for keyboard navigation when the toolbar appears
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
      aria-label="Vertex editing controls"
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
            style={{ color: "#0ea5e9", fontSize: "18px" }}
          >
            timeline
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {featureName || "Editing feature"}
          </span>
        </div>
        <span
          id="vertex-edit-status"
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
          <span aria-hidden="true">Drag vertex untuk mengubah bentuk</span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "6px",
              backgroundColor: "rgba(14, 165, 233, 0.12)",
              color: "#0ea5e9",
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
          title="Batalkan perubahan dan keluar dari mode edit (Esc)"
          style={{
            border: "1px solid #0ea5e9",
            backgroundColor: "white",
            color: "#0ea5e9",
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
          ref={saveButtonRef}
          type="button"
          onClick={onSave}
          disabled={isSaving || !isDirty}
          title="Simpan perubahan ke server (Enter)"
          style={{
            border: "none",
            backgroundColor: isSaving
              ? "#9ca3af"
              : isDirty
              ? "#10b981"
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

export default VertexEditingToolbar;
