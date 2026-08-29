"""FastAPI application factory and endpoints."""

import logging
import time
from collections.abc import Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response, status

from delivery_router.api.errors import ApiError, register_error_handlers
from delivery_router.api.repositories import InMemoryOrderRepository
from delivery_router.api.schemas import (
    AddressValidationRequest,
    AddressValidationResponse,
    ErrorResponse,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    OrderCreate,
    OrderResponse,
)
from delivery_router.api.services import AddressValidationService, RouteOptimizationService

logger = logging.getLogger("delivery_router.api")


def create_app(
    repository: InMemoryOrderRepository | None = None,
    address_service: AddressValidationService | None = None,
    route_service: RouteOptimizationService | None = None,
) -> FastAPI:
    app = FastAPI(title="Delivery Route Optimizer API", version="0.1.0")
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

    @app.post("/addresses/validate", response_model=AddressValidationResponse)
    def validate_address(payload: AddressValidationRequest) -> AddressValidationResponse:
        return app.state.address_service.validate(payload.address)

    @app.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
    def create_order(payload: OrderCreate) -> OrderResponse:
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

    @app.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_order(order_id: str) -> Response:
        if not app.state.orders.delete(order_id):
            raise ApiError(404, "order_not_found", f"Order '{order_id}' was not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/routes/optimize", response_model=OptimizeRouteResponse, responses={422: {"model": ErrorResponse}})
    def optimize_route(payload: OptimizeRouteRequest) -> OptimizeRouteResponse:
        return app.state.route_service.optimize(payload)

    return app


app = create_app()
