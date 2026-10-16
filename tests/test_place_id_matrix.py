"""Directed Place-ID matrices and confirmation-to-route integration, without paid calls."""
from copy import deepcopy
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from delivery_router.api.app import create_app
from delivery_router.api.errors import ApiError
from delivery_router.api.google_maps import GoogleMapsClient, GoogleTravelMatrixService
from delivery_router.api.location_validation import LocationValidation
from delivery_router.api.schemas import Address, AddressCandidate, AddressConfirmationRequest, AddressValidationResponse
from delivery_router.api.services import RouteOptimizationService


def confirmed(label, place_id=None, unit=None):
    validation = LocationValidation("test-key")
    result = AddressValidationResponse(is_valid=True, status="needs_confirmation", unit=unit, candidates=[
        AddressCandidate(candidate_id="chosen", place_id=place_id or f"place-{label}",
                         normalized_address=f"Canonical {label}", coordinates={"latitude": 42, "longitude": -71},
                         is_usable=True, requires_review=False),
    ])
    lookup = validation.lookup(label, result)
    return validation.confirm(AddressConfirmationRequest(address=label, lookup_reference=lookup.lookup_reference, candidate_id="chosen"))


def cells(count=3):
    return [{"originIndex": i, "destinationIndex": j, "duration": f"{0 if i == j else (i * count + j + 1) * 60}s",
             "status": {}, "condition": "ROUTE_EXISTS"} for i in range(count) for j in range(count)]


def service_for(elements, captured=None):
    def handler(request):
        assert str(request.url) == GoogleMapsClient.matrix_url
        if captured is not None:
            captured.append(json.loads(request.content))
        return httpx.Response(200, json=elements)
    client = GoogleMapsClient("test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))
    return GoogleTravelMatrixService(client)


def locations():
    return {"start": confirmed("restaurant"), "A": confirmed("receipt A"), "B": confirmed("receipt B")}


def test_shuffled_directed_matrix_uses_only_place_ids_and_preserves_return_legs():
    captured = []
    matrix = service_for(list(reversed(cells())), captured).build(locations())
    assert captured == [{"origins": [{"waypoint": {"placeId": p}} for p in
                                     ["place-restaurant", "place-receipt A", "place-receipt B"]],
                         "destinations": [{"waypoint": {"placeId": p}} for p in
                                          ["place-restaurant", "place-receipt A", "place-receipt B"]],
                         "travelMode": "DRIVE", "routingPreference": "TRAFFIC_UNAWARE"}]
    assert matrix.travel_time("start", "A") == 2
    assert matrix.travel_time("A", "start") == 4
    assert matrix.travel_time("A", "B") == 6
    assert matrix.travel_time("B", "A") == 8
    assert matrix.travel_time("B", "start") == 7


@pytest.mark.parametrize("mutation", [
    lambda c: c.pop(1),  # Missing forward leg.
    lambda c: c.pop(6),  # Missing restaurant return leg.
    lambda c: c.append(deepcopy(c[1])),
    lambda c: c[1].update(originIndex=True),
    lambda c: c[1].update(destinationIndex="1"),
    lambda c: c[1].update(originIndex=-1),
    lambda c: c[1].update(destinationIndex=3),
    lambda c: c[1].update(status=[]),
    lambda c: c[1].update(status={"code": True}),
    lambda c: c.__setitem__(1, None),
])
def test_bad_or_incomplete_matrix_fails_closed(mutation):
    elements = cells()
    mutation(elements)
    with pytest.raises(ApiError) as caught:
        service_for(elements).build(locations())
    assert caught.value.code == "map_provider_unavailable"


@pytest.mark.parametrize("duration", [None, 12, "NaNs", "Infinitys", "-1s", "1e4s", "1.1234567890s", "315576000001s", "garbage", "60"])
def test_invalid_duration_is_structured_provider_error(duration):
    elements = cells()
    elements[1]["duration"] = duration
    with pytest.raises(ApiError) as caught:
        service_for(elements).build(locations())
    assert caught.value.status_code == 503


@pytest.mark.parametrize("duration,minutes", [("0s", 0), ("0.000000001s", 1), ("60s", 1), ("60.000000001s", 2), ("121s", 3)])
def test_seconds_round_up_without_inventing_time_for_zero_duration(duration, minutes):
    elements = cells()
    elements[1]["duration"] = duration
    assert service_for(elements).build(locations()).travel_time("start", "A") == minutes


@pytest.mark.parametrize("changes", [{"condition": "ROUTE_NOT_FOUND"}, {"status": {"code": 7}}, {"condition": "CONDITION_UNSPECIFIED"}])
def test_failed_pair_identifies_affected_orders(changes):
    elements = cells()
    elements[5].update(changes)
    with pytest.raises(ApiError) as caught:
        service_for(elements).build(locations())
    assert caught.value.code == "route_unavailable"
    assert caught.value.details == {"origin_id": "A", "destination_id": "B"}


def test_protobuf_zero_index_defaults_and_implicit_zero_diagonal():
    elements = cells(2)
    for element in elements:
        for field in ("originIndex", "destinationIndex"):
            if element[field] == 0:
                del element[field]
    matrix = service_for(elements).build({"start": confirmed("restaurant"), "A": confirmed("A")})
    assert matrix.travel_time("start", "A") == 2
    assert matrix.travel_time("A", "start") == 3
    assert matrix.travel_time("A", "A") == 0


def test_unconfirmed_location_rejected_before_google_request():
    captured = []
    with pytest.raises(ApiError) as caught:
        service_for(cells(2), captured).build({"start": confirmed("restaurant"), "A": Address(formatted_address="Legacy text")})
    assert caught.value.code == "location_review_required"
    assert captured == []


def test_api_preserves_selected_locations_units_and_shared_building_ids_without_regeocoding():
    captured = []
    class NoGeocoding:
        def validate(self, *args, **kwargs):
            pytest.fail("Optimization must not geocode confirmed text")
    route_service = RouteOptimizationService(matrix_service=service_for(cells(), captured),
                                            address_service=NoGeocoding(), location_validation=LocationValidation("test-key"))
    client = TestClient(create_app(google_api_key="test-key", address_service=NoGeocoding(), route_service=route_service))
    origin = confirmed("restaurant")
    first = confirmed("receipt A", place_id="shared-building", unit="Apt 1")
    second = confirmed("receipt B", place_id="shared-building", unit="Apt 2")
    response = client.post("/routes/optimize", json={"start": origin.model_dump(mode="json"), "orders": [
        {"order_id": key, "address": address.model_dump(mode="json"), "age_minutes": 10}
        for key, address in [("A", first), ("B", second)]
    ]})
    assert response.status_code == 200
    stops = {stop["order_id"]: stop["address"] for stop in response.json()["ordered_stops"]}
    assert stops == {"A": first.model_dump(mode="json"), "B": second.model_dump(mode="json")}
    assert len(captured) == 1
    assert [p["waypoint"]["placeId"] for p in captured[0]["origins"]] == ["place-restaurant", "shared-building", "shared-building"]
