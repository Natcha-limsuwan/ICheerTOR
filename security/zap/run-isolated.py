#!/usr/bin/env python3
"""Active ZAP scans against disposable local data; Python 3 + PyYAML + Docker."""
import concurrent.futures
import copy
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request
import uuid

import yaml
from isolated_frontend import prepare_frontend, test_environment

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "security/reports"
IMAGE = "ghcr.io/zaproxy/zaproxy:stable"
COMPLETE = os.environ.get("ZAP_COMPLETE") == "1"
PREFIX = "zap-comprehensive" if COMPLETE else "zap-active"
WORK = Path(tempfile.mkdtemp(prefix="icheertor-zap-"))
SCAN = WORK / "scan"
SCAN.mkdir(mode=0o777)
SCAN.chmod(0o777)  # ZAP's unprivileged container user writes here; no secrets stored here.
PROCESSES = []
CONTAINERS = []


def wait_for(check, process, seconds=120):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        if process.poll() is not None:
            raise RuntimeError("Local fixture exited; see private runtime logs: " + str(WORK))
        try:
            if check():
                return
        except (OSError, ValueError):
            pass
        time.sleep(0.25)
    raise TimeoutError("Local fixture not ready: " + str(WORK))


def start(args, cwd, log):
    process = subprocess.Popen(args, cwd=cwd, env=test_environment(), stdout=(WORK / log).open("w"), stderr=subprocess.STDOUT)
    PROCESSES.append(process)
    return process


def scan(kind, fixture):
    name = "icheertor-zap-" + kind + "-" + uuid.uuid4().hex[:8]
    CONTAINERS.append(name)
    command = ["docker", "run", "--rm", "--cpus", "2", "--memory", "3g", "--name", name, "-v", f"{SCAN}:/zap/wrk:rw"]
    environment = os.environ.copy()
    environment["ZAP_EVIDENCE_NAME"] = kind
    command += ["-e", "ZAP_EVIDENCE_NAME"]
    if kind in ("user", "admin", "developer"):
        # Pass by env name; the synthetic bearer is not in process arguments.
        environment.update(ZAP_AUTH_HEADER="Authorization", ZAP_AUTH_HEADER_VALUE="Bearer " + fixture["identities"][kind]["token"])
        command += ["-e", "ZAP_AUTH_HEADER", "-e", "ZAP_AUTH_HEADER_VALUE"]
    command += [IMAGE]
    if kind == "frontend":
        command += ["zap-full-scan.py", "-t", "http://host.docker.internal:4300", "-m", "1", "-T", "3"]
    else:
        command += ["zap-api-scan.py", "-t", f"{kind}.json", "-f", "openapi", "-T", "3"]
    # Explicit ceiling for active scanning. Logs/reports still determine coverage.
    minutes = 0 if COMPLETE else 5
    command += ["--hook", "/zap/wrk/evidence-hook.py", "-z", f"-config scanner.maxScanDurationInMins={minutes} -config scanner.threadPerHost=2", "-r", f"{kind}.html", "-J", f"{kind}-report.json"]
    print(f"Starting ZAP active scan: {kind}", flush=True)
    with (SCAN / f"{kind}.log").open("w") as output:
        result = subprocess.run(command, env=environment, stdout=output, stderr=subprocess.STDOUT, timeout=3600 if COMPLETE else 600)
    if result.returncode not in (0, 1, 2):
        raise RuntimeError(f"{kind} scanner failed ({result.returncode}); see {SCAN}")
    report = json.loads((SCAN / f"{kind}-report.json").read_text())
    alerts = [{"name": a["name"], "risk": a["riskdesc"], "instances": len(a.get("instances", []))}
              for site in report.get("site", []) for a in site.get("alerts", [])]
    # Scrub tokens before copying report evidence into the repository.
    for extension in ("html", "json", "log"):
        source = SCAN / (f"{kind}-report.json" if extension == "json" else f"{kind}.{extension}")
        value = source.read_text()
        for identity in fixture["identities"].values():
            value = value.replace(identity["token"], "[SYNTHETIC_TEST_TOKEN]")
        destination = "txt" if extension == "log" else extension
        (REPORTS / f"{PREFIX}-{kind}.{destination}").write_text(value)
    coverage_file = SCAN / f"{kind}-coverage.json"
    coverage_text = coverage_file.read_text()
    for identity in fixture["identities"].values():
        coverage_text = coverage_text.replace(identity["token"], "[SYNTHETIC_TEST_TOKEN]")
    coverage = json.loads(coverage_text)
    (REPORTS / f"{PREFIX}-{kind}-coverage.json").write_text(json.dumps(coverage, indent=2))
    print(f"Finished {kind}: exit={result.returncode}, {len(alerts)} alert types", flush=True)
    return {"scope": kind, "exitCode": result.returncode, "alerts": alerts, "coverage": coverage}


try:
    # Never accidentally reuse an unrelated app already listening on these ports.
    for port in (4300, 4301):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
    print("Building frontend production code...", flush=True)
    frontend_directory = prepare_frontend(ROOT, WORK)
    api = start(["node", "--import", "tsx", "scripts/zap-fixture.mts", str(WORK)], ROOT / "backend", "api.log")
    wait_for(lambda: (WORK / "fixture.json").exists(), api)
    fixture = json.loads((WORK / "fixture.json").read_text())
    frontend = start(["node", "node_modules/next/dist/bin/next", "start", "--port", "4300"], frontend_directory, "frontend.log")
    wait_for(lambda: "Ready in" in (WORK / "frontend.log").read_text() and urllib.request.urlopen("http://127.0.0.1:4300/login", timeout=3).status == 200, frontend)
    original = yaml.safe_load((ROOT / "security/zap/openapi.yaml").read_text())
    (SCAN / "evidence-hook.py").write_text((ROOT / "security/zap/evidence-hook.py").read_text())
    exclusions = ["/auth/exchange", "/pdpa/export", "/tor/{id}/corrections"]
    # Keep auth/sensitive throttles enabled. Dedicated regression tests cover these
    # routes; hammering them would only measure repeated 429s, not their logic.
    for role in (("anonymous", "user", "admin", "developer") if COMPLETE else ("anonymous", "user", "admin")):
        spec = copy.deepcopy(original)
        spec["servers"] = [{"url": "http://host.docker.internal:4301/api"}]
        for path in exclusions:
            spec["paths"].pop(path, None)
        identity = fixture["identities"]["user" if role == "anonymous" else role]
        for path, methods in spec["paths"].items():
            for operation in methods.values():
                for index, parameter in enumerate(operation.get("parameters", [])):
                    if parameter.get("$ref") == "#/components/parameters/id":
                        object_id = identity["bookmarkId"] if path.startswith("/bookmarks/") else identity["notificationId"] if path.startswith("/notifications/") else fixture["torId"]
                        operation["parameters"][index] = {"name": "id", "in": "path", "required": True, "schema": {"type": "string", "example": object_id}}
        serialized = json.dumps(spec).replace("000000000000000000000000", fixture["torId"])
        (SCAN / f"{role}.json").write_text(serialized)

    # Confirm protected handlers are actually reached with these credentials.
    preflight = []
    for role, identity in fixture["identities"].items():
        for path in ("/auth/me", "/tor/" + fixture["torId"], "/profile", "/admin/users"):
            request = urllib.request.Request("http://127.0.0.1:4301/api" + path, headers={"Authorization": "Bearer " + identity["token"]})
            try:
                response = urllib.request.urlopen(request)
                status = response.status
                response.close()
            except urllib.error.HTTPError as error:
                status = error.code
            expected = 403 if role == "user" and path == "/admin/users" else 200
            if status != expected:
                raise RuntimeError(f"Preflight {role} {path}: expected {expected}, got {status}")
            preflight.append({"role": role, "path": path, "status": status})
    REPORTS.mkdir(exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda kind: scan(kind, fixture), ["frontend", "user", "admin", "developer", "anonymous"] if COMPLETE else ["frontend", "user", "admin", "anonymous"]))
    all_finished = all(
        result["coverage"]["activeScans"] and
        all(scan["state"] == "FINISHED" and str(scan["progress"]) == "100" for scan in result["coverage"]["activeScans"]) and
        str(result["coverage"]["passiveRecordsRemaining"]) == "0"
        for result in results
    )
    manifest = {
        "baseRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "branch": subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT, text=True).strip(),
        "workingTreeChangesIncluded": True, "finishedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "image": IMAGE, "imageId": subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", IMAGE], text=True).strip(),
        "excludedActiveRoutes": exclusions, "preflight": preflight, "results": results,
        "allConfiguredActiveScansFinished": all_finished,
        "limitations": ["Synthetic sessions; real Google OAuth browser flow not tested", "Administrative writes, logout and deletion excluded from ZAP; endpoint-matrix/regression tests cover them", "Frontend ZAP full scan is unauthenticated; separate Firefox tests exercise signed-in screens and stored XSS", "No production deployment, external SMTP/AI or cloud IAM tests", "API rate limit raised only inside disposable fixture; sensitive/auth limits retained"],
    }
    (REPORTS / f"{PREFIX}-manifest.json").write_text(json.dumps(manifest, indent=2))
    if COMPLETE and not all_finished:
        raise RuntimeError("At least one configured scan did not finish; inspect coverage evidence")
    print("Reports saved in security/reports; exit 1/2 means findings, not a clean scan.", flush=True)
finally:
    for name in CONTAINERS:
        subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for process in reversed(PROCESSES):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    # Private logs retained for debugging, but remove live synthetic credentials.
    (WORK / "fixture.json").unlink(missing_ok=True)
    print("Temporary runtime stopped. Private logs: " + str(WORK), flush=True)

if COMPLETE:
    subprocess.run(["python3", str(ROOT / "security/zap/run-browser-isolated.py")], cwd=ROOT, check=True)
