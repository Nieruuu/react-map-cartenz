import { useCallback, useEffect, useRef, useState } from "react";

interface TranslateFeatureModalProps {
  isOpen: boolean;
  position: { x: number; y: number };
  featureName: string;
  featureId?: number;
  isDirty: boolean;
  isSaving: boolean;
  onFinish: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function TranslateFeatureModal({
  isOpen,
  position,
  featureName,
  featureId,
  isDirty,
  isSaving,
  onFinish,
  onSave,
  onCancel,
}: TranslateFeatureModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const finishButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleConfirmSave = useCallback(() => {
    setShowConfirmDialog(false);
    onSave();
  }, [onSave]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!showConfirmDialog && !isSaving) {
          onCancel();
        } else if (showConfirmDialog && !isSaving) {
          setShowConfirmDialog(false);
        }
        return;
      }

      if (showConfirmDialog) {
        if (event.key === "Enter") {
          event.preventDefault();
          if (!isSaving) {
            handleConfirmSave();
          }
        } else if (event.key === "Tab") {
          const dialog = modalRef.current?.querySelector('[role="dialog"]');
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
      } else {
        // Handle tab navigation in main modal
        if (event.key === "Tab") {
          const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
            "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
          );
          if (!focusable || focusable.length === 0) return;

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
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, showConfirmDialog, isSaving, onCancel, handleConfirmSave]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (isDirty) {
          saveButtonRef.current?.focus();
        } else {
          finishButtonRef.current?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isDirty]);

  const handleSaveClick = () => {
    if (isDirty && !isSaving) {
      setShowConfirmDialog(true);
    }
  };

  const handleCancelSave = () => {
    setShowConfirmDialog(false);
  };

  const statusText = isDirty
    ? "Perubahan belum disimpan"
    : "Tidak ada perubahan";

  const featureLabel = featureName || "Feature";

  if (!isOpen) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Translate feature controls"
        aria-live="polite"
        tabIndex={0}
        ref={modalRef}
        style={{
          position: "fixed",
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 2600,
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(10px)",
          borderRadius: "16px",
          padding: "16px 22px",
          boxShadow: "0 22px 45px rgba(15, 23, 42, 0.18)",
          display: "flex",
          alignItems: "center",
          gap: "22px",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          minWidth: "340px",
          maxWidth: "520px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: 0,
            flex: 1,
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
              near_me
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {featureLabel}
              {featureId ? ` (#${featureId})` : ""}
            </span>
          </div>

          <span
            id="translate-feature-status"
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
              flexWrap: "wrap",
              rowGap: "4px",
            }}
          >
            <span aria-hidden="true">
              Drag feature untuk memindahkan posisinya
            </span>
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
            title="Batalkan perubahan dan keluar dari mode pindah feature (Esc)"
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
            onClick={handleSaveClick}
            disabled={!isDirty || isSaving}
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
              cursor: isDirty && !isSaving ? "pointer" : "not-allowed",
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

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSaving) {
              handleCancelSave();
            }
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            style={{
              background: "#ffffff",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              id="confirm-title"
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "12px",
                color: "#111827",
              }}
            >
              Konfirmasi Perubahan
            </div>

            <p
              id="confirm-description"
              style={{
                margin: 0,
                fontSize: "14px",
                lineHeight: 1.5,
                color: "#4b5563",
                marginBottom: "20px",
              }}
            >
              Apakah kamu yakin ingin mengubah?
            </p>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={handleCancelSave}
                disabled={isSaving}
                style={{
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: 500,
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  background: "#ffffff",
                  color: "#374151",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                Tidak
              </button>

              <button
                ref={saveButtonRef}
                type="button"
                onClick={handleConfirmSave}
                disabled={isSaving}
                style={{
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: 500,
                  border: "none",
                  borderRadius: "6px",
                  background: "#10b981",
                  color: "#ffffff",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {isSaving ? (
                  <>
                    <span
                      style={{
                        width: "14px",
                        height: "14px",
                        border: "2px solid #ffffff",
                        borderTop: "2px solid transparent",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    Menyimpan...
                  </>
                ) : (
                  "Ya"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
