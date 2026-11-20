#!/usr/bin/env python3
"""Keep an env-free production frontend and synthetic API open for DevTools."""
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from isolated_frontend import prepare_frontend, test_environment

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(tempfile.mkdtemp(prefix="icheertor-manual-evidence-"))
processes = []


def stop_signal(signum, frame):
    raise KeyboardInterrupt


def start(args, cwd, filename):
    with (WORK / filename).open("w") as log:
        process = subprocess.Popen(args, cwd=cwd, env=test_environment(local_browser=True), stdout=log, stderr=subprocess.STDOUT)
    processes.append(process)
    return process


def wait_for(check, process):
    for _ in range(480):
        if process.poll() is not None:
            raise RuntimeError("Owned test process exited; logs: " + str(WORK))
        try:
            if check():
                return
        except OSError:
            pass
        time.sleep(0.25)
    raise TimeoutError("Owned test process not ready; logs: " + str(WORK))


signal.signal(signal.SIGTERM, stop_signal)
try:
    for port in (4300, 4301):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
    print("Building isolated production frontend. No real .env or database is used...", flush=True)
    frontend = prepare_frontend(ROOT, WORK, local_browser=True)
    api = start(["node", "--import", "tsx", "scripts/zap-fixture.mts", str(WORK)], ROOT / "backend", "api.log")
    wait_for(lambda: (WORK / "fixture.json").exists(), api)
    front = start(["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4300"], frontend, "frontend.log")

    def ready():
        with urllib.request.urlopen("http://127.0.0.1:4300/login", timeout=3) as response:
            policy = response.headers.get("Content-Security-Policy", "")
            assert "'nonce-" in policy and "'unsafe-eval'" not in policy
            assert response.headers.get("Cache-Control") == "private, no-store"
            return response.status == 200

    wait_for(ready, front)
    print("READY: http://127.0.0.1:4300/login\nPASS production CSP has a nonce and no unsafe-eval\nPASS frontend Cache-Control: private, no-store\nAPI headers: http://127.0.0.1:4301/api/health\nSynthetic records only. Do not use Google sign-in here.\nKeep this terminal open. Ctrl+C stops owned servers and removes their database.", flush=True)
    while True:
        if any(p.poll() is not None for p in processes):
            raise RuntimeError("An owned test server stopped; logs: " + str(WORK))
        time.sleep(1)
except KeyboardInterrupt:
    print("Stopping isolated evidence servers...", flush=True)
finally:
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    (WORK / "fixture.json").unlink(missing_ok=True)
    print("Private build/runtime logs: " + str(WORK), flush=True)
