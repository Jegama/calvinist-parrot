from __future__ import annotations

import hashlib
import json
from pathlib import Path


def test_all_recorded_target_hashes_match_final_files() -> None:
    package_root = Path(__file__).resolve().parents[1]
    provenance = json.loads(
        (package_root / "SOURCE_PROVENANCE.json").read_text(encoding="utf-8")
    )
    assert provenance["sourceCommit"] == (
        "4fc02cb2da2c7c8c51ac84558bf9f592cf2d0485"
    )
    for entry in provenance["files"]:
        target = package_root / entry["target"]
        assert target.is_file(), entry["target"]
        assert hashlib.sha256(target.read_bytes()).hexdigest() == entry[
            "targetSha256"
        ], entry["target"]
