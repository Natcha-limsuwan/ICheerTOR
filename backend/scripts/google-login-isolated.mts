/** Interactive Google OAuth against an owned disposable database. No real DB access. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import http from "node:http";
import { parse } from "dotenv";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Parse locally, but copy ONLY OAuth client credentials. Never import source DB settings.
const source = parse(await readFile(new URL("../.env", import.meta.url)));
assert(source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET, "Missing Google client credentials");
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = mongo.getUri("icheertor_google_disposable");
assert(![27017, 27018].includes(Number(new URL(uri).port)));
Object.assign(process.env, {
  NODE_ENV: "test", MONGODB_URI: uri, JWT_SECRET: randomBytes(48).toString("hex"),
  GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: "http://localhost:4401/api/auth/google/callback",
  FRONTEND_URL: "http://localhost:4400", ADMIN_EMAILS: "", CRON_SECRET: "",
  SMTP_USER: "", SMTP_PASS: "", VERTEX_AI_API_KEY: "", VERTEX_AI_PROJECT_ID: "",
  GOOGLE_APPLICATION_CREDENTIALS: "",
});
const { env } = await import("../src/config/env.js");
assert.equal(env.MONGODB_URI, uri);
const { default: app } = await import("../src/app.js");
const { connectDB } = await import("../src/db/connection.js");
await connectDB();
const html = `<!doctype html><meta charset="utf-8"><title>Isolated Google Login Test</title>
<h1>ICheerTOR — isolated Google Login test</h1><p>Disposable database. No SMTP/AI. Tokens are never displayed.</p>
<button id="login">Sign in with Google</button><pre id="result"></pre>
<script>
const out=document.getElementById('result'); const api='http://localhost:4401/api/auth';
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
document.getElementById('login').onclick=async()=>{
 const v=b64(crypto.getRandomValues(new Uint8Array(32))); sessionStorage.setItem('verifier',v);
 const c=b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
 location.href=api+'/google?browserChallenge='+encodeURIComponent(c);
};
async function run(){
 const code=new URLSearchParams(location.hash.slice(1)).get('code');
 if(!code){if(location.search)out.textContent='FAIL: Google callback rejected login';return;}
 history.replaceState(null,'','/callback');
 const body=JSON.stringify({code,browserVerifier:sessionStorage.getItem('verifier')});sessionStorage.removeItem('verifier');
 const exchange=await fetch(api+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body});
 const data=await exchange.json();if(!exchange.ok)throw Error('Exchange status '+exchange.status);
 const headers={Authorization:'Bearer '+data.data.token};
 const lines=['PASS real Google callback and browser-bound exchange'];
 const replay=await fetch(api+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body});
 if(replay.status!==400)throw Error('Code replay status '+replay.status);lines.push('PASS one-time code replay rejected');
 const me=await fetch(api+'/me',{headers});if(me.status!==200)throw Error('Authenticated access failed');lines.push('PASS authenticated API access');
 const logout=await fetch(api+'/logout',{method:'POST',headers});if(!logout.ok)throw Error('Logout failed');lines.push('PASS logout');
 const old=await fetch(api+'/me',{headers});if(old.status!==401)throw Error('Old token status '+old.status);lines.push('PASS old token rejected after logout');
 out.textContent=lines.join('\\n');
 await fetch('/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checks:lines})});
}
run().catch(()=>{out.textContent='FAIL: login verification failed. Check isolated backend terminal (do not share tokens).';});
</script>`;
const ui = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "POST" && req.url === "/results") {
    let body = "";
    for await (const chunk of req) { body += chunk; if(body.length > 2048) { res.writeHead(413).end(); return; } }
    const expected = ["PASS real Google callback and browser-bound exchange", "PASS one-time code replay rejected", "PASS authenticated API access", "PASS logout", "PASS old token rejected after logout"];
    try { assert.deepEqual(JSON.parse(body).checks, expected); console.log("Browser-reported checks (manual evidence):\n" + expected.join("\n")); res.end("Recorded"); } catch { res.writeHead(400).end(); }
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html);
});
const server = app.listen(4401, "localhost");
ui.listen(4400, "localhost");
async function cleanup() { ui.close(); server.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(0); }
process.once("SIGINT", cleanup); process.once("SIGTERM", cleanup);
console.log("Isolated database ready (no source DB connection).\nGoogle callback: http://localhost:4401/api/auth/google/callback\nOpen http://localhost:4400 and sign in yourself.\nCtrl+C removes the disposable database. Do not run ZAP against Google.");
