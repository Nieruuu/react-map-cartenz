import shpwrite from "shp-write";

const fc = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: 1, name: "Test Multi" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [110.0, -7.0],
              [110.1, -7.0],
              [110.1, -7.1],
              [110.0, -7.1],
              [110.0, -7.0]
            ]
          ],
          [
            [
              [110.2, -7.0],
              [110.3, -7.0],
              [110.3, -7.1],
              [110.2, -7.1],
              [110.2, -7.0]
            ]
          ]
        ]
      }
    }
  ]
};

const zipBuffer = shpwrite.zip(fc);
console.log('zipBuffer keys:', Object.keys(zipBuffer));
console.log('instanceof Uint8Array:', zipBuffer instanceof Uint8Array);
console.log('constructor:', zipBuffer?.constructor?.name);
console.log('length:', zipBuffer?.length);
console.log('byteLength:', zipBuffer?.byteLength);
if (zipBuffer && typeof zipBuffer.then === 'function') {
  console.log('zipBuffer is Promise');
  const resolved = await zipBuffer;
  console.log('resolved type:', resolved?.constructor?.name);
}
