"""Google Maps adapters for geocoding and road travel-time matrices."""

from math import ceil
import logging
import time
from typing import Any

import httpx

from delivery_router.api.errors import ApiError
from delivery_router.api.schemas import Address, AddressValidationResponse, Coordinates
from delivery_router.models import TravelTimeMatrix

logger = logging.getLogger("delivery_router.api.google_maps")


class GoogleMapsClient:
    """Shared authenticated HTTP client for Google Maps web services."""

    geocoding_url = "https://maps.googleapis.com/maps/api/geocode/json"
    matrix_url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"

    def __init__(
        self,
        api_key: str,
        client: httpx.Client | None = None,
        timeout_seconds: float = 10.0,
        geocoding_region: str = "us",
        geocoding_components: str = (
            "country:US|administrative_area:MA|locality:Worcester"
        ),
        geocoding_bounds: str = "42.20,-71.90|42.35,-71.70",
        max_attempts: int = 2,
    ) -> None:
        if not api_key.strip():
            raise ValueError("Google Maps API key cannot be empty")
        self.api_key = api_key
        self.client = client or httpx.Client(timeout=timeout_seconds)
        self.geocoding_region = geocoding_region
        self.geocoding_components = geocoding_components
        self.geocoding_bounds = geocoding_bounds
        self.max_attempts = max_attempts

    def request_geocode(self, address: str) -> dict[str, Any]:
        response = self._request(
            "geocoding",
            lambda: self.client.get(
                self.geocoding_url,
                params={
                    "address": address,
                    "key": self.api_key,
                    "region": self.geocoding_region,
                    "components": self.geocoding_components,
                    "bounds": self.geocoding_bounds,
                },
            ),
        )
        try:
            return response.json()
        except ValueError as exc:
            raise _provider_unavailable() from exc

    def request_matrix(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        response = self._request(
            "route_matrix",
            lambda: self.client.post(
                self.matrix_url,
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": self.api_key,
                    "X-Goog-FieldMask": (
                        "originIndex,destinationIndex,duration,status,condition"
                    ),
                },
                json=payload,
            ),
        )
        try:
            value = response.json()
            if not isinstance(value, list):
                raise ValueError("matrix response must be a list")
            return value
        except ValueError as exc:
            raise _provider_unavailable() from exc

    def _request(self, operation: str, send: Any) -> httpx.Response:
        started = time.perf_counter()
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = send()
                if response.status_code in {401, 403}:
                    raise ApiError(
                        503,
                        "map_provider_configuration_error",
                        "Google Maps rejected the backend credentials or configuration",
                    )
                if response.status_code == 429:
                    if attempt == self.max_attempts:
                        raise ApiError(
                            503,
                            "map_provider_rate_limited",
                            "Google Maps quota is temporarily unavailable",
                        )
                    continue
                if response.status_code >= 500:
                    if attempt < self.max_attempts:
                        continue
                    raise _provider_unavailable()
                response.raise_for_status()
                logger.info(
                    "google_request_complete operation=%s status=%s attempts=%s duration_ms=%.1f",
                    operation,
                    response.status_code,
                    attempt,
                    (time.perf_counter() - started) * 1000,
                )
                return response
            except ApiError:
                raise
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = exc
                if attempt == self.max_attempts:
                    break
            except httpx.HTTPError as exc:
                raise _provider_unavailable() from exc
        raise _provider_unavailable() from last_error


class GoogleAddressValidationService:
    """Resolve an address to Google's canonical address, Place ID, and coordinates."""

    def __init__(self, client: GoogleMapsClient) -> None:
        self.client = client

    def validate(self, address: str) -> AddressValidationResponse:
        normalized = " ".join(address.split())
        payload = self.client.request_geocode(normalized)
        provider_status = payload.get("status")
        if provider_status == "ZERO_RESULTS":
            return AddressValidationResponse(
                is_valid=False,
                warnings=["Google Maps could not locate this address."],
            )
        if provider_status != "OK":
            _raise_geocoding_error(provider_status, payload.get("error_message"))

        results = payload.get("results", [])
        if not results:
            raise _provider_unavailable()
        result = results[0]
        location = result["geometry"]["location"]
        partial_match = bool(result.get("partial_match"))
        warnings = (
            ["Google Maps returned a partial match; confirm it before routing."]
            if partial_match
            else []
        )
        return AddressValidationResponse(
            is_valid=not partial_match,
            normalized_address=result["formatted_address"],
            place_id=result["place_id"],
            coordinates=Coordinates(
                latitude=location["lat"], longitude=location["lng"]
            ),
            warnings=warnings,
        )


class GoogleTravelMatrixService:
    """Build a Phase 2 matrix using real Google road durations."""

    def __init__(self, client: GoogleMapsClient) -> None:
        self.client = client

    def build(self, locations: dict[str, Address]) -> TravelTimeMatrix:
        location_ids = list(locations)
        waypoints = [
            {"waypoint": {"address": locations[location_id].formatted_address}}
            for location_id in location_ids
        ]
        elements = self.client.request_matrix(
            {
                "origins": waypoints,
                "destinations": waypoints,
                "travelMode": "DRIVE",
            }
        )

        times: dict[str, dict[str, int]] = {location_id: {} for location_id in location_ids}
        for element in elements:
            origin_index = element.get("originIndex")
            destination_index = element.get("destinationIndex")
            if not isinstance(origin_index, int) or not isinstance(destination_index, int):
                raise _provider_unavailable()
            if not (0 <= origin_index < len(location_ids)) or not (
                0 <= destination_index < len(location_ids)
            ):
                raise _provider_unavailable()
            if origin_index == destination_index:
                continue
            provider_status = element.get("status") or {}
            if (
                element.get("condition") != "ROUTE_EXISTS"
                or provider_status.get("code", 0) != 0
            ):
                raise ApiError(
                    422,
                    "route_unavailable",
                    "Google Maps could not find a drivable route between two locations",
                    {
                        "origin_id": location_ids[origin_index],
                        "destination_id": location_ids[destination_index],
                    },
                )
            duration = element.get("duration")
            if not isinstance(duration, str) or not duration.endswith("s"):
                raise _provider_unavailable()
            seconds = float(duration[:-1])
            times[location_ids[origin_index]][location_ids[destination_index]] = max(
                1, ceil(seconds / 60)
            )

        for origin in location_ids:
            for destination in location_ids:
                if origin != destination and destination not in times[origin]:
                    raise _provider_unavailable()
        return TravelTimeMatrix(times)


def _raise_geocoding_error(status: object, message: object) -> None:
    if status in {"OVER_DAILY_LIMIT", "OVER_QUERY_LIMIT"}:
        raise ApiError(503, "map_provider_rate_limited", "Google Maps quota is unavailable")
    if status in {"REQUEST_DENIED", "INVALID_REQUEST"}:
        raise ApiError(
            503,
            "map_provider_configuration_error",
            "Google Maps rejected the backend request",
        )
    raise _provider_unavailable()


def _provider_unavailable() -> ApiError:
    return ApiError(
        503,
        "map_provider_unavailable",
        "Google Maps is temporarily unavailable",
    )
