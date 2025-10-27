import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SpatialFeatureAttribute } from "../lib/api/spatialFeature";

type ModalPosition = {
  x: number;
  y: number;
};

interface VertexEditingModalProps {
  isOpen: boolean;
  position: ModalPosition;
  featureName?: string;
  featureId?: number;
  isDirty: boolean;
  isSaving: boolean;
  onFinish: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const VertexEditingModal: React.FC<VertexEditingModalProps> = ({
  isOpen,
  position,
  featureName,
  featureId,
  isDirty,
  isSaving,
  onFinish,
  onSave,
  onCancel,
}) => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<"finish" | "save" | null>(
    null
  );
  const finishButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const confirmYesButtonRef = useRef<HTMLButtonElement>(null);
  const confirmNoButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management when modal opens
  useEffect(() => {
    if (isOpen) {
      finishButtonRef.current?.focus();
    }
  }, [isOpen]);

  // Keyboard navigation for main modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (showConfirmDialog) return; // Let confirm dialog handle its own keys

      if (event.key === "Enter") {
        event.preventDefault();
        if (!isSaving && isDirty) {
          handleSaveClick();
        } else if (!isSaving) {
          handleFinishClick();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (!isSaving) {
          handleFinishClick();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, isDirty, showConfirmDialog]);

  // Keyboard navigation for confirmation dialog
  useEffect(() => {
    if (!showConfirmDialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleConfirmYes();
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleConfirmNo();
      } else if (event.key === "Tab") {
        const dialog = confirmDialogRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirmDialog]);

  // Focus management for confirmation dialog
  useEffect(() => {
    if (showConfirmDialog) {
      const timer = setTimeout(() => {
        confirmYesButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showConfirmDialog]);

  const handleFinishClick = () => {
    if (isDirty) {
      setPendingAction("finish");
      setShowConfirmDialog(true);
    } else {
      onFinish();
    }
  };

  const handleSaveClick = () => {
    if (isDirty) {
      setPendingAction("save");
      setShowConfirmDialog(true);
    }
  };

  const handleConfirmYes = async () => {
    if (!pendingAction) return;

    setShowConfirmDialog(false);

    if (pendingAction === "save") {
      await onSave();
    } else if (pendingAction === "finish") {
      onFinish();
    }

    setPendingAction(null);
  };

  const handleConfirmNo = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
    // Return focus to the appropriate button
    if (pendingAction === "save") {
      saveButtonRef.current?.focus();
    } else if (pendingAction === "finish") {
      finishButtonRef.current?.focus();
    }
  };

  const handleBackdropClick = () => {
    if (isSaving || showConfirmDialog) return;
    handleFinishClick();
  };

  const handleConfirmBackdropClick = () => {
    if (isSaving) return;
    handleConfirmNo();
  };

  const statusText = isDirty
    ? "Perubahan belum disimpan"
    : "Tidak ada perubahan";

  if (!isOpen) return null;

  const modalContent = (
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
        transition: "all 0.2s ease-in-out",
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
            {featureName || `Editing feature #${featureId || "?"}`}
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
            Enter = Simpan, Esc = Selesai
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
          onClick={handleFinishClick}
          disabled={isSaving}
          title="Keluar dari mode edit (Esc)"
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
          Selesai
        </button>

        <button
          ref={saveButtonRef}
          type="button"
          onClick={handleSaveClick}
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

  const confirmDialog = showConfirmDialog ? (
    <div
      onClick={handleConfirmBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2700,
        animation: "fadeIn 0.18s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        ref={confirmDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(90%, 380px)",
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 24px 48px rgba(15,23,42,0.32)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          animation: "slideUp 0.22s ease-out",
        }}
      >
        <div
          id="confirm-title"
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "#111827",
          }}
        >
          Konfirmasi Aksi
        </div>
        <p
          id="confirm-description"
          style={{
            margin: 0,
            fontSize: "14px",
            lineHeight: 1.6,
            color: "#4b5563",
          }}
        >
          {pendingAction === "save"
            ? "Apakah kamu yakin ingin mengubah?"
            : "Apakah kamu yakin ingin keluar tanpa menyimpan perubahan?"}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            marginTop: "8px",
          }}
        >
          <button
            ref={confirmNoButtonRef}
            type="button"
            onClick={handleConfirmNo}
            disabled={isSaving}
            style={{
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: isSaving ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            Tidak
          </button>
          <button
            ref={confirmYesButtonRef}
            type="button"
            onClick={handleConfirmYes}
            disabled={isSaving}
            style={{
              border: "none",
              background: isSaving ? "#9ca3af" : "#10b981",
              color: "#ffffff",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: isSaving ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 10px 20px rgba(16, 185, 129, 0.25)",
              opacity: isSaving ? 0.85 : 1,
            }}
          >
            <span className="icon" aria-hidden="true">
              {pendingAction === "save" ? "save" : "check"}
            </span>
            {isSaving ? "Memproses..." : pendingAction === "save" ? "Ya" : "Ya"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {createPortal(modalContent, document.body)}
      {createPortal(confirmDialog, document.body)}
    </>
  );
};

export default VertexEditingModal;
