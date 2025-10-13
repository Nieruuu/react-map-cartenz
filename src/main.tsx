import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/ui.css";
import App from "./App.tsx";

createRoot(document.getElementById("tax-map")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
