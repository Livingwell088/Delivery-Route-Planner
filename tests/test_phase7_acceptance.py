"""Actual mobile service modules -> HTTP -> backend -> mocked Google -> storage/restart."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
from threading import Thread
import time

import httpx
import pytest
import uvicorn

from delivery_router.api.app import create_app
from delivery_router.api.settings import Settings


ROOT = Path(__file__).resolve().parents[1]


def google_result(number, suffix=""):
    return {"formatted_address": f"{number} Example St, Worcester, MA 01608, USA",
            "place_id": f"synthetic-{number}{suffix}", "types": ["street_address"],
            "geometry": {"location_type": "ROOFTOP", "location": {"lat": 42.26, "lng": -71.8}},
            "address_components": [
                {"long_name": str(number), "types": ["street_number"]},
                {"long_name": "Example Street", "types": ["route"]},
                {"long_name": "Worcester", "types": ["locality"]},
                {"long_name": "Massachusetts", "short_name": "MA", "types": ["administrative_area_level_1"]},
                {"long_name": "United States", "short_name": "US", "types": ["country"]},
                {"long_name": "01608", "types": ["postal_code"]},
            ]}


@contextmanager
def running_backend(database, calls, limit=5):
    settings = Settings(_env_file=None, map_provider="google", google_maps_api_key="synthetic-acceptance-key",
                        google_maps_usage_db=str(database), google_maps_monthly_limit_usd=limit)
    app = create_app(settings=settings)
    def google(request):
        if request.url.host == "maps.googleapis.com":
            calls.append("geocoding")
            number = int(request.url.params["address"].split()[0])
            results = [] if number == 99 else [google_result(number)]
            if number == 40:
                results.append(google_result(number, "-alternative"))
            return httpx.Response(200, json={"status": "OK" if results else "ZERO_RESULTS", "results": results})
        assert request.url.host == "routes.googleapis.com"
        calls.append("matrix")
        payload = json.loads(request.content)
        ids = [value["waypoint"]["placeId"] for value in payload["origins"]]
        assert ids == ["synthetic-30", "synthetic-10", "synthetic-20", "synthetic-40-alternative"]
        assert payload["origins"] == payload["destinations"]
        return httpx.Response(200, json=[
            {"originIndex": i, "destinationIndex": j, "duration": f"{0 if i == j else 60 + i * 70 + j * 30}s",
             "status": {}, "condition": "ROUTE_EXISTS"} for i in range(4) for j in range(4)
        ][::-1])
    original = app.state.address_service.client.client
    transport = httpx.Client(transport=httpx.MockTransport(google))
    app.state.address_service.client.client = transport
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
    thread = Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 5
        while not server.started and time.monotonic() < deadline:
            time.sleep(.01)
        assert server.started, "Acceptance backend did not start"
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        sock.close()
        transport.close()
        original.close()
        assert not thread.is_alive(), "Acceptance backend did not stop"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for cross-stack acceptance")
def test_mobile_delivery_flow_survives_restart_and_enforces_usage_limit(tmp_path):
    database = tmp_path / "usage.sqlite3"
    session = tmp_path / "session.json"
    calls = []
    for phase, limit in [("prepare", 5), ("resume", 5), ("blocked", 0)]:
        with running_backend(database, calls, limit) as url:
            environment = dict(os.environ, EXPO_PUBLIC_API_URL=url, PHASE7_ACCEPTANCE="mock-provider")
            result = subprocess.run([shutil.which("node"), str(ROOT / "mobile/scripts/phase7-acceptance.mjs"), phase, str(session)],
                                    env=environment, capture_output=True, text=True, timeout=20)
            assert result.returncode == 0, result.stdout + result.stderr
            assert "PASS:" in result.stdout
    assert calls.count("geocoding") == 5
    assert calls.count("matrix") == 2
