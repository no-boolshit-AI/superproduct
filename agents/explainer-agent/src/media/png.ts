/** A minimal RGBA PNG encoder, for placeholder images (IMAGE_MOCK=1 and the tests): no browser, no FFmpeg. */
import zlib from "node:zlib";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: width × height × 4 bytes, row by row. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Width and height from a PNG's IHDR, or null when it isn't a PNG. */
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * A placeholder picture: a rounded block (the subject) with a darker outline, in a muted colour picked from the name,
 * on a transparent ground (cut-outs) or a paper ground.
 */
export function placeholderPng(width: number, height: number, seed: string, transparent: boolean): Buffer {
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hue = h % 360;
  const rgb = (l: number) => {
    // HSL (s = 0.28) → RGB, enough for a muted swatch
    const s = 0.28;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + hue / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  const fill = rgb(0.62);
  const line = rgb(0.28);
  const paper = [244, 244, 242];
  const px = new Uint8Array(width * height * 4);
  const mx = width * 0.14;
  const my = height * 0.12;
  const r = Math.min(width, height) * 0.12;
  const border = Math.max(4, Math.round(Math.min(width, height) * 0.012));
  // signed distance to a rounded rectangle inset by the margins
  const hw = width / 2 - mx;
  const hh = height / 2 - my;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const qx = Math.abs(x + 0.5 - width / 2) - (hw - r);
      const qy = Math.abs(y + 0.5 - height / 2) - (hh - r);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      const i = (y * width + x) * 4;
      let c: number[] | null = d <= -border ? fill : d <= 0 ? line : null;
      if (c && d <= -border && (x + y) % 23 < 2) c = line; // a hatch, so it reads as a drawing
      if (c) {
        px[i] = c[0];
        px[i + 1] = c[1];
        px[i + 2] = c[2];
        px[i + 3] = 255;
      } else if (!transparent) {
        px[i] = paper[0];
        px[i + 1] = paper[1];
        px[i + 2] = paper[2];
        px[i + 3] = 255;
      }
    }
  }
  return encodePng(width, height, px);
}
