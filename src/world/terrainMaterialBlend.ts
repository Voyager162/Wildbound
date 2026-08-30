export interface TerrainMaterialPixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

// A single accumulator is reset and reused for every terrain pixel. This avoids per-pixel
// objects while allowing every continuous material field to contribute; selecting only the
// strongest two creates a visible contour whenever the second- and third-place fields swap.
export const accumulateTerrainMaterial = (
  accumulator: Float64Array,
  material: TerrainMaterialPixels | null,
  weight: number,
  worldPixelX: number,
  worldPixelY: number
): void => {
  if (!material || weight <= 0.001) {
    return;
  }
  const materialX = ((worldPixelX % material.width) + material.width) % material.width;
  const materialY = ((worldPixelY % material.height) + material.height) % material.height;
  const pixel = (materialY * material.width + materialX) * 4;
  accumulator[0] += material.pixels[pixel] * weight;
  accumulator[1] += material.pixels[pixel + 1] * weight;
  accumulator[2] += material.pixels[pixel + 2] * weight;
  accumulator[3] += weight;
};
