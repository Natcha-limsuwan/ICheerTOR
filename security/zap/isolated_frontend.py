"""Build an env-free frontend copy so tests cannot reuse the user's app build."""
import os
from pathlib import Path
import shutil
import subprocess


def test_environment():
    environment = {key: os.environ[key] for key in ("PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL") if key in os.environ}
    environment.update(NODE_ENV="production", NEXT_TELEMETRY_DISABLED="1", NEXT_PUBLIC_API_URL="http://host.docker.internal:4301/api")
    return environment


def prepare_frontend(root: Path, work: Path):
    target = work / "frontend"
    shutil.copytree(root / "frontend", target, ignore=shutil.ignore_patterns("node_modules", ".next", ".env*", "*.tsbuildinfo", "*.log", ".DS_Store"))
    (target / "node_modules").symlink_to(root / "frontend/node_modules", target_is_directory=True)
    assert not list(target.glob(".env*")), "Real frontend environment files must not enter the fixture"
    with (work / "frontend-build.log").open("w") as output:
        subprocess.run(["npm", "run", "build", "--", "--webpack"], cwd=target, env=test_environment(), stdout=output, stderr=subprocess.STDOUT, check=True, timeout=300)
    return target
