export type SafeImageMetadata = {
  type: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
};

const INVALID_IMAGE_MESSAGE = 'Envie uma imagem JPG, PNG ou WEBP.';
export const SAFE_IMAGE_MAX_DIMENSION = 8192;
export const SAFE_IMAGE_MAX_PIXELS = 40_000_000;
const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function invalidImage(): never {
  throw new Error(INVALID_IMAGE_MESSAGE);
}

function positiveDimensions(type: SafeImageMetadata['type'], width: number, height: number): SafeImageMetadata {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return invalidImage();
  }
  return { type, width, height };
}

function parsePng(buffer: Buffer): SafeImageMetadata | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return null;
  }
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return invalidImage();
  }
  return positiveDimensions('png', buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function parseJpeg(buffer: Buffer): SafeImageMetadata | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  let segmentsRead = 0;
  while (offset < buffer.length && segmentsRead < 1024) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;

    const marker = buffer[offset];
    offset += 1;
    segmentsRead += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) break;
      return positiveDimensions('jpg', buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }

    offset += segmentLength;
  }

  return invalidImage();
}

function parseWebp(buffer: Buffer): SafeImageMetadata | null {
  if (
    buffer.length < 21
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const declaredSize = buffer.readUInt32LE(4) + 8;
  if (declaredSize > buffer.length || declaredSize < 20) {
    return invalidImage();
  }

  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType === 'VP8X' && buffer.length >= 30) {
    return positiveDimensions('webp', buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1);
  }

  if (
    chunkType === 'VP8 '
    && buffer.length >= 30
    && buffer[23] === 0x9d
    && buffer[24] === 0x01
    && buffer[25] === 0x2a
  ) {
    return positiveDimensions('webp', buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }

  if (chunkType === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const dimensions = buffer.readUInt32LE(21);
    return positiveDimensions('webp', (dimensions & 0x3fff) + 1, ((dimensions >>> 14) & 0x3fff) + 1);
  }

  return invalidImage();
}

export function parseSafeImageMetadata(buffer: Buffer): SafeImageMetadata {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return invalidImage();
  }

  return parsePng(buffer) ?? parseJpeg(buffer) ?? parseWebp(buffer) ?? invalidImage();
}

export function imageDimensionsAreSafe(metadata: SafeImageMetadata, minimumDimension = 80): boolean {
  return metadata.width >= minimumDimension
    && metadata.height >= minimumDimension
    && metadata.width <= SAFE_IMAGE_MAX_DIMENSION
    && metadata.height <= SAFE_IMAGE_MAX_DIMENSION
    && metadata.width * metadata.height <= SAFE_IMAGE_MAX_PIXELS;
}
