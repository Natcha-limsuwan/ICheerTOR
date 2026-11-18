#!/usr/bin/env python3
"""Reuses the production build from run-isolated.py; creates fresh test data."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(tempfile.mkdtemp(prefix="icheertor-browser-"))
SHARED = WORK / "shared"
SHARED.mkdir(mode=0o777)
SHARED.chmod(0o777)
processes = []
name = "icheertor-browser-" + uuid.uuid4().hex[:8]


def start(args, cwd, filename):
    process = subprocess.Popen(args, cwd=cwd, stdout=(WORK / filename).open("w"), stderr=subprocess.STDOUT)
    processes.append(process)
    return process


def wait_for(check, process):
    for _ in range(480):
        if process.poll() is not None:
            raise RuntimeError("Test server exited; private logs: " + str(WORK))
        try:
            if check():
                return
        except OSError:
            pass
        time.sleep(0.25)
    raise TimeoutError("Test server not ready")


try:
    for port in (4300, 4301):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
    # Official Mozilla release asset, checked against the GitHub asset digest.
    request = urllib.request.Request("https://api.github.com/repos/mozilla/geckodriver/releases/latest", headers={"User-Agent": "ICheerTOR-local-security-tests"})
    release = json.load(urllib.request.urlopen(request, timeout=30))
    asset = next(a for a in release["assets"] if a["name"].endswith("linux-aarch64.tar.gz"))
    archive = urllib.request.urlopen(asset["browser_download_url"], timeout=60).read()
    digest = "sha256:" + hashlib.sha256(archive).hexdigest()
    if asset.get("digest") and asset["digest"] != digest:
        raise RuntimeError("WebDriver asset digest mismatch")
    (WORK / "driver.tar.gz").write_bytes(archive)
    with tarfile.open(WORK / "driver.tar.gz") as package:
        binary = package.extractfile("geckodriver")
        if binary is None:
            raise RuntimeError("Missing WebDriver binary")
        (SHARED / "geckodriver").write_bytes(binary.read())
    (SHARED / "geckodriver").chmod(0o755)
    (SHARED / "browser-attacks.py").write_text((ROOT / "security/zap/browser-attacks.py").read_text())
    api = start(["node", "--import", "tsx", "scripts/zap-fixture.mts", str(WORK)], ROOT / "backend", "api.log")
    wait_for(lambda: (WORK / "fixture.json").exists(), api)
    fixture = json.loads((WORK / "fixture.json").read_text())
    front = start(["node", "node_modules/next/dist/bin/next", "start", "--port", "4300"], ROOT / "frontend", "frontend.log")
    wait_for(lambda: "Ready in" in (WORK / "frontend.log").read_text() and urllib.request.urlopen("http://127.0.0.1:4300/login", timeout=3).status == 200, front)
    print("Running authenticated Firefox security tests...", flush=True)
    with (WORK / "browser.log").open("w") as log:
        result = subprocess.run(["docker", "run", "--rm", "--name", name, "--cpus", "2", "--memory", "2g", "--shm-size", "512m", "-i", "-v", f"{SHARED}:/zap/wrk:rw", "ghcr.io/zaproxy/zaproxy:stable", "python", "/zap/wrk/browser-attacks.py"], input=json.dumps(fixture), text=True, stdout=log, stderr=subprocess.STDOUT, timeout=480)
    report = SHARED / "browser-attacks.json"
    if report.exists():
        evidence = json.loads(report.read_text())
        evidence.update(driverRelease=release["tag_name"], driverAssetDigest=digest, runtimeExitCode=result.returncode)
        (ROOT / "security/reports/browser-security-comprehensive.json").write_text(json.dumps(evidence, indent=2))
        print(json.dumps({"passed": evidence["passed"], "failed": evidence["failed"], "runtimeExitCode": result.returncode}))
    if result.returncode:
        raise RuntimeError("Browser run failed; see " + str(WORK / "browser.log"))
    if evidence["failed"]:
        raise RuntimeError("Browser security assertions failed; inspect the saved report")
finally:
    subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    (WORK / "fixture.json").unlink(missing_ok=True)
    print("Private runtime logs: " + str(WORK), flush=True)
