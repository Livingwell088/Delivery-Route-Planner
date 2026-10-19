"""Trust-boundary and restart tests; no Google calls or real addresses."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from delivery_router.api.app import create_app
from delivery_router.api.errors import ApiError
from delivery_router.api.location_validation import LocationValidation
from delivery_router.api.schemas import Address, AddressCandidate, AddressConfirmationRequest, AddressValidationResponse


RAW = "10 Example St Apt 2, Worcester, MA"


class Provider:
    def __init__(self):
        self.calls = 0

    def validate(self, address):
        self.calls += 1
        return AddressValidationResponse(is_valid=False, status="needs_selection", raw_address=address, unit="Apt 2", candidates=[
            AddressCandidate(candidate_id="a", place_id="place-a", normalized_address="10 Example St, Worcester, MA",
                             coordinates={"latitude": 42.26, "longitude": -71.8}, is_usable=True, requires_review=True),
            AddressCandidate(candidate_id="bad", place_id="street", normalized_address="Example St",
                             coordinates={"latitude": 42, "longitude": -71}, is_usable=False),
        ])


def confirmed(validation):
    lookup = validation.lookup(RAW, Provider().validate(RAW))
    return validation.confirm(AddressConfirmationRequest(address=RAW, lookup_reference=lookup.lookup_reference, candidate_id="a"))


def test_confirmation_retains_unit_and_survives_server_restart():
    address = confirmed(LocationValidation("test-secret"))
    assert address.unit == "Apt 2"
    assert address.raw_address == RAW
    assert address.validated_location.place_id == "place-a"
    assert address.formatted_address.endswith(" · Apt 2")
    assert LocationValidation("test-secret").resolve(address) == address
    with pytest.raises(ApiError):
        LocationValidation("rotated-secret").resolve(address)


@pytest.mark.parametrize("field,value", [
    ("raw_address", "11 Example St"), ("formatted_address", "Changed"),
    ("unit", "Apt 3"), ("coordinates", {"latitude": 1, "longitude": 2}),
])
def test_signed_reference_cannot_be_reused_for_changed_address(field, value):
    validation = LocationValidation("test")
    data = confirmed(validation).model_dump(mode="json")
    data[field] = value
    with pytest.raises(ApiError):
        validation.resolve(Address.model_validate(data))


@pytest.mark.parametrize("field,value", [("place_id", "fabricated"), ("validation_reference", "forged"),
                                         ("normalized_address", "Changed"), ("expires_at", "2030-01-01T00:00:00Z")])
def test_signed_location_metadata_cannot_be_changed(field, value):
    validation = LocationValidation("test")
    data = confirmed(validation).model_dump(mode="json")
    data["validated_location"][field] = value
    with pytest.raises(ApiError):
        validation.resolve(Address.model_validate(data))


def test_lookup_and_confirmation_expiration():
    now = datetime(2026, 10, 16, tzinfo=timezone.utc)
    validation = LocationValidation("test", clock=lambda: now)
    lookup = validation.lookup(RAW, Provider().validate(RAW))
    address = confirmed(validation)
    now += timedelta(minutes=15)
    with pytest.raises(ApiError):
        validation.confirm(AddressConfirmationRequest(address=RAW, lookup_reference=lookup.lookup_reference, candidate_id="a"))
    assert validation.resolve(address) == address
    now += timedelta(hours=8)
    with pytest.raises(ApiError):
        validation.resolve(address)


@pytest.mark.parametrize("address,candidate", [(RAW, "bad"), (RAW, "unknown"), ("Changed address", "a")])
def test_only_usable_candidate_from_bound_lookup_can_be_confirmed(address, candidate):
    validation = LocationValidation("test")
    lookup = validation.lookup(RAW, Provider().validate(RAW))
    with pytest.raises(ApiError):
        validation.confirm(AddressConfirmationRequest(address=address, lookup_reference=lookup.lookup_reference, candidate_id=candidate))


def test_tokens_cannot_be_used_as_the_wrong_kind():
    validation = LocationValidation("test")
    address = confirmed(validation)
    with pytest.raises(ApiError):
        validation.confirm(AddressConfirmationRequest(address=RAW, candidate_id="a", lookup_reference=address.validated_location.validation_reference))


def test_google_api_confirmation_and_gate_before_route_service():
    provider = Provider()
    class RouteSpy:
        calls = 0
        def optimize(self, request):
            self.calls += 1
            return {"ordered_stops": [], "total_drive_minutes": 0, "score": 0, "explanation": [],
                    "start": request.start, "departure_at": request.departure_at, "calculated_at": request.departure_at,
                    "return_drive_minutes": 0, "return_at": request.departure_at,
                    "route_mode": "optimized", "travel_time_basis": "traffic_unaware"}
    routes = RouteSpy()
    client = TestClient(create_app(google_api_key="test", address_service=provider, route_service=routes))
    lookup = client.post("/addresses/validate", json={"address": RAW}).json()
    assert lookup["lookup_reference"] and lookup["validated_location"] is None
    address = client.post("/addresses/confirm", json={"address": RAW, "lookup_reference": lookup["lookup_reference"], "candidate_id": "a"}).json()
    request = {"start": address, "orders": [{"order_id": "A", "address": address, "age_minutes": 10}]}
    assert client.post("/routes/optimize", json=request).status_code == 200
    assert routes.calls == 1 and provider.calls == 1
    request["start"] = {"formatted_address": RAW, "coordinates": {"latitude": 1, "longitude": 2}}
    assert client.post("/routes/optimize", json=request).status_code == 422
    assert routes.calls == 1
    assert client.post("/orders", json=request["orders"][0]).status_code == 201
    request["orders"][0]["address"]["unit"] = "Other unit"
    assert client.put("/orders/A", json={"address": request["orders"][0]["address"], "age_minutes": 11}).status_code == 422


def test_estimate_mode_cannot_issue_google_confirmation():
    response = TestClient(create_app()).post("/addresses/confirm", json={"address": RAW, "lookup_reference": "fake", "candidate_id": "a"})
    assert response.status_code == 503
