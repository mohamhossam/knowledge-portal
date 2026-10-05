/**
 * A ZIP archive of named parts, enough for an Office Open XML package
 * (requirement-portal ADR-0101, step 6). Entries are deflated with the
 * browser's own CompressionStream where it has one, and stored otherwise;
 * Word reads both. No dependency: the format is small and fixed.
 */

export type ZipParts = Record<string, string | Uint8Array>;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of the bytes, as ZIP records it. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Raw deflate through CompressionStream, or null where the platform has none. */
async function deflated(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Response(bytes as BodyInit).body!.pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** The MS-DOS time and date ZIP stamps an entry with. */
function dosStamp(moment: Date): { time: number; date: number } {
  const year = Math.max(1980, moment.getFullYear());
  return {
    time: (moment.getHours() << 11) | (moment.getMinutes() << 5) | Math.floor(moment.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((moment.getMonth() + 1) << 5) | moment.getDate(),
  };
}

type Entry = { name: Uint8Array; crc: number; size: number; data: Uint8Array; method: number; offset: number };

/**
 * The parts as one archive, in the order given: an Office package lists
 * `[Content_Types].xml` first. Names are written as UTF-8 (flag bit 11).
 */
export async function zip(parts: ZipParts, options: { at?: Date; compress?: boolean } = {}): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const { time, date } = dosStamp(options.at ?? new Date());
  const entries: Entry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of Object.entries(parts)) {
    const raw = typeof content === "string" ? encoder.encode(content) : content;
    const packed = options.compress === false ? null : await deflated(raw);
    const smaller = packed && packed.length < raw.length ? packed : null;
    const entry: Entry = {
      name: encoder.encode(path),
      crc: crc32(raw),
      size: raw.length,
      data: smaller ?? raw,
      method: smaller ? 8 : 0,
      offset,
    };
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true);
    header.setUint16(8, entry.method, true);
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, entry.crc, true);
    header.setUint32(18, entry.data.length, true);
    header.setUint32(22, entry.size, true);
    header.setUint16(26, entry.name.length, true);
    header.setUint16(28, 0, true);
    chunks.push(new Uint8Array(header.buffer), entry.name, entry.data);
    offset += 30 + entry.name.length + entry.data.length;
    entries.push(entry);
  }
  const directoryStart = offset;
  for (const entry of entries) {
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, 0x0800, true);
    header.setUint16(10, entry.method, true);
    header.setUint16(12, time, true);
    header.setUint16(14, date, true);
    header.setUint32(16, entry.crc, true);
    header.setUint32(20, entry.data.length, true);
    header.setUint32(24, entry.size, true);
    header.setUint16(28, entry.name.length, true);
    header.setUint32(42, entry.offset, true);
    chunks.push(new Uint8Array(header.buffer), entry.name);
    offset += 46 + entry.name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, offset - directoryStart, true);
  end.setUint32(16, directoryStart, true);
  chunks.push(new Uint8Array(end.buffer));

  const out = new Uint8Array(offset + 22);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
