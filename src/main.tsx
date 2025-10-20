import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/ui.css";
import App from "./App.tsx";
import { auth } from "./lib/api/auth";

// Initialize authentication system on app startup
auth.initializeAuth().catch(console.error);

createRoot(document.getElementById("tax-map")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
