export const maxPhotoBytes = 1048576;
type Pixels = { width: number; height: number; data: Uint8Array };
type Codec = {
  decode: (
    bytes: Uint8Array,
    options: {
      useTArray: true;
      formatAsRGBA: true;
      tolerantDecoding: false;
      maxResolutionInMP: number;
      maxMemoryUsageInMB: number;
    },
  ) => Pixels;
  encode: (pixels: Pixels, quality: number) => { data: Uint8Array };
};
export function sanitizePhoto(bytes: Uint8Array, codec: Codec): Uint8Array {
  if (
    bytes.length < 4 ||
    bytes.length > maxPhotoBytes ||
    bytes[0] !== 255 ||
    bytes[1] !== 216
  )
    throw new Error("Invalid photo");
  // Bound dimensions from the JPEG frame before allocating decoder pixel buffers.
  let offset = 2;
  let found = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) throw new Error("Invalid photo");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (
      marker === undefined ||
      marker === 218 ||
      marker === 217 ||
      marker === 216
    )
      throw new Error("Invalid photo");
    const length = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length)
      throw new Error("Invalid photo");
    if (marker === 192 || marker === 193 || marker === 194) {
      const height = (bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0);
      const width = (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0);
      const components = bytes[offset + 7] ?? 0;
      if (
        ![1, 3].includes(components) ||
        length !== 8 + 3 * components ||
        bytes[offset + 2] !== 8 ||
        width < 1 ||
        height < 1 ||
        width > 1280 ||
        height > 1280
      )
        throw new Error("Invalid photo");
      found = true;
      break;
    }
    offset += length;
  }
  if (!found) throw new Error("Invalid photo");
  const decoded = codec.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    tolerantDecoding: false,
    maxResolutionInMP: 1.7,
    maxMemoryUsageInMB: 64,
  });
  if (
    decoded.width < 1 ||
    decoded.height < 1 ||
    decoded.width > 1280 ||
    decoded.height > 1280 ||
    decoded.data.length !== decoded.width * decoded.height * 4
  )
    throw new Error("Invalid photo");
  // Deliberately pass only pixels/dimensions: never forward EXIF, comments,
  // application segments or trailing bytes from the submitted JPEG.
  const output = codec.encode(
    { width: decoded.width, height: decoded.height, data: decoded.data },
    70,
  ).data;
  if (output.length < 4 || output.length > maxPhotoBytes)
    throw new Error("Invalid photo");
  return new Uint8Array(output);
}
