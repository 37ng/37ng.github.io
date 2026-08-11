const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export type Hasher = (input: Uint8Array, out: Uint8Array) => void;

// Specialised to one fixed input length so every buffer is allocated once and
// reused — the mining loop calls this hundreds of thousands of times a second,
// and per-call allocation alone would dominate the cost.
export function createHasher(byteLength: number): Hasher {
  const blocks = Math.ceil((byteLength + 9) / 64);
  const buf = new Uint8Array(blocks * 64);
  const view = new DataView(buf.buffer);
  const w = new Uint32Array(64);

  // Padding never changes for a fixed length, so it is written once here and
  // left untouched — each call only overwrites the first `byteLength` bytes.
  buf[byteLength] = 0x80;
  view.setUint32(blocks * 64 - 4, byteLength * 8, false);

  return function hash(input: Uint8Array, out: Uint8Array) {
    buf.set(input, 0);

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    for (let block = 0; block < blocks; block++) {
      const off = block * 64;
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15];
        const y = w[i - 2];
        const s0 =
          ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 =
          ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;

      for (let i = 0; i < 64; i++) {
        const S1 =
          ((e >>> 6) | (e << 26)) ^
          ((e >>> 11) | (e << 21)) ^
          ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 =
          ((a >>> 2) | (a << 30)) ^
          ((a >>> 13) | (a << 19)) ^
          ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
      h5 = (h5 + f) | 0;
      h6 = (h6 + g) | 0;
      h7 = (h7 + h) | 0;
    }

    const s = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 8; i++) {
      const v = s[i];
      out[i * 4] = v >>> 24;
      out[i * 4 + 1] = (v >>> 16) & 0xff;
      out[i * 4 + 2] = (v >>> 8) & 0xff;
      out[i * 4 + 3] = v & 0xff;
    }
  };
}

const HEX = "0123456789abcdef";

/** Bitcoin prints hashes as a big-endian number, i.e. byte-reversed. */
export function toDisplayHex(digest: Uint8Array): string {
  let out = "";
  for (let i = digest.length - 1; i >= 0; i--) {
    out += HEX[digest[i] >> 4] + HEX[digest[i] & 0xf];
  }
  return out;
}

export function leadingZeroBits(digest: Uint8Array): number {
  let bits = 0;
  for (let i = digest.length - 1; i >= 0; i--) {
    const byte = digest[i];
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

// Reads the digest from the tail, so the zeros it counts are the zeros
// toDisplayHex prints on the left.
export function meetsTarget(digest: Uint8Array, zeroBits: number): boolean {
  const last = digest.length - 1;
  const fullBytes = zeroBits >> 3;
  for (let i = 0; i < fullBytes; i++) {
    if (digest[last - i] !== 0) return false;
  }
  const rest = zeroBits & 7;
  if (rest !== 0 && digest[last - fullBytes] >>> (8 - rest) !== 0) return false;
  return true;
}
