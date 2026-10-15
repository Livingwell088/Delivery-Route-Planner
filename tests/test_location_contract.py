"""Contract and configuration checks for the Phase 7 migration boundary."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from delivery_router.api.app import create_app
from delivery_router.api.google_maps import GoogleAddressValidationService, GoogleTravelMatrixService
from delivery_router.api.schemas import (
    Address, AddressCandidate, AddressValidationResponse, ValidatedLocation,
)
from delivery_router.api.settings import Settings


def location_payload() -> dict:
    now = datetime.now(timezone.utc)
    return {
        "place_id": "synthetic-place-id",
        "coordinates": {"latitude": 42.26, "longitude": -71.80},
        "normalized_address": "10 Example St, Worcester, MA",
        "validation_reference": "synthetic-backend-reference",
        "validated_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=1)).isoformat(),
    }


def test_legacy_address_does_not_claim_validated_location() -> None:
    address = Address(formatted_address="10 Example St")
    assert address.validated_location is None


def test_order_round_trip_preserves_original_unit_and_location() -> None:
    client = TestClient(create_app())
    payload = {
        "order_id": "contract-test", "age_minutes": 20,
        "address": {
            "formatted_address": "10 Example St, Worcester, MA",
            "raw_address": "10 Example St Apt 2, Worcester, MA",
            "unit": "Apt 2", "validated_location": location_payload(),
        },
    }
    created = client.post("/orders", json=payload)
    assert created.status_code == 201
    saved = client.get("/orders/contract-test").json()["address"]
    assert saved["raw_address"] == payload["address"]["raw_address"]
    assert saved["unit"] == "Apt 2"
    assert saved["validated_location"]["place_id"] == "synthetic-place-id"
    assert saved["validated_location"]["validation_reference"] == "synthetic-backend-reference"


@pytest.mark.parametrize("field", ["place_id", "validation_reference", "normalized_address"])
def test_validated_location_rejects_blank_identity(field) -> None:
    payload = location_payload()
    payload[field] = "  "
    with pytest.raises(ValidationError):
        ValidatedLocation(**payload)


def test_location_requires_timezone_and_positive_expiry_window() -> None:
    payload = location_payload()
    payload["expires_at"] = payload["validated_at"]
    with pytest.raises(ValidationError, match="later than"):
        ValidatedLocation(**payload)
    payload = location_payload()
    payload["validated_at"] = "2026-10-15T12:00:00"
    with pytest.raises(ValidationError):
        ValidatedLocation(**payload)


def test_coordinates_must_be_finite() -> None:
    payload = location_payload()
    payload["coordinates"]["latitude"] = float("nan")
    with pytest.raises(ValidationError):
        ValidatedLocation(**payload)


def test_provider_recognition_is_not_confirmed_validation() -> None:
    with pytest.raises(ValidationError, match="confirmed location"):
        AddressValidationResponse(is_valid=True, status="validated")
    response = AddressValidationResponse(
        is_valid=True, status="validated", validated_location=location_payload(),
    )
    assert response.validated_location is not None


def test_candidate_contains_components_without_conferring_validation() -> None:
    candidate = AddressCandidate(
        candidate_id="candidate-1", place_id="synthetic-place-id",
        coordinates={"latitude": 42.26, "longitude": -71.80},
        normalized_address="10 Example St, Worcester, MA", city="Worcester",
        partial_match=True, warnings=["Confirm street number"],
    )
    response = AddressValidationResponse(
        is_valid=False, status="needs_selection", candidates=[candidate], unit="Apt 2",
    )
    assert response.validated_location is None
    assert response.candidates[0].partial_match is True


def test_google_mode_wires_real_adapters_without_network_calls() -> None:
    app = create_app(settings=Settings(
        _env_file=None, app_environment="production", map_provider="google",
        google_maps_api_key="synthetic-test-key",
    ))
    assert app.state.map_provider == "google"
    assert isinstance(app.state.address_service, GoogleAddressValidationService)
    assert isinstance(app.state.route_service.matrix_service, GoogleTravelMatrixService)


def test_google_factory_argument_cannot_fall_back_on_empty_key() -> None:
    with pytest.raises(ValidationError, match="requires GOOGLE_MAPS_API_KEY"):
        create_app(google_api_key="")
