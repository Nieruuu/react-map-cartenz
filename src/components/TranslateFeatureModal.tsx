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

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={modalRef}
        style={{
          position: "fixed",
          left: position.x,
          top: position.y,
          background: "#ffffff",
          border: "1px solid #d1d5db",
          borderRadius: "8px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
          padding: "16px",
          zIndex: 1000,
          minWidth: "280px",
          maxWidth: "320px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#111827",
          }}
        >
          Pindahkan Feature
        </div>

        <div
          style={{
            fontSize: "12px",
            color: "#6b7280",
            marginBottom: "16px",
            lineHeight: 1.4,
          }}
        >
          {featureName ? `Feature: ${featureName}` : "Feature tidak diketahui"}
          {featureId && <div style={{ marginTop: "4px" }}>ID: {featureId}</div>}
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
          }}
        >
          <button
            ref={finishButtonRef}
            type="button"
            onClick={onFinish}
            disabled={isSaving}
            style={{
              padding: "8px 16px",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              background: "#ffffff",
              color: "#374151",
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            Selesai
          </button>

          <button
            ref={saveButtonRef}
            type="button"
            onClick={handleSaveClick}
            disabled={!isDirty || isSaving}
            style={{
              padding: "8px 16px",
              fontSize: "12px",
              fontWeight: 500,
              border: "none",
              borderRadius: "6px",
              background: isDirty ? "#10b981" : "#d1d5db",
              color: "#ffffff",
              cursor: isDirty && !isSaving ? "pointer" : "not-allowed",
              opacity: isDirty && !isSaving ? 1 : 0.6,
            }}
          >
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
