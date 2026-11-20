/** Synthetic documents only: no source downloads or personal data. */
import { deflateRawSync } from "node:zlib";
export function zipFixture(entries: Array<{ name: string | Buffer; content: Buffer; method?: 0 | 8; utf8?: boolean }>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.isBuffer(entry.name) ? entry.name : Buffer.from(entry.name);
    const method = entry.method ?? 8, data = method === 8 ? deflateRawSync(entry.content) : entry.content;
    let crc = 0xffffffff;
    for (const byte of entry.content) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const flag = entry.utf8 === false ? 0 : 0x800;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flag, 6); header.writeUInt16LE(method, 8); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); header.writeUInt32LE(entry.content.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(flag, 8); directory.writeUInt16LE(method, 10); directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(entry.content.length, 24); directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42); central.push(directory, name); offset += header.length + name.length + data.length;
  }
  const body = Buffer.concat(local), directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, directory, end]);
}
export function pdfFixture(text = ""): Buffer {
  const lines = text.match(/.{1,75}/g) ?? [];
  const stream = "BT /F1 10 Tf 40 750 Td " + lines.map((line, index) =>
    `${index ? "0 -14 Td " : ""}(${line.replace(/[\\()]/g, "\\$&")}) Tj`).join("\n") + " ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let output = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output);
}
