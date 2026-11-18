"""Authenticated browser attacks using Firefox's WebDriver REST API, no pip deps.

Run inside the active ZAP container. Synthetic fixture JSON arrives on stdin.
"""
import json
import base64
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

fixture = json.load(sys.stdin)
FRONT = "http://host.docker.internal:4300"
API = "http://host.docker.internal:4301/api"
COMPARE = "/compare?ids=" + fixture["torId"] + "," + fixture["comparisonTorId"]
results = []
session = None


def request(url, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, method=method, data=json.dumps(data).encode() if data is not None else None, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def wd(path, method="GET", data=None):
    status, body = request("http://127.0.0.1:19191" + path, method, data)
    if status >= 400:
        raise RuntimeError(str(body.get("value", body))[:500])
    return body.get("value")


def execute(script, *args):
    return wd(f"/session/{session}/execute/sync", "POST", {"script": script, "args": args})


def execute_async(script, *args):
    return wd(f"/session/{session}/execute/async", "POST", {"script": script, "args": args})


def go(path):
    wd(f"/session/{session}/url", "POST", {"url": FRONT + path})


def wait_for(predicate, seconds=20):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if predicate():
            return True
        time.sleep(0.2)
    return False


def check(name, ok, **detail):
    results.append({"test": name, "passed": bool(ok), **detail})


drivers = list(Path("/home/zap/.ZAP/webdriver").rglob("geckodriver"))
if Path("/zap/wrk/geckodriver").is_file():
    drivers.insert(0, Path("/zap/wrk/geckodriver"))
if not drivers:
    raise RuntimeError("ZAP browser driver has not been installed")
driver = subprocess.Popen([str(drivers[0]), "--port", "19191"], stdout=open("/zap/wrk/webdriver-private.log", "w"), stderr=subprocess.STDOUT)

def ready():
    try:
        return driver.poll() is None and wd("/status")["ready"]
    except OSError:
        return False

try:
    if not wait_for(ready, 15):
        raise RuntimeError("WebDriver did not become ready")
    value = wd("/session", "POST", {"capabilities": {"alwaysMatch": {"browserName": "firefox", "moz:firefoxOptions": {"args": ["-headless"]}}}})
    session = value["sessionId"]
    wd(f"/session/{session}/timeouts", "POST", {"pageLoad": 30000, "script": 30000})
    go("/login")
    check("anonymous browser cannot view profile", (go("/profile") is None) and wait_for(lambda: "/login" in wd(f"/session/{session}/url")))

    for role, identity in fixture["identities"].items():
        go("/login")
        execute("localStorage.setItem('icheertor_token',arguments[0])", identity["token"])
        for path in ["/procurement", "/procurement/" + fixture["torId"], "/profile", "/bookmarks", "/alerts", COMPARE] + (["/admin", "/admin/users", "/admin/logs"] if role != "user" else []):
            go(path)
            loaded = wait_for(lambda: execute("return document.readyState==='complete' && document.body.innerText.length > 50"))
            # Confirm real auth/API access as well as client navigation.
            status, _ = request(API + "/auth/me", token=identity["token"])
            check(f"{role} browser loads {path}", loaded and status == 200 and "/login" not in wd(f"/session/{session}/url"))
        if role == "user":
            go("/admin/users")
            check("user browser is redirected from admin screen", wait_for(lambda: "/procurement" in wd(f"/session/{session}/url")))
            check("user direct admin API denied", request(API + "/admin/users", token=identity["token"])[0] == 403)

    user = fixture["identities"]["user"]
    admin = fixture["identities"]["admin"]
    go("/login")
    execute("localStorage.setItem('icheertor_token',arguments[0])", user["token"])
    go("/profile")
    wait_for(lambda: execute("return [...document.querySelectorAll('input')].some(e=>e.value==='Synthetic user company')"))
    company = execute("return [...document.querySelectorAll('input')].find(e=>e.value==='Synthetic user company')")
    company_id = company["element-6066-11e4-a52e-4f735466cecf"]
    wd(f"/session/{session}/element/{company_id}/value", "POST", {"text": " edited"})
    execute_async("const done=arguments[arguments.length-1];requestAnimationFrame(()=>requestAnimationFrame(()=>done(true)))")
    execute("const a=document.createElement('a');a.href='/bookmarks';document.body.append(a);a.click();a.remove()")
    check("dirty profile uses the leave-confirmation guard", wait_for(lambda: execute("return !!document.querySelector('[role=dialog]')")))
    execute("[...document.querySelectorAll('[role=dialog] button')].find(e=>e.innerText.includes('อยู่หน้านี้ต่อ')).click()")
    for target in ["data:text/html,<script>window.__x=1</script>", "vbscript:msgbox(1)", "jAvAsCrIpT:window.__x=1"]:
        outcome = execute("const a=document.createElement('a');a.href=arguments[0];document.body.append(a);const event=new MouseEvent('click',{bubbles:true,cancelable:true});a.dispatchEvent(event);a.remove();return {prevented:event.defaultPrevented,executed:!!window.__x}", target)
        check("dirty profile blocks unsafe link scheme", outcome["prevented"] and not outcome["executed"], input=target.split(":")[0])
    execute("[...document.querySelectorAll('button')].find(e=>e.innerText==='บันทึกโปรไฟล์').click()")
    if not wait_for(lambda: execute("return document.body.innerText.includes('บันทึกโปรไฟล์สำเร็จ')")):
        raise RuntimeError("Synthetic profile edit could not be saved before navigation tests")
    normal = execute_async("const done=arguments[arguments.length-1]; fetch(arguments[0],{headers:{Authorization:'Bearer '+arguments[1]}}).then(r=>done({status:r.status})).catch(e=>done({error:e.name}));", API + "/auth/me", user["token"])
    check("allowed frontend origin reads authenticated API in Firefox", normal.get("status") == 200)

    class AttackerPage(BaseHTTPRequestHandler):
        def do_GET(self):
            body = ('<!doctype html><title>Synthetic attack origin</title><iframe id="victim" src="' + FRONT + '/profile"></iframe>').encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *args):
            pass

    attacker = HTTPServer(("127.0.0.1", 0), AttackerPage)
    Thread(target=attacker.serve_forever, daemon=True).start()
    try:
        wd(f"/session/{session}/url", "POST", {"url": f"http://127.0.0.1:{attacker.server_port}/"})
        denied = execute_async("const done=arguments[arguments.length-1]; fetch(arguments[0],{headers:{Authorization:'Bearer '+arguments[1]}}).then(r=>done({readable:true,status:r.status})).catch(e=>done({blocked:e.name==='TypeError'}));", API + "/auth/me", user["token"])
        check("attacker origin cannot read authenticated API in Firefox", denied.get("blocked") is True)
        execute("const p=document.createElement('p');p.textContent='CORS browser result: '+arguments[0];document.body.prepend(p)", json.dumps(denied))
        Path("/zap/wrk/evidence-cors-and-iframe.png").write_bytes(base64.b64decode(wd(f"/session/{session}/screenshot")))
        frame = wd(f"/session/{session}/element", "POST", {"using": "css selector", "value": "#victim"})
        wd(f"/session/{session}/frame", "POST", {"id": frame})
        frame_uri = execute("return document.documentURI")
        check("Firefox blocks clickjacking iframe", frame_uri.startswith("about:neterror") and ("csp" in frame_uri.lower() or "denied" in frame_uri.lower()), observedFrameDocument=frame_uri)
    finally:
        wd(f"/session/{session}/frame", "POST", {"id": None})
        attacker.shutdown()
        attacker.server_close()

    for next_value in ["https://evil.example.invalid", "//evil.example.invalid", "https://localhost.evil.example.invalid"]:
        go("/login?next=" + urllib.parse.quote(next_value, safe=""))
        check("login next parameter cannot redirect externally", urllib.parse.urlsplit(wd(f"/session/{session}/url")).netloc == "host.docker.internal:4300", input=next_value)
    for payload in ['<img src=x onerror="window.__x=1">', '<svg onload="window.__x=1"></svg>', '</script><script>window.__x=1</script>']:
        status, _ = request(API + "/profile", "PUT", {"companyName": payload}, user["token"])
        go("/profile")
        rendered = wait_for(lambda: execute("return [...document.querySelectorAll('input')].some(e=>e.value===arguments[0])", payload))
        safe = execute("return !window.__x && !document.querySelector('img[src=x],svg[onload]')")
        check("stored profile XSS rendered as data", status == 200 and rendered and safe, payload=payload)
        status, _ = request(API + "/admin/tor-review/" + fixture["torId"], "PUT", {"changes": {"title": payload}}, admin["token"])
        go("/procurement/" + fixture["torId"])
        rendered = wait_for(lambda: execute("return document.body.innerText.includes(arguments[0])", payload))
        safe = execute("return !window.__x && !document.querySelector('img[src=x],svg[onload]')")
        check("stored procurement XSS rendered as data", status == 200 and rendered and safe, payload=payload)
        for path in ["/procurement", "/bookmarks", COMPARE]:
            go(path)
            rendered = wait_for(lambda: execute("return document.body.innerText.includes(arguments[0])", payload))
            safe = execute("return !window.__x && !document.querySelector('img[src=x],svg[onload]')")
            check("stored title XSS remains data in " + path.split("?")[0], rendered and safe, payload=payload)

    for path in ["/login?error=" + urllib.parse.quote('<img src=x onerror="window.__x=1">'), "/procurement?q=" + urllib.parse.quote('<svg onload="window.__x=1">')]:
        go(path)
        check("URL payload does not execute", execute("return !window.__x && !document.querySelector('img[src=x],svg[onload]')"), path=path)
    execute("localStorage.removeItem('icheertor_token')")
    go("/callback#token=" + user["token"])
    wait_for(lambda: "/callback" not in wd(f"/session/{session}/url"))
    check("session token in URL is not accepted", execute("return localStorage.getItem('icheertor_token')===null"))
    go("/login")
    execute("localStorage.setItem('icheertor_token',arguments[0])", user["token"])
    check("logout request accepted", request(API + "/auth/logout", "POST", {}, user["token"])[0] == 200)
    go("/profile")
    check("revoked session redirects browser to login", wait_for(lambda: "/login" in wd(f"/session/{session}/url")))
finally:
    if session:
        wd(f"/session/{session}", "DELETE")
    driver.terminate()
    driver.wait(timeout=10)
    evidence = {"tests": results, "passed": sum(r["passed"] for r in results), "failed": sum(not r["passed"] for r in results), "scope": "Synthetic sessions in real Firefox; actual Google provider login excluded"}
    Path("/zap/wrk/browser-attacks.json").write_text(json.dumps(evidence, indent=2))
    print(json.dumps({"passed": evidence["passed"], "failed": evidence["failed"]}))
