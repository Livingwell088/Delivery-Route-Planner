"""Tests for Google Maps adapters without making paid network requests."""

import httpx
import pytest

from delivery_router.api.errors import ApiError
from delivery_router.api.google_maps import (
    GoogleAddressValidationService,
    GoogleMapsClient,
    GoogleTravelMatrixService,
)
from delivery_router.api.schemas import Address


def mock_client(handler) -> GoogleMapsClient:
    return GoogleMapsClient(
        "test-key",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_google_geocoding_returns_canonical_address_and_coordinates() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["address"] == "455 Main St, Worcester, MA"
        assert request.url.params["key"] == "test-key"
        assert request.url.params["region"] == "us"
        assert request.url.params["components"] == "country:US"
        assert request.url.params["bounds"] == "42.20,-71.90|42.35,-71.70"
        return httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [
                    {
                        "formatted_address": "455 Main St, Worcester, MA 01608, USA",
                        "place_id": "google-place-a",
                        "types": ["street_address"],
                        "address_components": [
                            {"long_name": "455", "types": ["street_number"]},
                            {"long_name": "Main Street", "types": ["route"]},
                            {"long_name": "Worcester", "types": ["locality"]},
                            {"long_name": "Massachusetts", "short_name": "MA", "types": ["administrative_area_level_1"]},
                            {"long_name": "United States", "short_name": "US", "types": ["country"]},
                            {"long_name": "01608", "types": ["postal_code"]},
                        ],
                        "geometry": {
                            "location_type": "ROOFTOP",
                            "location": {"lat": 42.26315, "lng": -71.80165}
                        },
                    }
                ],
            },
        )

    service = GoogleAddressValidationService(mock_client(handler))
    result = service.validate("455 Main St, Worcester, MA")

    assert result.is_valid is True
    assert result.status == "needs_confirmation"
    assert result.raw_address == "455 Main St, Worcester, MA"
    assert result.validated_location is None
    assert result.place_id == "google-place-a"
    assert result.coordinates is not None
    assert result.coordinates.latitude == pytest.approx(42.26315)


def test_google_geocoding_returns_invalid_for_no_results() -> None:
    service = GoogleAddressValidationService(
        mock_client(lambda _request: httpx.Response(200, json={"status": "ZERO_RESULTS", "results": []}))
    )

    result = service.validate("not a real address")

    assert result.is_valid is False
    assert result.status == "invalid"
    assert result.warnings == ["Google Maps could not locate this address."]


def test_partial_google_match_still_requires_review_and_is_not_validated() -> None:
    service = GoogleAddressValidationService(mock_client(
        lambda _request: httpx.Response(200, json={
            "status": "OK",
            "results": [{
                "formatted_address": "10 Example Street, Worcester, MA",
                "place_id": "synthetic-place", "partial_match": True,
                "types": ["street_address"],
                "address_components": [
                    {"long_name": "10", "types": ["street_number"]},
                    {"long_name": "Example Street", "types": ["route"]},
                    {"long_name": "Worcester", "types": ["locality"]},
                    {"short_name": "MA", "types": ["administrative_area_level_1"]},
                    {"short_name": "US", "types": ["country"]},
                    {"long_name": "01608", "types": ["postal_code"]},
                ],
                "geometry": {"location_type": "ROOFTOP", "location": {"lat": 42.26, "lng": -71.80}},
            }],
        })
    ))
    result = service.validate("10 Example St, Worcester, MA")
    assert result.is_valid is False
    assert result.status == "needs_confirmation"
    assert result.validated_location is None
    assert result.warnings


def test_google_client_retries_temporary_provider_failure() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503)
        return httpx.Response(200, json={"status": "ZERO_RESULTS", "results": []})

    service = GoogleAddressValidationService(mock_client(handler))

    assert service.validate("10 Main St").is_valid is False
    assert calls == 2


def test_google_client_translates_forbidden_response() -> None:
    service = GoogleAddressValidationService(
        mock_client(lambda _request: httpx.Response(403))
    )

    with pytest.raises(ApiError) as caught:
        service.validate("10 Main St")

    assert caught.value.code == "map_provider_configuration_error"


def test_google_matrix_converts_route_seconds_to_complete_minute_matrix() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "test-key"
        assert request.headers["x-goog-fieldmask"].endswith("status,condition")
        payload = __import__("json").loads(request.content)
        assert payload["travelMode"] == "DRIVE"
        assert payload["origins"][0]["waypoint"]["address"] == "Restaurant"
        return httpx.Response(
            200,
            json=[
                {"originIndex": 0, "destinationIndex": 0, "duration": "0s", "condition": "ROUTE_EXISTS"},
                {"originIndex": 0, "destinationIndex": 1, "duration": "121s", "condition": "ROUTE_EXISTS"},
                {"originIndex": 1, "destinationIndex": 0, "duration": "180s", "condition": "ROUTE_EXISTS"},
                {"originIndex": 1, "destinationIndex": 1, "duration": "0s", "condition": "ROUTE_EXISTS"},
            ],
        )

    service = GoogleTravelMatrixService(mock_client(handler))
    matrix = service.build(
        {
            "start": Address(formatted_address="Restaurant"),
            "A": Address(formatted_address="Customer A"),
        }
    )

    assert matrix.travel_time("start", "A") == 3
    assert matrix.travel_time("A", "start") == 3


def test_google_matrix_translates_unroutable_pair_to_api_error() -> None:
    elements = [
        {"originIndex": 0, "destinationIndex": 0, "duration": "0s", "condition": "ROUTE_EXISTS"},
        {"originIndex": 0, "destinationIndex": 1, "condition": "ROUTE_NOT_FOUND"},
        {"originIndex": 1, "destinationIndex": 0, "duration": "60s", "condition": "ROUTE_EXISTS"},
        {"originIndex": 1, "destinationIndex": 1, "duration": "0s", "condition": "ROUTE_EXISTS"},
    ]
    service = GoogleTravelMatrixService(
        mock_client(lambda _request: httpx.Response(200, json=elements))
    )

    with pytest.raises(ApiError) as caught:
        service.build(
            {
                "start": Address(formatted_address="Restaurant"),
                "A": Address(formatted_address="Customer A"),
            }
        )

    assert caught.value.code == "route_unavailable"
