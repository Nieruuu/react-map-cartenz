import { useEffect } from "react";

interface LayerDeleteConfirmationModalProps {
  open: boolean;
  layerLabel: string;
  featureCount?: number;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LayerDeleteConfirmationModal({
  open,
  layerLabel,
  featureCount,
  isDeleting = false,
  onCancel,
  onConfirm,
}: LayerDeleteConfirmationModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-layer-title"
      aria-describedby="delete-layer-description"
      style={{ zIndex: 15000 }}
      onClick={() => {
        if (!isDeleting) {
          onCancel();
        }
      }}
    >
      <div
        className="modal-panel"
        style={{ maxWidth: 420 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className="icon"
            aria-hidden="true"
            style={{
              color: "#dc2626",
              backgroundColor: "rgba(252, 165, 165, 0.2)",
              borderRadius: "50%",
              padding: 8,
              fontSize: 28,
            }}
          >
            warning
          </span>
          <div>
            <h2
              id="delete-layer-title"
              style={{
                fontSize: 20,
                margin: 0,
                color: "#0f172a",
              }}
            >
              Hapus layer?
            </h2>
            <p
              id="delete-layer-description"
              style={{
                margin: "4px 0 0",
                color: "#475569",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              Layer <strong>{layerLabel}</strong>{" "}
              {typeof featureCount === "number"
                ? `(${featureCount} fitur)`
                : ""}{" "}
              akan dihapus permanen dari server dan peta.
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(248, 113, 113, 0.35)",
            background: "rgba(254, 226, 226, 0.35)",
            color: "#b91c1c",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          Tindakan ini tidak dapat dibatalkan. Semua fitur dalam layer ini akan
          hilang dan tidak dapat dipulihkan.
        </div>

        <div
          className="row end"
          style={{ marginTop: 20, justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              minWidth: 120,
              backgroundColor: "#dc2626",
              borderColor: "#fca5a5",
              color: "#fff",
            }}
          >
            {isDeleting ? "Menghapus..." : "Hapus layer"}
          </button>
        </div>
      </div>
    </div>
  );
}
