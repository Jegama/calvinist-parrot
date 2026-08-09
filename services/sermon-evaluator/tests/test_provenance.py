from __future__ import annotations

import json
from pathlib import Path


def test_initial_transfer_provenance_remains_well_formed() -> None:
    package_root = Path(__file__).resolve().parents[1]
    provenance = json.loads(
        (package_root / "SOURCE_PROVENANCE.json").read_text(encoding="utf-8")
    )
    assert provenance["sourceCommit"] == (
        "4fc02cb2da2c7c8c51ac84558bf9f592cf2d0485"
    )
    assert provenance["currentRubricVersion"] == "sermon-rubric-v2"
    for entry in provenance["files"]:
        target = package_root / entry["target"]
        if entry.get("retiredInRubricVersion"):
            assert not target.exists(), entry["target"]
        else:
            assert target.is_file(), entry["target"]
        assert len(entry["sourceSha256"]) == 64
        assert len(entry["targetSha256"]) == 64
