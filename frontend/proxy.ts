import { NextResponse, type NextRequest } from "next/server";

/** A fresh script nonce per HTML request; never trust a client-supplied nonce. */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api").origin;
  const isDev = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // MUI/Emotion and existing inline style attributes still require this.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.gstatic.com https://lh3.googleusercontent.com",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
    ...(apiOrigin.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
