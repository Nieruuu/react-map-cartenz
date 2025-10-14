declare module '@crmackey/shp-write' {
  export type GeometryType =
    | 'POLYGON'
    | 'POLYLINE'
    | 'POINT'
    | 'MULTIPOLYGON'
    | 'MULTILINESTRING'
    | 'MULTIPOINT';

  export type ShpParts = {
    shp: ArrayBuffer | Uint8Array;
    shx: ArrayBuffer | Uint8Array;
    dbf: ArrayBuffer | Uint8Array;
    prj?: string;
  };

  // API minimal yang kita pakai (callback-style)
  export function write(
    rows: Record<string, any>[],
    geometryType: GeometryType,
    geometries: any[],
    cb: (err: any, parts: ShpParts) => void
  ): void;

  export function zip(
    rows: Record<string, any>[],
    geometryType: GeometryType,
    geometries: any[],
    cb: (err: any, result: ArrayBuffer | Uint8Array | Blob) => void
  ): void;

  const _default: { write: typeof write; zip: typeof zip };
  export default _default;
}
