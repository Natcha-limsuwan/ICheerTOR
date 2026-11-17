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
export const ZIP_LIMITS = { archive: 80 * 1024 * 1024, entry: 40 * 1024 * 1024, total: 128 * 1024 * 1024, entries: 500 } as const;

function bounds(buf: Buffer, offset: number, size: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > buf.length) {
    throw new Error("Truncated or invalid ZIP structure");
  }
}

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
  if (zip.length > ZIP_LIMITS.archive || zip.length < 22) throw new Error("Invalid ZIP archive size");
  const eocd = findEndOfCentralDirectory(zip);
  if (eocd + 22 + zip.readUInt16LE(eocd + 20) !== zip.length || zip.readUInt16LE(eocd + 4) !== 0 || zip.readUInt16LE(eocd + 6) !== 0) {
    throw new Error("Invalid or multi-disk ZIP archive");
  }
  const count = zip.readUInt16LE(eocd + 10);
  if (count > ZIP_LIMITS.entries || zip.readUInt16LE(eocd + 8) !== count) throw new Error("Too many ZIP entries");
  let offset = zip.readUInt32LE(eocd + 16);
  const centralEnd = offset + zip.readUInt32LE(eocd + 12);
  if (centralEnd !== eocd) throw new Error("Invalid ZIP central directory");

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let total = 0;

  for (let i = 0; i < count; i++) {
    bounds(zip, offset, 46);
    if (zip.readUInt32LE(offset) !== CEN_SIG) throw new Error("Invalid ZIP entry header");

    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const size = zip.readUInt32LE(offset + 24);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    bounds(zip, offset + 46, nameLen + extraLen + commentLen);
    if (offset + 46 + nameLen + extraLen + commentLen > centralEnd || (flags & 1) || ![0, 8].includes(method)) throw new Error("Unsupported ZIP entry");
    const mode = zip.readUInt32LE(offset + 38) >>> 16;
    if ((mode & 0xf000) === 0xa000) throw new Error("ZIP symlinks are not allowed");
    total += size;
    if (size > ZIP_LIMITS.entry || total > ZIP_LIMITS.total || compressedSize > ZIP_LIMITS.archive) throw new Error("ZIP expansion limit exceeded");
    bounds(zip, localOffset, 30);
    if (zip.readUInt32LE(localOffset) !== LOC_SIG || zip.readUInt16LE(localOffset + 8) !== method || (zip.readUInt16LE(localOffset + 6) & 1)) throw new Error("Invalid local ZIP entry");
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > zip.readUInt32LE(eocd + 16)) throw new Error("ZIP entry overlaps directory");
    bounds(zip, dataStart, compressedSize);

    const nameBuf = zip.subarray(offset + 46, offset + 46 + nameLen);
    const name = decodeName(nameBuf, (flags & 0x800) !== 0);
    if (name.includes("\0") || name.startsWith("/") || name.includes("\\") || /^[a-z]:/i.test(name) || name.split("/").includes("..") || names.has(name)) throw new Error("Unsafe or duplicate ZIP entry name");
    names.add(name);

    entries.push({
      name,
      rawName: nameBuf.toString("latin1"),
      size,
      compressedSize,
      method,
      offset: localOffset,
    });

    offset += 46 + nameLen + extraLen + commentLen;
  }
  if (offset !== centralEnd) throw new Error("ZIP directory length mismatch");

  return entries;
}

/** Read one entry's bytes, decompressing when needed. */
export function readEntry(zip: Buffer, entry: ZipEntry): Buffer {
  if (!listEntries(zip).some((e) => e.offset === entry.offset && e.size === entry.size && e.compressedSize === entry.compressedSize && e.method === entry.method && e.rawName === entry.rawName)) {
    throw new Error("Unknown ZIP entry");
  }
  if (zip.readUInt32LE(entry.offset) !== LOC_SIG) {
    throw new Error(`local header ไม่ถูกต้องสำหรับ ${entry.name}`);
  }

  // The local header repeats the name/extra lengths, and they can differ
  // from the central directory's — always read them from here.
  const nameLen = zip.readUInt16LE(entry.offset + 26);
  const extraLen = zip.readUInt16LE(entry.offset + 28);
  const dataStart = entry.offset + 30 + nameLen + extraLen;
  const data = zip.subarray(dataStart, dataStart + entry.compressedSize);

  let output: Buffer;
  if (entry.method === 0) output = Buffer.from(data);
  else if (entry.method === 8) output = inflateRawSync(data, { maxOutputLength: Math.max(1, Math.min(entry.size, ZIP_LIMITS.entry)) });
  else throw new Error(`Unsupported compression method ${entry.method}`);
  if (output.length !== entry.size) throw new Error("ZIP entry size mismatch");
  return output;

}

/** Find an entry by its decoded name and return its bytes. */
export function extractByName(zip: Buffer, name: string): Buffer | null {
  const entry = listEntries(zip).find((e) => e.name === name);
  return entry ? readEntry(zip, entry) : null;
}
