"""Fetch the pinned ontology compiler without changing the reference source."""

from pathlib import Path
import runpy
import subprocess
import tempfile


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
        download = Path(directory) / "robot.jar"
        subprocess.run(
            ["curl", "--fail", "--location", "--retry", "3", "--retry-max-time", "180",
             "--connect-timeout", "15", "--max-time", "120", "--max-filesize",
             str(tool["MAX_DOWNLOAD_BYTES"]), "--output", str(download), url],
            check=True,
            timeout=240,
        )
        verify(download)
        download.replace(destination)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    prepare_tool(root / "artifacts/reference/python")
