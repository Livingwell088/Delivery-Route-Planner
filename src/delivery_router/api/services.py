"""Application services that adapt API data to the Phase 2 domain."""

from math import asin, cos, radians, sin, sqrt

from delivery_router.api.errors import ApiError
from delivery_router.api.schemas import (
    Address,
    AddressValidationResponse,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    OrderedStop,
)
from delivery_router.models import Order, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig
from delivery_router.strategies import compare_strategies


class AddressValidationService:
    """Local validation seam for a future geocoding provider."""

    def validate(self, address: str) -> AddressValidationResponse:
        normalized = " ".join(address.split())
        valid = len(normalized) >= 5 and any(char.isdigit() for char in normalized)
        warnings = [] if valid else ["Address must include a street number and name."]
        return AddressValidationResponse(
            is_valid=valid,
            normalized_address=normalized if valid else None,
            warnings=warnings,
            raw_address=address,
            status="unvalidated" if valid else "invalid",
        )


class CoordinateTravelMatrixService:
    """Deterministic development matrix based on straight-line distance."""

    average_speed_mph = 25.0
    road_distance_factor = 1.25

    def build(self, locations: dict[str, Address]) -> TravelTimeMatrix:
        missing = [key for key, value in locations.items() if value.coordinates is None]
        if missing:
            raise ApiError(
                422,
                "coordinates_required",
                "Coordinates are required until a map provider is configured",
                {"location_ids": missing},
            )

        times: dict[str, dict[str, int]] = {}
        for origin_id, origin in locations.items():
            times[origin_id] = {}
            for destination_id, destination in locations.items():
                if origin_id == destination_id:
                    continue
                miles = self._haversine_miles(origin, destination)
                minutes = round(miles * self.road_distance_factor / self.average_speed_mph * 60)
                times[origin_id][destination_id] = max(1, minutes)
        return TravelTimeMatrix(times)

    @staticmethod
    def _haversine_miles(origin: Address, destination: Address) -> float:
        assert origin.coordinates is not None and destination.coordinates is not None
        lat1, lon1 = map(radians, (origin.coordinates.latitude, origin.coordinates.longitude))
        lat2, lon2 = map(radians, (destination.coordinates.latitude, destination.coordinates.longitude))
        delta_lat, delta_lon = lat2 - lat1, lon2 - lon1
        value = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
        return 3958.8 * 2 * asin(sqrt(value))


class RouteOptimizationService:
    def __init__(
        self,
        matrix_service: CoordinateTravelMatrixService | None = None,
        address_service: AddressValidationService | None = None,
    ):
        self.matrix_service = matrix_service or CoordinateTravelMatrixService()
        self.address_service = address_service

    def optimize(self, request: OptimizeRouteRequest) -> OptimizeRouteResponse:
        start = self._resolve_address(request.start)
        address_by_order = {
            order.order_id: self._resolve_address(order.address)
            for order in request.orders
        }
        locations = {"start": start, **address_by_order}
        matrix = self.matrix_service.build(locations)
        orders = tuple(
            Order(order_id=order.order_id, stop_id=order.order_id, age_minutes=order.age_minutes)
            for order in request.orders
        )
        comparison = compare_strategies("start", orders, matrix, ScoringConfig())
        selected = comparison["age_aware"]
        shortest = comparison["shortest_route"]
        oldest = comparison["oldest_order_first"]

        stops = [
            OrderedStop(
                order_id=delivery.order.order_id,
                address=address_by_order[delivery.order.order_id],
                position=index,
                drive_minutes_from_start=delivery.elapsed_minutes,
                predicted_wait_minutes=delivery.wait_minutes,
                late_minutes=delivery.late_minutes,
            )
            for index, delivery in enumerate(selected.deliveries, start=1)
        ]
        explanation = [
            f"Selected order: {' -> '.join(selected.order_sequence)}.",
            f"Age-aware score {selected.score:.1f}; shortest-route score {shortest.score:.1f}; oldest-first score {oldest.score:.1f}.",
            f"The route predicts {selected.total_late_minutes} total minute(s) beyond the lateness threshold.",
        ]
        return OptimizeRouteResponse(
            ordered_stops=stops,
            total_drive_minutes=selected.total_driving_minutes,
            score=selected.score,
            explanation=explanation,
        )

    def _resolve_address(self, address: Address) -> Address:
        if self.address_service is None:
            return address
        result = self.address_service.validate(address.formatted_address)
        if not result.is_valid or result.normalized_address is None:
            raise ApiError(
                422,
                "address_not_found",
                "Google Maps could not confidently locate an address",
                {"address": address.formatted_address, "warnings": result.warnings},
            )
        return Address(
            formatted_address=result.normalized_address,
            coordinates=result.coordinates,
        )
