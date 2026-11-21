"""Run one deterministic partition of the complete upstream pytest collection."""

import hashlib
import sys


def shard_for(nodeid, total):
    return int.from_bytes(hashlib.sha256(nodeid.encode()).digest()[:8], "big") % total


class Partition:
    def __init__(self, index, total):
        if total != 4 or not 0 <= index < total:
            raise ValueError("Expected an upstream partition from 0 through 3")
        self.index = index
        self.total = total

    def pytest_collection_modifyitems(self, session, config, items):
        ids = [item.nodeid for item in items]
        if not ids or len(ids) != len(set(ids)):
            raise ValueError("Upstream test collection must be nonempty and unique")
        selected = [item for item in items if shard_for(item.nodeid, self.total) == self.index]
        deselected = [item for item in items if shard_for(item.nodeid, self.total) != self.index]
        config.hook.pytest_deselected(items=deselected)
        items[:] = selected


if __name__ == "__main__":
    import pytest

    if len(sys.argv) != 2 or sys.argv[1] not in {"0", "1", "2", "3"}:
        raise SystemExit("Use upstream-shards.py <0|1|2|3>")
    index = int(sys.argv[1])
    raise SystemExit(pytest.main([
        "artifacts/reference/python/test",
        f"--basetemp=artifacts/work/upstream-tests-{index}",
        "-o", f"cache_dir=artifacts/cache/pytest-upstream-{index}",
    ], plugins=[Partition(index, 4)]))
