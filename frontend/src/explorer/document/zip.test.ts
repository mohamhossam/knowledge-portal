import { describe, expect, it } from "vitest";

import { crc32, zip } from "./zip";

/** The archive's entries, read back the way an unzip tool reads them: from the central directory. */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let index = 0; index < entries; index++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(start, start + packed);
    const raw =
      method === 8
        ? new Uint8Array(await new Response(new Response(data as BodyInit).body!.pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer())
        : data;
    expect(raw.length).toBe(size);
    expect(crc32(raw)).toBe(crc);
    out.set(name, raw);
    at += 46 + nameLength;
  }
  return out;
}

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe("zip", () => {
  it("knows the CRC-32 of a known string", () => {
    expect(crc32(new TextEncoder().encode("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
  });

  it("packs parts in order, deflated where that is smaller, and reads back exactly", async () => {
    const xml = `<?xml version="1.0"?><w:document>${"<w:p>Business Pro Plus</w:p>".repeat(200)}</w:document>`;
    const bytes = await zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": xml, "word/media/image1.png": new Uint8Array([137, 80, 78, 71]), "Arabic/عربي.xml": "<x>نص</x>" });

    const entries = await unzip(bytes);
    expect([...entries.keys()]).toEqual(["[Content_Types].xml", "word/document.xml", "word/media/image1.png", "Arabic/عربي.xml"]);
    expect(text(entries.get("word/document.xml"))).toBe(xml);
    expect(text(entries.get("Arabic/عربي.xml"))).toBe("<x>نص</x>");
    expect([...entries.get("word/media/image1.png")!]).toEqual([137, 80, 78, 71]);
    // The first part's local header is the first thing in the file, and the document was deflated.
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(bytes.byteLength).toBeLessThan(xml.length);
  });

  it("stores the parts when asked not to compress", async () => {
    const bytes = await zip({ "a.xml": "<a/>".repeat(50) }, { compress: false });
    expect(new DataView(bytes.buffer).getUint16(8, true)).toBe(0);
    expect(text((await unzip(bytes)).get("a.xml"))).toBe("<a/>".repeat(50));
  });
});
