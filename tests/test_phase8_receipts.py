"""Actual mobile receipt transactions against HTTP, with no live Google transport."""
import os
import shutil
import subprocess

import pytest

from tests.test_phase7_acceptance import ROOT, running_backend


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for cross-stack acceptance")
def test_mobile_receipt_replacement_and_restore(tmp_path):
    calls = []
    with running_backend(tmp_path / "receipts.sqlite3", calls) as url:
        result = subprocess.run([shutil.which("node"), str(ROOT / "mobile/scripts/phase8-receipts.mjs")],
            env=dict(os.environ, EXPO_PUBLIC_API_URL=url, PHASE8_RECEIPTS="mock-provider"),
            capture_output=True, text=True, timeout=20)
        assert result.returncode == 0, result.stdout + result.stderr
        assert "PASS:" in result.stdout
    assert calls.count("geocoding") == 6 and calls.count("matrix") == 2
