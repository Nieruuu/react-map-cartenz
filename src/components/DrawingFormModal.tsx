import React, { useState, useEffect } from "react";

interface FormData {
  layerType: string;
  regionName: string;
}

interface DrawingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: FormData[]) => void;
  featureCount: number;
  isLoading: boolean;
  // New props for simplified mode
  targetLayer?: {
    id: string;
    name: string;
    typeCode: string;
  } | null;
}

const DrawingFormModal: React.FC<DrawingFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  featureCount,
  isLoading,
  targetLayer,
}) => {
  const [formData, setFormData] = useState<FormData[]>(
    Array.from({ length: featureCount }, () => ({
      layerType: "",
      regionName: "",
    }))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Determine if we're in simplified mode (adding to existing layer)
  const isSimplifiedMode = !!targetLayer;

  // Initialize form data when feature count changes
  useEffect(() => {
    setFormData(
      Array.from({ length: featureCount }, (_, index) => ({
        layerType: formData[index]?.layerType || "",
        regionName: formData[index]?.regionName || "",
      }))
    );
  }, [featureCount]);

  // Pre-fill layer type in simplified mode
  useEffect(() => {
    if (isSimplifiedMode && targetLayer) {
      setFormData(
        Array.from({ length: featureCount }, (_, index) => ({
          layerType: targetLayer.typeCode || "",
          regionName: formData[index]?.regionName || "",
        }))
      );
    }
  }, [isSimplifiedMode, targetLayer, featureCount]);

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!isLoading) onClose();
      } else if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        if (!isLoading) handleSave();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isLoading]);

  const handleInputChange = (
    index: number,
    field: keyof FormData,
    value: string
  ) => {
    const newFormData = [...formData];
    newFormData[index] = { ...newFormData[index], [field]: value };
    setFormData(newFormData);

    // Clear error for this field if it exists
    if (errors[`${index}-${field}`]) {
      const newErrors = { ...errors };
      delete newErrors[`${index}-${field}`];
      setErrors(newErrors);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    formData.forEach((data, index) => {
      // In simplified mode, layer type is pre-filled and validated
      if (!isSimplifiedMode && !data.layerType.trim()) {
        newErrors[`${index}-layerType`] = "Nama Layer harus diisi";
      }
      if (!data.regionName.trim()) {
        newErrors[`${index}-regionName`] = "Nama Wilayah harus diisi";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setErrors({});
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.2s ease-in-out",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "600px",
          width: "90%",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          animation: "slideUp 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: "600",
              color: "#1f2937",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span className="icon" style={{ color: "#0ea5e9" }}>
              edit_note
            </span>
            {isSimplifiedMode ? "Tambah ke Layer" : "Informasi Polygon"}
          </h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              backgroundColor: "transparent",
              border: "none",
              fontSize: "24px",
              cursor: isLoading ? "not-allowed" : "pointer",
              color: "#6b7280",
              padding: "0",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "6px",
              transition: "all 0.2s ease",
            }}
            title="Tutup (Esc)"
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = "#f3f4f6";
                e.currentTarget.style.color = "#374151";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#6b7280";
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#6b7280",
              lineHeight: "1.5",
            }}
          >
            {isSimplifiedMode
              ? featureCount === 1
                ? "Tambahkan polygon ke layer yang dipilih. Hanya perlu mengisi nama wilayah:"
                : `Tambahkan ${featureCount} polygon ke layer yang dipilih. Hanya perlu mengisi nama wilayah:`
              : featureCount === 1
              ? "Lengkapi informasi untuk polygon yang telah digambar:"
              : `Lengkapi informasi untuk ${featureCount} polygon yang telah digambar:`}
          </p>
        </div>

        <div style={{ marginBottom: "24px" }}>
          {formData.map((data, index) => (
            <div
              key={index}
              style={{
                marginBottom: index < formData.length - 1 ? "20px" : "0",
                padding: "16px",
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#374151",
                }}
              >
                Polygon {index + 1}
              </h3>

              {/* Layer Type Field - Only show in normal mode */}
              {!isSimplifiedMode && (
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#374151",
                      marginBottom: "6px",
                    }}
                  >
                    Nama Layer/Tipe Layer{" "}
                    <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={data.layerType}
                    onChange={(e) =>
                      handleInputChange(index, "layerType", e.target.value)
                    }
                    disabled={isLoading}
                    placeholder="contoh: Kecamatan, Kelurahan, dll."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: errors[`${index}-layerType`]
                        ? "1px solid #ef4444"
                        : "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                      backgroundColor: isLoading ? "#f9fafb" : "white",
                      cursor: isLoading ? "not-allowed" : "text",
                      outline: "none",
                      transition: "border-color 0.2s ease",
                    }}
                    onFocus={(e) => {
                      if (!isLoading) {
                        e.target.style.borderColor = "#0ea5e9";
                      }
                    }}
                    onBlur={(e) => {
                      if (!isLoading) {
                        e.target.style.borderColor = errors[
                          `${index}-layerType`
                        ]
                          ? "#ef4444"
                          : "#d1d5db";
                      }
                    }}
                  />
                  {errors[`${index}-layerType`] && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#ef4444",
                        marginTop: "4px",
                      }}
                    >
                      {errors[`${index}-layerType`]}
                    </div>
                  )}
                </div>
              )}

              {/* Show selected layer info in simplified mode */}
              {isSimplifiedMode && targetLayer && (
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#374151",
                      marginBottom: "6px",
                    }}
                  >
                    Layer Tujuan
                  </label>
                  <div
                    style={{
                      padding: "8px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                      backgroundColor: "#f3f4f6",
                      color: "#6b7280",
                    }}
                  >
                    {targetLayer.name}
                  </div>
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#374151",
                    marginBottom: "6px",
                  }}
                >
                  Nama Wilayah <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={data.regionName}
                  onChange={(e) =>
                    handleInputChange(index, "regionName", e.target.value)
                  }
                  disabled={isLoading}
                  placeholder="contoh: Badung, Mengwi, dll."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: errors[`${index}-regionName`]
                      ? "1px solid #ef4444"
                      : "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "14px",
                    backgroundColor: isLoading ? "#f9fafb" : "white",
                    cursor: isLoading ? "not-allowed" : "text",
                    outline: "none",
                    transition: "border-color 0.2s ease",
                  }}
                  onFocus={(e) => {
                    if (!isLoading) {
                      e.target.style.borderColor = "#0ea5e9";
                    }
                  }}
                  onBlur={(e) => {
                    if (!isLoading) {
                      e.target.style.borderColor = errors[`${index}-regionName`]
                        ? "#ef4444"
                        : "#d1d5db";
                    }
                  }}
                />
                {errors[`${index}-regionName`] && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#ef4444",
                      marginTop: "4px",
                    }}
                  >
                    {errors[`${index}-regionName`]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            paddingTop: "16px",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              backgroundColor: "white",
              color: "#6b7280",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: isLoading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              opacity: isLoading ? 0.6 : 1,
            }}
            title="Batalkan (Esc)"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            style={{
              backgroundColor: isLoading ? "#9ca3af" : "#0ea5e9",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s ease",
              opacity: isLoading ? 0.6 : 1,
            }}
            title="Simpan ke server (Ctrl+Enter)"
          >
            <span className="icon">save</span>
            {isLoading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>

        <div
          style={{
            fontSize: "12px",
            color: "#6b7280",
            textAlign: "center",
            marginTop: "12px",
            fontStyle: "italic",
          }}
        >
          <span>Ctrl+Enter: Simpan</span> • <span>Esc: Batal</span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default DrawingFormModal;
