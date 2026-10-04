/**
 * Minimal ZIP reader built on Node's zlib.
 *
 * e-GP archives use only store (0) and deflate (8), which the central
 * directory plus inflateRaw covers completely — so this avoids pulling in a
 * zip dependency and the container rebuild that would require.
 *
 * Entry names holding Thai text are CP874, not UTF-8, unless the entry sets
 * the language-encoding flag (bit 11). Decoding by that flag keeps names
 * readable instead of turning them into mojibake.
 */

import { inflateRawSync } from "zlib";

export interface ZipEntry {
  /** Decoded name, safe to display and match against. */
  name: string;
  /** Raw bytes of the name, used as the lookup key. */
  rawName: string;
  size: number;
  compressedSize: number;
  method: number;
  offset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/** Names are UTF-8 only when the entry says so; otherwise Thai CP874. */
function decodeName(buf: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return buf.toString("utf-8");
  try {
    return new TextDecoder("windows-874").decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

function findEndOfCentralDirectory(buf: Buffer): number {
  // The EOCD sits at the end, after a comment of up to 64KB.
  const start = Math.max(0, buf.length - 66_000);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("ไม่พบ End of Central Directory — ไฟล์อาจไม่ใช่ ZIP หรือเสียหาย");
}

export function listEntries(zip: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(zip);
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== CEN_SIG) break;

    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const size = zip.readUInt32LE(offset + 24);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);

    const nameBuf = zip.subarray(offset + 46, offset + 46 + nameLen);

    entries.push({
      name: decodeName(nameBuf, (flags & 0x800) !== 0),
      rawName: nameBuf.toString("latin1"),
      size,
      compressedSize,
      method,
      offset: localOffset,
    });

    offset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/** Read one entry's bytes, decompressing when needed. */
export function readEntry(zip: Buffer, entry: ZipEntry): Buffer {
  if (zip.readUInt32LE(entry.offset) !== LOC_SIG) {
    throw new Error(`local header ไม่ถูกต้องสำหรับ ${entry.name}`);
  }

  // The local header repeats the name/extra lengths, and they can differ
  // from the central directory's — always read them from here.
  const nameLen = zip.readUInt16LE(entry.offset + 26);
  const extraLen = zip.readUInt16LE(entry.offset + 28);
  const dataStart = entry.offset + 30 + nameLen + extraLen;
  const data = zip.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);

  throw new Error(`ไม่รองรับ compression method ${entry.method} (${entry.name})`);
}

/** Find an entry by its decoded name and return its bytes. */
export function extractByName(zip: Buffer, name: string): Buffer | null {
  const entry = listEntries(zip).find((e) => e.name === name);
  return entry ? readEntry(zip, entry) : null;
}
