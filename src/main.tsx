import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/ui.css";
import App from "./App.tsx";
import { auth } from "./lib/api/auth";

async function bootstrap() {
  try {
    await auth.initializeAuth();
  } catch (error) {
    console.error("Failed to initialize authentication:", error);
  }

  createRoot(document.getElementById("tax-map")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
