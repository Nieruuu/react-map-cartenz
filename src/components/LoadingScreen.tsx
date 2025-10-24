// src/components/LoadingScreen.tsx
import { useEffect } from "react";
import { useAppLoading } from "../hooks/useLoadingState";

export default function LoadingScreen() {
  const { isLoading, loadingMessage, loadingProgress, error } = useAppLoading();

  // Auto-hide loading screen when not loading
  useEffect(() => {
    if (!isLoading && !error) {
      const timer = setTimeout(() => {
        // Additional cleanup if needed
      }, 300); // Wait for transition to complete
      return () => clearTimeout(timer);
    }
  }, [isLoading, error]);

  if (!isLoading && !error) {
    return null;
  }

  return (
    <div
      className={`loading-screen ${!isLoading && error ? "error" : ""}`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background:
          "linear-gradient(135deg, #1e40af 0%, #1e56ce 50%, #0ea5e9 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: !isLoading && error ? 0.95 : 1,
        transition: "opacity 0.3s ease-in-out",
      }}
    >
      {/* Logo and Title */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <img
          src="/smart-gov-revenue-small.png"
          alt="SmartGov Revenue"
          style={{
            width: "80px",
            height: "120px",
            marginBottom: "16px",
            filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))",
          }}
        />
        <h1
          style={{
            color: "#ffffff",
            fontSize: "28px",
            fontWeight: "600",
            margin: "0 0 8px 0",
            textShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
          }}
        >
          Taxation Map
        </h1>
        <p
          style={{
            color: "rgba(255, 255, 255, 0.9)",
            fontSize: "16px",
            margin: 0,
            fontWeight: "400",
          }}
        >
          Sistem informasi pemetaan SmartGov Retribusi
        </p>
      </div>

      {/* Loading Content */}
      {isLoading && (
        <div
          style={{
            width: "300px",
            textAlign: "center",
            animation: "fadeInUp 0.6s ease-out",
          }}
        >
          {/* Loading Spinner */}
          <div
            style={{
              width: "60px",
              height: "60px",
              margin: "0 auto 24px auto",
              border: "4px solid rgba(255, 255, 255, 0.2)",
              borderTop: "4px solid #ffffff",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />

          {/* Loading Message */}
          <p
            style={{
              color: "#ffffff",
              fontSize: "18px",
              fontWeight: "500",
              margin: "0 0 16px 0",
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.3)",
            }}
          >
            {loadingMessage || "Memuat peta..."}
          </p>

          {/* Progress Bar */}
          <div
            style={{
              width: "100%",
              height: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              borderRadius: "3px",
              overflow: "hidden",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                height: "100%",
                backgroundColor: "#ffffff",
                borderRadius: "3px",
                width: `${loadingProgress}%`,
                transition: "width 0.3s ease-in-out",
                boxShadow: "0 0 10px rgba(255, 255, 255, 0.5)",
              }}
            />
          </div>

          {/* Progress Text */}
          <p
            style={{
              color: "rgba(255, 255, 255, 0.8)",
              fontSize: "14px",
              margin: 0,
            }}
          >
            {loadingProgress > 0
              ? `${loadingProgress}%`
              : "Menghubungkan ke server..."}
          </p>
        </div>
      )}

      {/* Error Content */}
      {error && (
        <div
          style={{
            width: "350px",
            textAlign: "center",
            animation: "fadeInUp 0.6s ease-out",
          }}
        >
          {/* Error Icon */}
          <div
            style={{
              width: "60px",
              height: "60px",
              margin: "0 auto 24px auto",
              backgroundColor: "rgba(239, 68, 68, 0.2)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "Material Symbols Rounded",
                fontSize: "32px",
                color: "#ffffff",
              }}
            >
              error
            </span>
          </div>

          {/* Error Message */}
          <h2
            style={{
              color: "#ffffff",
              fontSize: "20px",
              fontWeight: "600",
              margin: "0 0 12px 0",
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.3)",
            }}
          >
            Terjadi Kesalahan
          </h2>

          <p
            style={{
              color: "rgba(255, 255, 255, 0.9)",
              fontSize: "16px",
              lineHeight: "1.5",
              margin: "0 0 24px 0",
            }}
          >
            {error}
          </p>

          {/* Retry Button */}
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: "#ffffff",
              color: "#1e40af",
              border: "none",
              borderRadius: "8px",
              padding: "12px 24px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.3)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
            }}
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Loading Animation Styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .loading-screen {
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
