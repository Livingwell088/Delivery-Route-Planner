"""Authoritative route clocks and fixed-sequence evaluation with mocked Google only."""

from copy import deepcopy
from datetime import datetime, timedelta
import json
import os
import shutil
import subprocess

import httpx
import pytest
from fastapi.testclient import TestClient

from delivery_router.api.app import create_app
from delivery_router.api.google_maps import GoogleMapsClient, GoogleTravelMatrixService
from delivery_router.api.location_validation import LocationValidation
from delivery_router.api.map_usage import MapUsage
from delivery_router.api.schemas import AddressCandidate, AddressConfirmationRequest, AddressValidationResponse
from delivery_router.api.services import RouteOptimizationService


KEY = "phase8-test-only"
DEPARTURE = "2026-10-19T22:00:00Z"


def confirmed(validation, label, unit=None):
    result = AddressValidationResponse(is_valid=True, status="needs_confirmation", unit=unit, candidates=[
        AddressCandidate(candidate_id="chosen", place_id=f"place-{label}", normalized_address=f"10 {label} St",
                         coordinates={"latitude": 42, "longitude": -71}, is_usable=True, requires_review=False),
    ])
    lookup = validation.lookup(label, result)
    return validation.confirm(AddressConfirmationRequest(
        address=label, lookup_reference=lookup.lookup_reference, candidate_id="chosen",
    )).model_dump(mode="json")


def setup_api(tmp_path, monthly_limit=5, matrix_minutes=None):
    usage = MapUsage(tmp_path / "usage.sqlite3", monthly_limit_usd=monthly_limit)
    calls = []
    # Deliberately asymmetric: R-A-B-R = 24; R-B-A-R = 22.
    minutes = matrix_minutes if matrix_minutes is not None else [[0, 8, 3], [7, 0, 6], [10, 12, 0]]

    def transport(request):
        assert str(request.url) == GoogleMapsClient.matrix_url
        calls.append(json.loads(request.content))
        return httpx.Response(200, json=[
            {"originIndex": i, "destinationIndex": j, "duration": f"{minutes[i][j] * 60}s",
             "status": {}, "condition": "ROUTE_EXISTS"}
            for i in range(len(minutes)) for j in range(len(minutes))
        ])

    class NoGeocoding:
        def validate(self, *args, **kwargs):
            pytest.fail("Confirmed route requests must not geocode again")

    validation = LocationValidation(KEY)
    matrix = GoogleTravelMatrixService(GoogleMapsClient(KEY, usage=usage, max_attempts=1,
        client=httpx.Client(transport=httpx.MockTransport(transport))))
    service = RouteOptimizationService(matrix_service=matrix, location_validation=validation)
    client = TestClient(create_app(google_api_key=KEY, address_service=NoGeocoding(), route_service=service))
    payload = {
        "start": confirmed(validation, "Restaurant"), "departure_at": DEPARTURE,
        "orders": [
            {"order_id": "A", "address": confirmed(validation, "A", "Apt 2"), "placed_at": "2026-10-19T21:30:00Z"},
            {"order_id": "B", "address": confirmed(validation, "B", "Suite 3"), "placed_at": "2026-10-19T21:45:00Z"},
        ], "sequence": ["A", "B"],
    }
    return client, payload, calls, usage


def instant(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def test_exact_sequence_arrival_age_return_and_unchanged_address_snapshots(tmp_path):
    client, payload, calls, usage = setup_api(tmp_path)
    original = deepcopy(payload)
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    a, b = body["ordered_stops"]
    assert [a["order_id"], b["order_id"]] == ["A", "B"]
    assert [a["drive_minutes_from_previous_stop"], b["drive_minutes_from_previous_stop"]] == [8, 6]
    assert [a["drive_minutes_from_start"], b["drive_minutes_from_start"]] == [8, 14]
    assert [instant(a["arrival_at"]), instant(b["arrival_at"])] == [
        instant("2026-10-19T22:08:00Z"), instant("2026-10-19T22:14:00Z")]
    assert [a["predicted_order_age_minutes"], b["predicted_order_age_minutes"]] == [38, 29]
    assert [a["predicted_wait_minutes"], b["predicted_wait_minutes"]] == [38, 29]
    assert [a["age_basis"], b["age_basis"]] == ["placed_at", "placed_at"]
    assert body["total_drive_minutes"] == 24 and body["return_drive_minutes"] == 10
    assert instant(body["return_at"]) == instant("2026-10-19T22:24:00Z")
    assert body["route_mode"] == "evaluated" and body["travel_time_basis"] == "traffic_unaware"
    assert body["stop_service_minutes"] == 0 and body["score"] == 91
    assert body["start"] == payload["start"]
    for stop, order in zip(body["ordered_stops"], payload["orders"]):
        assert stop["address"] == order["address"]
        assert instant(stop["placed_at"]) == instant(order["placed_at"])
    assert len(calls) == 1 and calls[0]["routingPreference"] == "TRAFFIC_UNAWARE"
    assert [item["waypoint"]["placeId"] for item in calls[0]["origins"]] == ["place-Restaurant", "place-A", "place-B"]
    assert usage.snapshot()["reserved_units"] == {"geocoding": 0, "route_matrix": 9}
    assert payload == original


def test_reverse_sequence_uses_directed_legs_and_each_recalculation_reserves_a_fresh_matrix(tmp_path):
    client, payload, calls, usage = setup_api(tmp_path)
    client.post("/routes/evaluate", json=payload)
    payload["sequence"] = ["B", "A"]
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert [s["order_id"] for s in body["ordered_stops"]] == ["B", "A"]
    assert [s["drive_minutes_from_previous_stop"] for s in body["ordered_stops"]] == [3, 12]
    assert [s["predicted_order_age_minutes"] for s in body["ordered_stops"]] == [18, 45]
    assert body["total_drive_minutes"] == 22 and body["return_drive_minutes"] == 7
    assert instant(body["return_at"]) == instant("2026-10-19T22:22:00Z")
    assert len(calls) == 2 and usage.snapshot()["reserved_units"]["route_matrix"] == 18


@pytest.mark.parametrize("outbound,return_leg", [(8, 10), (0, 0)])
def test_one_stop_and_zero_duration_do_not_duplicate_or_invent_return_time(tmp_path, outbound, return_leg):
    client, payload, _, usage = setup_api(tmp_path, matrix_minutes=[[0, outbound], [return_leg, 0]])
    payload["orders"] = payload["orders"][:1]
    payload["sequence"] = ["A"]
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["ordered_stops"][0]["drive_minutes_from_start"] == outbound
    assert body["ordered_stops"][0]["predicted_order_age_minutes"] == 30 + outbound
    assert body["total_drive_minutes"] == outbound + return_leg
    assert instant(body["return_at"]) == instant(DEPARTURE) + timedelta(minutes=outbound + return_leg)
    assert usage.snapshot()["reserved_units"]["route_matrix"] == 4


def test_explicit_optimization_may_choose_a_different_sequence_with_same_timing_contract(tmp_path):
    client, payload, calls, _ = setup_api(tmp_path)
    del payload["sequence"]
    body = client.post("/routes/optimize", json=payload).json()
    assert body["route_mode"] == "optimized"
    assert [s["order_id"] for s in body["ordered_stops"]] == ["B", "A"]
    assert body["total_drive_minutes"] == 22 and body["score"] == 85
    assert len(calls) == 1


@pytest.mark.parametrize("sequence", [[], ["A"], ["A", "A"], ["A", "unknown"], ["A", "B", "B"], None])
def test_invalid_sequences_rejected_before_provider_or_usage(tmp_path, sequence):
    client, payload, calls, usage = setup_api(tmp_path)
    payload["sequence"] = sequence
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert calls == [] and usage.snapshot()["reserved_units"]["route_matrix"] == 0


@pytest.mark.parametrize("change", [
    "missing-time", "future-time", "naive-placed", "naive-departure", "age-mismatch", "negative-age", "duplicate-id", "too-many",
])
def test_invalid_timing_and_order_inputs_rejected_before_provider(tmp_path, change):
    client, payload, calls, usage = setup_api(tmp_path)
    first = payload["orders"][0]
    if change == "missing-time":
        del first["placed_at"]
    elif change == "future-time":
        first["placed_at"] = "2026-10-19T22:00:00.001Z"
    elif change == "naive-placed":
        first["placed_at"] = "2026-10-19T21:30:00"
    elif change == "naive-departure":
        payload["departure_at"] = "2026-10-19T22:00:00"
    elif change == "age-mismatch":
        first["age_minutes"] = 29
    elif change == "negative-age":
        first["age_minutes"] = -1
    elif change == "duplicate-id":
        payload["orders"][1]["order_id"] = "A"
    elif change == "too-many":
        payload["orders"] = [{**deepcopy(first), "order_id": str(i)} for i in range(9)]
        payload["sequence"] = [str(i) for i in range(9)]
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 422
    assert calls == [] and usage.snapshot()["reserved_units"]["route_matrix"] == 0


@pytest.mark.parametrize("target", ["start", "order", "unit"])
def test_evaluation_has_same_signed_location_gate_as_optimization(tmp_path, target):
    client, payload, calls, usage = setup_api(tmp_path)
    if target == "start":
        payload["start"]["validated_location"] = None
    elif target == "order":
        payload["orders"][0]["address"]["validated_location"]["place_id"] = "tampered"
    else:
        payload["orders"][0]["address"]["unit"] = "Changed unit"
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 422 and response.json()["error"]["code"] == "location_review_required"
    assert calls == [] and usage.snapshot()["reserved_units"]["route_matrix"] == 0


@pytest.mark.parametrize("endpoint", ["optimize", "evaluate"])
def test_zero_allowance_prevents_both_modes_without_changing_inputs(tmp_path, endpoint):
    client, payload, calls, usage = setup_api(tmp_path, monthly_limit=0)
    if endpoint == "optimize":
        del payload["sequence"]
    original = deepcopy(payload)
    response = client.post(f"/routes/{endpoint}", json=payload)
    assert response.status_code == 503 and response.json()["error"]["code"] == "map_usage_limit_reached"
    assert calls == [] and usage.snapshot()["reserved_units"]["route_matrix"] == 0
    assert payload == original


def test_partial_minutes_are_floored_consistently_and_matching_legacy_age_is_accepted(tmp_path):
    client, payload, _, _ = setup_api(tmp_path)
    payload["orders"][0]["placed_at"] = "2026-10-19T21:30:15.250Z"
    payload["orders"][0]["age_minutes"] = 29
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 200
    stop = response.json()["ordered_stops"][0]
    assert stop["predicted_order_age_minutes"] == stop["predicted_wait_minutes"] == 37
    assert stop["late_minutes"] == 0


def test_legacy_age_only_request_gets_an_inferred_placed_time_and_explicit_basis(tmp_path):
    client, payload, _, _ = setup_api(tmp_path)
    for order, age in zip(payload["orders"], [30, 15]):
        del order["placed_at"]
        order["age_minutes"] = age
    del payload["departure_at"]
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 200
    body = response.json()
    departure = instant(body["departure_at"])
    for stop, age in zip(body["ordered_stops"], [30, 15]):
        assert stop["age_basis"] == "age_minutes"
        assert instant(stop["placed_at"]) == departure - timedelta(minutes=age)


@pytest.mark.parametrize("departure,expected_arrival", [
    ("2026-10-19T23:58:00-04:00", "2026-10-20T00:06:00-04:00"),
    ("2026-11-01T01:58:00-04:00", "2026-11-01T01:06:00-05:00"),
    ("2026-03-08T01:58:00-05:00", "2026-03-08T03:06:00-04:00"),
])
def test_absolute_instants_handle_midnight_and_eastern_dst(tmp_path, departure, expected_arrival):
    client, payload, _, _ = setup_api(tmp_path)
    payload["departure_at"] = departure
    for order in payload["orders"]:
        order["placed_at"] = (instant(departure) - timedelta(minutes=30)).isoformat()
    response = client.post("/routes/evaluate", json=payload)
    assert response.status_code == 200
    stop = response.json()["ordered_stops"][0]
    arrival = instant(stop["arrival_at"])
    assert arrival == instant(departure) + timedelta(minutes=8)
    assert arrival == instant(expected_arrival)
    assert stop["predicted_order_age_minutes"] == 38


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for cross-stack acceptance")
def test_mobile_fixed_sequence_timing_over_real_http(tmp_path):
    from tests.test_phase7_acceptance import ROOT, running_backend

    calls = []
    with running_backend(tmp_path / "cross-stack.sqlite3", calls) as url:
        result = subprocess.run([shutil.which("node"), str(ROOT / "mobile/scripts/phase8-timing.mjs")],
            env=dict(os.environ, EXPO_PUBLIC_API_URL=url, PHASE8_ACCEPTANCE="mock-provider"),
            capture_output=True, text=True, timeout=20)
        assert result.returncode == 0, result.stdout + result.stderr
        assert "PASS:" in result.stdout
    assert calls.count("geocoding") == 4 and calls.count("matrix") == 3
