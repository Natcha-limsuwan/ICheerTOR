"""Capture scanner completion, rather than treating exit code zero as coverage."""
import json
import os
from pathlib import Path


def zap_pre_shutdown(zap):
    evidence = {
        "activeScans": zap.ascan.scans,
        "spiderScans": zap.spider.scans,
        "passiveRecordsRemaining": zap.pscan.records_to_scan,
        "recordedUrls": len(zap.core.urls()),
    }
    log = Path("/home/zap/.ZAP/zap.log")
    if log.exists():
        messages = log.read_text(errors="replace").splitlines()
        evidence["browserExtensionWarnings"] = sum("Failed to configure ZAP extension" in line for line in messages)
        evidence["errorLines"] = [line for line in messages if " ERROR " in line][-20:]
    Path("/zap/wrk/" + os.environ["ZAP_EVIDENCE_NAME"] + "-coverage.json").write_text(json.dumps(evidence, indent=2))
