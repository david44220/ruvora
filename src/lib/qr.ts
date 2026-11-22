/**
 * Pure local ISO/IEC 18004 QR Code encoder (Byte mode, Error Correction Level M, Versions 1–10).
 * Keeps TOTP enrollment secrets strictly inside the browser with zero third-party requests.
 */

interface VersionSpec {
  version: number;
  size: number;
  ecPerBlock: number;
  blocks: [count: number, dataWords: number][];
  alignment: number[];
}

const SPECS: VersionSpec[] = [
  { version: 1, size: 21, ecPerBlock: 10, blocks: [[1, 16]], alignment: [] },
  { version: 2, size: 25, ecPerBlock: 16, blocks: [[1, 28]], alignment: [6, 18] },
  { version: 3, size: 29, ecPerBlock: 26, blocks: [[1, 44]], alignment: [6, 22] },
  { version: 4, size: 33, ecPerBlock: 18, blocks: [[2, 32]], alignment: [6, 26] },
  { version: 5, size: 37, ecPerBlock: 24, blocks: [[2, 43]], alignment: [6, 30] },
  { version: 6, size: 41, ecPerBlock: 16, blocks: [[4, 27]], alignment: [6, 34] },
  { version: 7, size: 45, ecPerBlock: 18, blocks: [[4, 31]], alignment: [6, 22, 38] },
  {
    version: 8,
    size: 49,
    ecPerBlock: 22,
    blocks: [
      [2, 38],
      [2, 39],
    ],
    alignment: [6, 24, 42],
  },
  {
    version: 9,
    size: 53,
    ecPerBlock: 22,
    blocks: [
      [3, 36],
      [2, 37],
    ],
    alignment: [6, 26, 46],
  },
  {
    version: 10,
    size: 57,
    ecPerBlock: 26,
    blocks: [
      [4, 43],
      [1, 44],
    ],
    alignment: [6, 28, 50],
  },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
})();

function gfMul(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function rsRemainder(data: Uint8Array, ecCount: number) {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const next = new Uint8Array(gen.length + 1);
    const root = GF_EXP[i]!;
    for (let j = 0; j < gen.length; j++) {
      next[j] = next[j]! ^ gen[j]!;
      next[j + 1] = next[j + 1]! ^ gfMul(gen[j]!, root);
    }
    gen = next;
  }
  const rem = new Uint8Array(ecCount);
  for (const byte of data) {
    const factor = byte ^ rem[0]!;
    for (let i = 0; i < ecCount - 1; i++) rem[i] = rem[i + 1]!;
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i++) rem[i] = rem[i]! ^ gfMul(gen[i + 1]!, factor);
    }
  }
  return rem;
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function formatBitsM(mask: number) {
  const data = mask & 7; // EC Level M indicator = 0b00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function penaltyScore(modules: boolean[][]) {
  const n = modules.length;
  let score = 0;
  for (let r = 0; r < n; r++) {
    let run = 1;
    for (let c = 1; c < n; c++) {
      if (modules[r]![c] === modules[r]![c - 1]) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  }
  for (let c = 0; c < n; c++) {
    let run = 1;
    for (let r = 1; r < n; r++) {
      if (modules[r]![c] === modules[r - 1]![c]) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  }
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) {
      const v = modules[r]![c];
      if (v === modules[r]![c + 1] && v === modules[r + 1]![c] && v === modules[r + 1]![c + 1])
        score += 3;
    }
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const ratio = Math.abs((dark * 100) / (n * n) - 50);
  score += Math.floor(ratio / 5) * 10;
  return score;
}

export interface QrMatrix {
  version: number;
  size: number;
  modules: boolean[][];
  svgPath: string;
  viewBox: string;
}

export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const spec = SPECS.find((item) => {
    const totalData = item.blocks.reduce((sum, [count, words]) => sum + count * words, 0);
    const headerBits = item.version >= 10 ? 20 : 12;
    return bytes.length * 8 + headerBits <= totalData * 8;
  });
  if (!spec) throw new Error("QR payload exceeds supported Version 10 EC-M capacity.");

  const totalData = spec.blocks.reduce((sum, [count, words]) => sum + count * words, 0);
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, spec.version >= 10 ? 16 : 8);
  for (const b of bytes) pushBits(b, 8);
  const capacityBits = totalData * 8;
  pushBits(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataWords = new Uint8Array(totalData);
  const usedBytes = bits.length / 8;
  for (let i = 0; i < usedBytes; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b]!;
    dataWords[i] = v;
  }
  const pad = [0xec, 0x11];
  for (let i = usedBytes; i < totalData; i++) dataWords[i] = pad[(i - usedBytes) % 2]!;

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [count, words] of spec.blocks) {
    for (let i = 0; i < count; i++) {
      const slice = dataWords.slice(offset, offset + words);
      offset += words;
      dataBlocks.push(slice);
      ecBlocks.push(rsRemainder(slice, spec.ecPerBlock));
    }
  }

  const codewords: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++)
    for (const block of dataBlocks) if (i < block.length) codewords.push(block[i]!);
  for (let i = 0; i < spec.ecPerBlock; i++) for (const block of ecBlocks) codewords.push(block[i]!);

  const n = spec.size;
  const modules: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  const isFn: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false));

  const setFn = (r: number, c: number, dark: boolean) => {
    modules[r]![c] = dark;
    isFn[r]![c] = true;
  };

  // Finder patterns + 1-module separators
  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const border = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFn(r, c, inOuter && (border || inner));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = spec.alignment;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const cr = centers[i]!;
      const cc = centers[j]!;
      const nearCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0);
      if (nearCorner) continue;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++)
          setFn(cr + dr, cc + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }

  // Dark module & reserve format areas
  setFn(4 * spec.version + 9, 8, true);
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFn[8]![i] = true;
      isFn[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFn[8]![n - 1 - i] = true;
    isFn[n - 1 - i]![8] = true;
  }

  // Version information (V >= 7)
  if (spec.version >= 7) {
    const vbits = versionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const dark = ((vbits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, dark);
      setFn(b, a, dark);
    }
  }

  // Place data bits in upward/downward 2-column zigzag
  let bitIdx = 0;
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++) {
      const r = upward ? n - 1 - step : step;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFn[r]![c]) {
          let dark = false;
          if (bitIdx < codewords.length * 8) {
            dark = ((codewords[bitIdx >>> 3]! >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          modules[r]![c] = dark;
        }
      }
    }
    upward = !upward;
  }

  const writeFormat = (grid: boolean[][], mask: number) => {
    const fbits = formatBitsM(mask);
    const bit = (pos: number) => ((fbits >>> pos) & 1) === 1;
    // Copy 1 around top-left finder
    for (let i = 0; i <= 5; i++) grid[8]![i] = bit(14 - i);
    grid[8]![7] = bit(8);
    grid[8]![8] = bit(7);
    grid[7]![8] = bit(6);
    for (let i = 0; i <= 5; i++) grid[5 - i]![8] = bit(5 - i);
    // Copy 2 bottom-left + top-right
    for (let i = 0; i < 7; i++) grid[n - 1 - i]![8] = bit(14 - i);
    for (let i = 0; i < 8; i++) grid[8]![n - 8 + i] = bit(7 - i);
  };

  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestGrid = modules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row, r) =>
      row.map((cell, c) => (isFn[r]![c] ? cell : maskBit(mask, r, c) ? !cell : cell)),
    );
    writeFormat(candidate, mask);
    const score = penaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestGrid = candidate;
    }
  }
  void bestMask;

  const quiet = 4;
  const parts: string[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (bestGrid[r]![c]) parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);

  const totalSize = n + quiet * 2;
  return {
    version: spec.version,
    size: n,
    modules: bestGrid,
    svgPath: parts.join(""),
    viewBox: `0 0 ${totalSize} ${totalSize}`,
  };
}
