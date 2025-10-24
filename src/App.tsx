// src/App.tsx
import Topbar from "./components/Topbar";
import LeftDock from "./components/LeftDock";
import RightDock from "./components/RightDock";
import FooterBars from "./components/FooterBars";
import TaxMap from "./components/TaxMap";
import FocusCard from "./components/FocusCard";
import LoadingScreen from "./components/LoadingScreen";
import "./styles/ui.css";

export default function App() {
  return (
    <div className="app">
      <LoadingScreen />
      <Topbar />
      <div className="content">
        <div className="mapwrap">
          <TaxMap />
        </div>
        {/* floating panels */}
        <LeftDock />
        <RightDock />
        <FooterBars />
        <FocusCard />
        {/* floating panels */}
      </div>
    </div>
  );
}
