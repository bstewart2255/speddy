/**
 * Generate simple placeholder icons for the Speddy Chrome Extension
 * Uses pure JavaScript PNG generation (no native dependencies)
 * Run with: node generate-icons.js
 */

const fs = require('fs');
const zlib = require('zlib');

const sizes = [16, 48, 128];
const brandColor = { r: 37, g: 99, b: 235 }; // #2563eb

function crc32(data) {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcData = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function generatePNG(size) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr.writeUInt8(8, 8);         // bit depth
  ihdr.writeUInt8(2, 9);         // color type (RGB)
  ihdr.writeUInt8(0, 10);        // compression
  ihdr.writeUInt8(0, 11);        // filter
  ihdr.writeUInt8(0, 12);        // interlace

  // Generate image data (blue square with white "S")
  const rawData = [];
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.15;

  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte for each row
    for (let x = 0; x < size; x++) {
      // Check if we're in the rounded corner area
      let inCorner = false;
      const corners = [
        { cx: radius, cy: radius },
        { cx: size - radius, cy: radius },
        { cx: radius, cy: size - radius },
        { cx: size - radius, cy: size - radius }
      ];

      for (const corner of corners) {
        const inCornerArea = (
          (x < radius && y < radius) ||
          (x > size - radius && y < radius) ||
          (x < radius && y > size - radius) ||
          (x > size - radius && y > size - radius)
        );
        if (inCornerArea) {
          const dx = x - corner.cx;
          const dy = y - corner.cy;
          if (dx * dx + dy * dy > radius * radius) {
            inCorner = true;
            break;
          }
        }
      }

      // Simple "S" shape detection (approximate)
      const isS = isInLetterS(x, y, size);

      if (inCorner) {
        // Transparent/white corner
        rawData.push(255, 255, 255);
      } else if (isS) {
        // White "S"
        rawData.push(255, 255, 255);
      } else {
        // Blue background
        rawData.push(brandColor.r, brandColor.g, brandColor.b);
      }
    }
  }

  // Compress image data
  const compressed = zlib.deflateSync(Buffer.from(rawData));

  // IDAT chunk
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    idat,
    iend
  ]);
}

function isInLetterS(x, y, size) {
  // Normalize coordinates to 0-1 range
  const nx = x / size;
  const ny = y / size;

  const strokeWidth = 0.12;
  const left = 0.30;
  const right = 0.70;
  const top = 0.20;
  const middle = 0.50;
  const bottom = 0.80;

  // Top horizontal bar
  if (ny >= top && ny <= top + strokeWidth && nx >= left && nx <= right) return true;

  // Middle horizontal bar
  if (ny >= middle - strokeWidth/2 && ny <= middle + strokeWidth/2 && nx >= left && nx <= right) return true;

  // Bottom horizontal bar
  if (ny >= bottom - strokeWidth && ny <= bottom && nx >= left && nx <= right) return true;

  // Top-left vertical (connects top to middle)
  if (nx >= left && nx <= left + strokeWidth && ny >= top && ny <= middle) return true;

  // Bottom-right vertical (connects middle to bottom)
  if (nx >= right - strokeWidth && nx <= right && ny >= middle && ny <= bottom) return true;

  return false;
}

// Generate icons
for (const size of sizes) {
  const png = generatePNG(size);
  fs.writeFileSync(`icon-${size}.png`, png);
  console.log(`Created icon-${size}.png (${size}x${size})`);
}

console.log('Done! Placeholder icons created.');
