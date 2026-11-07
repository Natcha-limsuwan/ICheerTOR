import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { OAuthStateStore } from "../../src/auth/oauth-state-store.js";

function begin(store: OAuthStateStore) {
  let cookie = "";
  const req = { headers: {}, res: { cookie(name: string, value: string, options: any) {
    assert.equal(options.httpOnly, true); assert.equal(options.sameSite, "lax");
    assert.equal(options.secure, true); cookie = `${name}=${value}`;
  } } } as unknown as Request;
  let state = "";
  store.store(req, (error, value) => { assert.equal(error, null); state = value; });
  assert.match(state, /^[\w-]{43}$/);
  return { state, cookie };
}
function verify(store: OAuthStateStore, state: any, cookie: string) {
  let ok: boolean | undefined;
  store.verify({ headers: { cookie }, res: { clearCookie() {} } } as unknown as Request, state,
    (error, value) => { assert.equal(error, null); ok = value; });
  return ok;
}
test("STATE-01: transaction is bound to browser and consumed once", () => {
  const store = new OAuthStateStore(true);
  const a = begin(store), b = begin(store);
  assert.equal(verify(store, a.state, b.cookie), false);
  assert.equal(verify(store, a.state, a.cookie), true);
  assert.equal(verify(store, a.state, a.cookie), false);
});
test("STATE-02: missing, altered or non-string state/cookie is refused", () => {
  const store = new OAuthStateStore(true), a = begin(store);
  for (const state of [undefined, [], {}, "", a.state + "x"]) assert.equal(verify(store, state, a.cookie), false);
  assert.equal(verify(store, a.state, ""), false);
  assert.equal(verify(store, a.state, "icheertor_oauth=invalid"), false);
  assert.equal(verify(store, a.state, a.cookie), true);
});
test("STATE-03: expired transactions are refused; a new attempt still works", () => {
  let time = 0;
  const store = new OAuthStateStore(true, () => time), a = begin(store);
  time = 600_001;
  assert.equal(verify(store, a.state, a.cookie), false);
  const b = begin(store);
  assert.equal(verify(store, b.state, b.cookie), true);
});
