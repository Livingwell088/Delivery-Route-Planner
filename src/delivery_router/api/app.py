"""FastAPI application factory and endpoints."""

import logging
import time
from collections.abc import Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response, status

from delivery_router.api.errors import ApiError, register_error_handlers
from delivery_router.api.google_maps import (
    GoogleAddressValidationService,
    GoogleMapsClient,
    GoogleTravelMatrixService,
)
from delivery_router.api.repositories import InMemoryOrderRepository
from delivery_router.api.location_validation import LocationValidation
from delivery_router.api.map_usage import MapUsage
from delivery_router.api.schemas import (
    Address,
    AddressConfirmationRequest,
    AddressValidationRequest,
    AddressValidationResponse,
    ErrorResponse,
    EvaluateRouteRequest,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    OrderCreate,
    OrderResponse,
    OrderUpdate,
)
from delivery_router.api.services import AddressValidationService, RouteOptimizationService
from delivery_router.api.settings import Settings

logger = logging.getLogger("delivery_router.api")


def create_app(
    repository: InMemoryOrderRepository | None = None,
    address_service: AddressValidationService | None = None,
    route_service: RouteOptimizationService | None = None,
    google_api_key: str | None = None,
    settings: Settings | None = None,
) -> FastAPI:
    settings = settings or Settings(
        _env_file=None,
        map_provider="google" if google_api_key is not None else "development",
        google_maps_api_key=google_api_key,
        google_maps_usage_db=":memory:",  # Explicit factory/test callers stay isolated.
    )
    configured_key = settings.google_maps_api_key
    google_api_key = configured_key.get_secret_value() if configured_key else None
    location_validation = LocationValidation(google_api_key) if google_api_key else None
    usage = None
    if settings.map_provider == "google":
        assert google_api_key is not None  # Settings rejects missing/blank credentials.
        usage = MapUsage(settings.google_maps_usage_db, settings.google_maps_monthly_limit_usd,
                         settings.google_maps_geocoding_daily_limit, settings.google_maps_matrix_daily_limit)
        google_client = GoogleMapsClient(
            google_api_key,
            timeout_seconds=settings.google_maps_timeout_seconds,
            geocoding_region=settings.google_maps_region,
            geocoding_components=settings.google_maps_components,
            geocoding_bounds=settings.google_maps_bounds,
            max_attempts=settings.google_maps_max_attempts,
            deadline_seconds=settings.google_maps_deadline_seconds,
            usage=usage,
        )
        address_service = address_service or GoogleAddressValidationService(google_client)
        route_service = route_service or RouteOptimizationService(
            matrix_service=GoogleTravelMatrixService(google_client),
            address_service=address_service,
            location_validation=location_validation,
        )
    app = FastAPI(title="Delivery Route Optimizer API", version="0.1.0")
    app.state.map_provider = settings.map_provider
    app.state.location_validation = location_validation
    app.state.map_usage = usage
    logger.info("map_provider_selected provider=%s", settings.map_provider)
    app.state.orders = repository or InMemoryOrderRepository()
    app.state.address_service = address_service or AddressValidationService()
    app.state.route_service = route_service or RouteOptimizationService()
    register_error_handlers(app)

    @app.middleware("http")
    async def log_request(request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("x-request-id", str(uuid4()))
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        logger.info(
            "request_complete method=%s path=%s status=%s duration_ms=%.1f request_id=%s",
            request.method, request.url.path, response.status_code,
            (time.perf_counter() - started) * 1000, request_id,
        )
        return response

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/maps/usage")
    def maps_usage() -> dict:
        return usage.snapshot() if usage else {"provider": "development", "tracking": False}

    @app.post("/addresses/validate", response_model=AddressValidationResponse)
    def validate_address(payload: AddressValidationRequest) -> AddressValidationResponse:
        if payload.context is not None:
            result = app.state.address_service.validate(payload.address, context=payload.context)
        else:
            result = app.state.address_service.validate(payload.address)
        return location_validation.lookup(payload.address, result) if location_validation else result

    @app.post("/addresses/confirm", response_model=Address)
    def confirm_address(payload: AddressConfirmationRequest) -> Address:
        if location_validation is None:
            raise ApiError(503, "map_provider_configuration_error", "Google address confirmation is unavailable in development estimate mode")
        return location_validation.confirm(payload)

    @app.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
    def create_order(payload: OrderCreate) -> OrderResponse:
        if location_validation:
            location_validation.resolve(payload.address)
        if app.state.orders.get(payload.order_id):
            raise ApiError(409, "order_exists", f"Order '{payload.order_id}' already exists")
        return app.state.orders.create(payload)

    @app.get("/orders", response_model=list[OrderResponse])
    def list_orders() -> list[OrderResponse]:
        return app.state.orders.list()

    @app.get("/orders/{order_id}", response_model=OrderResponse, responses={404: {"model": ErrorResponse}})
    def get_order(order_id: str) -> OrderResponse:
        order = app.state.orders.get(order_id)
        if order is None:
            raise ApiError(404, "order_not_found", f"Order '{order_id}' was not found")
        return order

    @app.put("/orders/{order_id}", response_model=OrderResponse, responses={404: {"model": ErrorResponse}})
    def update_order(order_id: str, payload: OrderUpdate) -> OrderResponse:
        if location_validation:
            location_validation.resolve(payload.address)
        order = app.state.orders.update(order_id, payload)
        if order is None:
            raise ApiError(404, "order_not_found", f"Order '{order_id}' was not found")
        return order

    @app.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_order(order_id: str) -> Response:
        if not app.state.orders.delete(order_id):
            raise ApiError(404, "order_not_found", f"Order '{order_id}' was not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    def verify_route_locations(payload: OptimizeRouteRequest) -> None:
        # Enforce the boundary even when a custom route service is injected.
        if location_validation:
            location_validation.resolve(payload.start)
            for order in payload.orders:
                location_validation.resolve(order.address)

    @app.post("/routes/optimize", response_model=OptimizeRouteResponse, responses={422: {"model": ErrorResponse}})
    def optimize_route(payload: OptimizeRouteRequest) -> OptimizeRouteResponse:
        verify_route_locations(payload)
        return app.state.route_service.optimize(payload)

    @app.post("/routes/evaluate", response_model=OptimizeRouteResponse, responses={422: {"model": ErrorResponse}})
    def evaluate_route(payload: EvaluateRouteRequest) -> OptimizeRouteResponse:
        verify_route_locations(payload)
        return app.state.route_service.evaluate(payload)

    return app


app = create_app(settings=Settings())
