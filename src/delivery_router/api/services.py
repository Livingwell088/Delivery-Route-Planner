"""Application services that adapt API data to the Phase 2 domain."""

from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt

from delivery_router.api.errors import ApiError
from delivery_router.api.schemas import (
    Address,
    AddressContext,
    AddressValidationResponse,
    EvaluateRouteRequest,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    OrderedStop,
)
from delivery_router.models import Order, TravelTimeMatrix
from delivery_router.metrics import evaluate_route
from delivery_router.explanations import explain_driver_route
from delivery_router.scoring import ScoringConfig
from delivery_router.strategies import compare_strategies


class AddressValidationService:
    """Local validation seam for a future geocoding provider."""

    def validate(self, address: str, context: AddressContext | None = None) -> AddressValidationResponse:
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
    estimate_basis = "development_estimate"

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
        location_validation=None,
    ):
        self.matrix_service = matrix_service or CoordinateTravelMatrixService()
        self.address_service = address_service
        self.location_validation = location_validation

    def optimize(self, request: OptimizeRouteRequest) -> OptimizeRouteResponse:
        return self._calculate(request)

    def evaluate(self, request: EvaluateRouteRequest) -> OptimizeRouteResponse:
        return self._calculate(request, sequence=request.sequence)

    def _calculate(self, request: OptimizeRouteRequest, sequence: list[str] | None = None) -> OptimizeRouteResponse:
        departure = request.departure_at.astimezone(timezone.utc)
        placed_by_order = {
            order.order_id: order.placed_at.astimezone(timezone.utc) if order.placed_at is not None
            else departure - timedelta(minutes=order.age_minutes)
            for order in request.orders
        }
        start = self._resolve_address(request.start)
        address_by_order = {
            order.order_id: self._resolve_address(order.address)
            for order in request.orders
        }
        locations = {"start": start, **address_by_order}
        matrix = self.matrix_service.build(locations)
        orders = tuple(
            Order(order_id=order.order_id, stop_id=order.order_id,
                  age_minutes=(departure - placed_by_order[order.order_id]) // timedelta(minutes=1))
            for order in request.orders
        )
        if sequence is None:
            comparison = compare_strategies("start", orders, matrix, ScoringConfig())
            selected = comparison["age_aware"]
            explanation = explain_driver_route(selected, ScoringConfig(), comparison)
        else:
            by_id = {order.order_id: order for order in orders}
            selected = evaluate_route("start", tuple(by_id[key] for key in sequence), matrix, ScoringConfig())
            explanation = explain_driver_route(selected, ScoringConfig())

        try:
            arrivals = {delivery.order.order_id: departure + timedelta(minutes=delivery.elapsed_minutes)
                        for delivery in selected.deliveries}
            return_at = departure + timedelta(minutes=selected.total_driving_minutes)
        except OverflowError as exc:
            raise ApiError(422, "route_timing_out_of_range", "Route timing exceeds the supported timestamp range.") from exc
        age_basis = {order.order_id: "placed_at" if order.placed_at is not None else "age_minutes" for order in request.orders}

        stops = [
            OrderedStop(
                order_id=delivery.order.order_id,
                address=address_by_order[delivery.order.order_id],
                position=index,
                drive_minutes_from_start=delivery.elapsed_minutes,
                predicted_wait_minutes=delivery.wait_minutes,
                late_minutes=delivery.late_minutes,
                drive_minutes_from_previous_stop=delivery.elapsed_minutes - (
                    selected.deliveries[index - 2].elapsed_minutes if index > 1 else 0),
                placed_at=placed_by_order[delivery.order.order_id],
                arrival_at=arrivals[delivery.order.order_id],
                predicted_order_age_minutes=delivery.wait_minutes,
                age_basis=age_basis[delivery.order.order_id],
            )
            for index, delivery in enumerate(selected.deliveries, start=1)
        ]
        return OptimizeRouteResponse(
            ordered_stops=stops,
            total_drive_minutes=selected.total_driving_minutes,
            score=selected.score,
            explanation=explanation,
            start=start,
            departure_at=departure,
            calculated_at=datetime.now(timezone.utc),
            return_drive_minutes=selected.total_driving_minutes - selected.deliveries[-1].elapsed_minutes,
            return_at=return_at,
            route_mode="optimized" if sequence is None else "evaluated",
            travel_time_basis=getattr(self.matrix_service, "estimate_basis", "development_estimate"),
        )

    def _resolve_address(self, address: Address) -> Address:
        if self.location_validation is not None:
            return self.location_validation.resolve(address)
        if self.address_service is None:
            return address
        result = self.address_service.validate(address.formatted_address)
        if not result.is_valid or result.normalized_address is None:
            raise ApiError(
                422,
                "address_not_found",
                "Google Maps could not confidently locate an address",
                {"address": address.formatted_address, "warnings": result.warnings,
                 "status": result.status,
                 "candidates": [candidate.model_dump(mode="json") for candidate in result.candidates]},
            )
        unit = address.unit or result.unit
        formatted = result.normalized_address
        if unit:
            street, separator, remainder = formatted.partition(",")
            formatted = f"{street}, {unit}{separator}{remainder}"
        return Address(
            formatted_address=formatted,
            coordinates=result.coordinates,
            raw_address=address.raw_address or result.raw_address,
            unit=unit,
        )
