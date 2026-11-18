/** Only normalized same-origin HTTP(S) paths may reach the client-side router. */
export function internalNavigationPath(value: string, base: string): string | null {
  try {
    const origin = new URL(base);
    const url = new URL(value, origin);
    if ((url.protocol !== "http:" && url.protocol !== "https:") ||
        url.origin !== origin.origin || url.username || url.password) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
