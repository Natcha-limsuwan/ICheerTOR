/** Egress policy for procurement ingestion. Every redirect is checked again. */
const HOSTS = new Set(["process.gprocurement.go.th", "process5.gprocurement.go.th", "egp2.bangkok.go.th"]);
const MAX_REDIRECTS = 3;

export function assertProcurementUrl(value: string | URL): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || (url.port && url.port !== "443") || url.username || url.password) {
    throw new Error("Procurement destination is not allowed");
  }
  return url;
}

export async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Response exceeds the allowed size");
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Response exceeds the allowed size");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally { reader.releaseLock(); }
}

export async function procurementFetch(value: string, options: RequestInit, maxBytes: number): 
  Promise<{ response: Response; body: Buffer }> 
{
  let url = assertProcurementUrl(value);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, { ...options, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || hop === MAX_REDIRECTS) throw new Error("Invalid procurement redirect");
      url = assertProcurementUrl(new URL(location, url));
      continue;
    }
    return { response, body: await readLimitedBody(response, maxBytes) };
  }
  throw new Error("Too many redirects");
}
