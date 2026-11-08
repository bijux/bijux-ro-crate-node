"""Fetch the pinned ontology compiler without changing the reference source."""

from pathlib import Path
import json
import runpy
import subprocess
import tempfile


def download(url, destination, limit, accept=None):
    headers = ["--header", "Accept: " + accept] if accept else []
    subprocess.run(
        ["curl", "--fail", "--location", "--retry", "2", "--retry-max-time", "90",
         "--connect-timeout", "15", "--max-time", "90", "--max-filesize",
         str(limit), *headers, "--output", str(destination), url],
        check=True,
        timeout=150,
    )


def prepare_tool(reference):
    tool = runpy.run_path(str(reference / "scripts/ontology/check_ontology.py"))
    destination = tool["ROBOT_JAR"]
    verify = tool["verify_robot"]
    if destination.exists():
        verify(destination)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    url = (
        "https://github.com/ontodev/robot/releases/download/"
        f"v{tool['ROBOT_VERSION']}/robot.jar"
    )
    with tempfile.TemporaryDirectory(dir=destination.parent) as directory:
        candidate = Path(directory) / "robot.jar"
        try:
            download(url, candidate, tool["MAX_DOWNLOAD_BYTES"])
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            # GitHub serves release redirects and its public asset API through
            # different routes. Both must provide the same pinned bytes.
            metadata = Path(directory) / "release.json"
            download(f"https://api.github.com/repos/ontodev/robot/releases/tags/v{tool['ROBOT_VERSION']}",
                     metadata, 1024 * 1024, "application/vnd.github+json")
            assets = [asset for asset in json.loads(metadata.read_text())["assets"] if asset["name"] == "robot.jar"]
            if len(assets) != 1 or not 0 < assets[0]["size"] <= tool["MAX_DOWNLOAD_BYTES"]:
                raise ValueError("Expected one bounded ROBOT release asset")
            asset_id = int(assets[0]["id"])
            if asset_id <= 0:
                raise ValueError("Invalid ROBOT asset identifier")
            download(f"https://api.github.com/repos/ontodev/robot/releases/assets/{asset_id}",
                     candidate, tool["MAX_DOWNLOAD_BYTES"], "application/octet-stream")
        verify(candidate)
        candidate.replace(destination)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    prepare_tool(root / "artifacts/reference/python")
