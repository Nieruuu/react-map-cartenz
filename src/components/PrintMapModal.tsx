import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import Map from "ol/Map";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type { ProjectionLike } from "ol/proj";
import { useLayersStore } from "../hooks/useLayersStore";

type PrintMapModalProps = {
  open: boolean;
  onClose: () => void;
  onPrinted?: (fileName: string) => void;
  onError?: (message: string) => void;
};

type PaperFormat = "a4" | "a3";
type Orientation = "portrait" | "landscape";

const PAPER_DIMENSIONS_MM: Record<
  PaperFormat,
  Record<Orientation, [number, number]>
> = {
  a4: {
    portrait: [210, 297],
    landscape: [297, 210],
  },
  a3: {
    portrait: [297, 420],
    landscape: [420, 297],
  },
};

const DEFAULT_DPI = 150;
const MM_TO_INCH = 25.4;

const mmToPixels = (mm: number, dpi: number) =>
  Math.round((mm * dpi) / MM_TO_INCH);

const formatTimestamp = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}_${pad(date.getHours())}${pad(date.getMinutes())}`;
};

const extentIsValid = (extent: number[]) =>
  extent.length === 4 &&
  extent.every((value) => Number.isFinite(value)) &&
  extent[0] !== extent[2] &&
  extent[1] !== extent[3];

const cloneFeatures = (features: Feature<Geometry>[]) =>
  features.map((feature) => feature.clone());

export default function PrintMapModal({
  open,
  onClose,
  onPrinted,
  onError,
}: PrintMapModalProps) {
  const { layers, map } = useLayersStore();
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [paperFormat, setPaperFormat] = useState<PaperFormat>("a4");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printableLayers = useMemo(
    () =>
      layers.map((entry) => ({
        id: entry.id,
        name: entry.name,
        visible: entry.visible,
        kind: entry.kind,
        featureCount:
          entry.layer.getSource()?.getFeatures()?.length ?? undefined,
        entry,
      })),
    [layers]
  );

  useEffect(() => {
    if (!open) return;

    window.dispatchEvent(
      new CustomEvent("open-modal", { detail: { modal: "PrintMapModal" } })
    );
    setError(null);

    const defaultLayer =
      printableLayers.find((item) => item.visible) ?? printableLayers[0];
    setSelectedLayerId(defaultLayer?.id ?? null);
  }, [open, printableLayers]);

  const selectedLayer = useMemo(
    () => printableLayers.find((item) => item.id === selectedLayerId) ?? null,
    [printableLayers, selectedLayerId]
  );

  const handlePrint = async () => {
    if (!selectedLayer) {
      setError("Pilih layer yang ingin dicetak.");
      return;
    }

    const originalLayer = selectedLayer.entry.layer;
    const originalSource = originalLayer.getSource();

    if (!originalSource) {
      const message = "Layer tidak memiliki sumber data yang valid.";
      setError(message);
      onError?.(message);
      return;
    }

    const features = originalSource.getFeatures();
    if (!features || features.length === 0) {
      const message = "Layer tidak memiliki fitur untuk dicetak.";
      setError(message);
      onError?.(message);
      return;
    }

    const extent = originalSource.getExtent();
    if (!extentIsValid(extent)) {
      const message = "Tidak dapat menentukan batas layer untuk dicetak.";
      setError(message);
      onError?.(message);
      return;
    }

    setIsPrinting(true);
    setError(null);

    const dimsMm = PAPER_DIMENSIONS_MM[paperFormat][orientation];
    const pixelWidth = mmToPixels(dimsMm[0], DEFAULT_DPI);
    const pixelHeight = mmToPixels(dimsMm[1], DEFAULT_DPI);

    const clonedFeatures = cloneFeatures(features);
    const printSource = new VectorSource({
      features: clonedFeatures,
    });

    const styleFn = originalLayer.getStyleFunction();
    const styleValue = originalLayer.getStyle() ?? undefined;
    const printLayer = new VectorLayer({
      source: printSource,
      style: styleFn ?? styleValue,
    });

    const projection: ProjectionLike =
      map?.getView()?.getProjection() ?? "EPSG:3857";

    const tempContainer = document.createElement("div");
    tempContainer.className = "print-map-offscreen";
    tempContainer.style.width = `${pixelWidth}px`;
    tempContainer.style.height = `${pixelHeight}px`;
    document.body.appendChild(tempContainer);

    const printMap = new Map({
      target: tempContainer,
      layers: [printLayer],
      view: new View({
        projection,
        center: [0, 0],
        zoom: 2,
      }),
      controls: [],
      interactions: [],
    });

    printMap.getViewport().style.background = "#ffffff";
    printMap.setSize([pixelWidth, pixelHeight]);
      printMap.getView().fit(extent, {
        size: [pixelWidth, pixelHeight],
        padding: [
          pixelHeight * 0.08,
          pixelWidth * 0.08,
          pixelHeight * 0.08,
          pixelWidth * 0.08,
        ],
        nearest: false,
      });

    try {
      const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
        printMap.once("rendercomplete", () => {
          try {
            const layerCanvas = tempContainer.querySelector(
              "canvas"
            ) as HTMLCanvasElement | null;
            if (!layerCanvas) {
              throw new Error("Canvas hasil render tidak ditemukan.");
            }
            const exportCanvas = document.createElement("canvas");
            exportCanvas.width = pixelWidth;
            exportCanvas.height = pixelHeight;
            const context = exportCanvas.getContext("2d");
            if (!context) {
              throw new Error("Context canvas tidak tersedia.");
            }
            context.drawImage(layerCanvas, 0, 0);
            resolve(exportCanvas);
          } catch (err) {
            reject(err);
          }
        });
        printMap.renderSync();
      });

      const pdf = new jsPDF(orientation, undefined, paperFormat);
      const dataUrl = canvas.toDataURL("image/png");
      pdf.addImage(dataUrl, "PNG", 0, 0, dimsMm[0], dimsMm[1]);
      const filename = `peta-${selectedLayer.name.replace(
        /\s+/g,
        "-"
      )}-${formatTimestamp(new Date())}.pdf`;
      pdf.save(filename);
      onPrinted?.(filename);
      onClose();
    } catch (err) {
      console.error("Gagal mencetak peta:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyiapkan PDF.";
      setError(message);
      onError?.(message);
    } finally {
      printMap.setTarget(undefined);
      printMap.dispose();
      document.body.removeChild(tempContainer);
      setIsPrinting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="print-modal-backdrop" onClick={onClose}>
      <div
        className="print-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="print-modal__header">
          <div>
            <h2>Cetak Layer ke PDF</h2>
            <p>
              Pilih satu layer untuk dicetak sebagai PDF tanpa latar peta.
              Resolusi tetap pada 150 dpi agar ukuran file stabil.
            </p>
          </div>
          <button
            onClick={onClose}
            className="circle ghost"
            title="Tutup"
            disabled={isPrinting}
          >
            <span className="icon">close</span>
          </button>
        </header>

        <div className="print-modal__body">
          <section className="print-modal__section">
            <h3>Layer yang tersedia</h3>
            {printableLayers.length === 0 ? (
              <div className="print-modal__empty">
                Tidak ada layer vektor yang siap dicetak.
              </div>
            ) : (
              <label className="print-modal__field">
                <span>Pilih layer</span>
                <select
                  value={selectedLayerId ?? ""}
                  onChange={(event) =>
                    setSelectedLayerId(
                      event.target.value ? event.target.value : null
                    )
                  }
                  disabled={isPrinting}
                >
                  <option value="" disabled>
                    -- pilih layer --
                  </option>
                  {printableLayers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name} ({layer.featureCount ?? 0} fitur)
                    </option>
                  ))}
                </select>
                {selectedLayer && (
                  <div className="print-modal__hint">
                    Layer {selectedLayer.name} berisi{" "}
                    {selectedLayer.featureCount ?? 0} fitur. Status di peta
                    sekarang:{" "}
                    {selectedLayer.visible ? "ditampilkan" : "disembunyikan"}{" "}
                    (tidak mempengaruhi hasil PDF).
                  </div>
                )}
              </label>
            )}
          </section>

          <section className="print-modal__section">
            <h3>Pengaturan Cetak</h3>
            <div className="print-modal__grid">
              <label className="print-modal__field">
                <span>Format kertas</span>
                <select
                  value={paperFormat}
                  onChange={(event) =>
                    setPaperFormat(event.target.value as PaperFormat)
                  }
                  disabled={isPrinting}
                >
                  <option value="a4">A4 (210 x 297 mm)</option>
                  <option value="a3">A3 (297 x 420 mm)</option>
                </select>
              </label>
              <label className="print-modal__field">
                <span>Orientasi</span>
                <select
                  value={orientation}
                  onChange={(event) =>
                    setOrientation(event.target.value as Orientation)
                  }
                  disabled={isPrinting}
                >
                  <option value="portrait">Potret</option>
                  <option value="landscape">Lanskap</option>
                </select>
              </label>
            </div>
          </section>

          {error && <div className="print-modal__error">{error}</div>}
        </div>

        <footer className="print-modal__footer">
          <button
            className="btn ghost"
            onClick={onClose}
            disabled={isPrinting}
          >
            <span className="icon">close</span> Batal
          </button>
          <button
            className="btn primary"
            onClick={handlePrint}
            disabled={isPrinting || !selectedLayerId}
          >
            <span className="icon">
              {isPrinting ? "hourglass_bottom" : "picture_as_pdf"}
            </span>{" "}
            {isPrinting ? "Menyiapkan PDF..." : "Cetak PDF"}
          </button>
        </footer>
      </div>
    </div>
  );
}
