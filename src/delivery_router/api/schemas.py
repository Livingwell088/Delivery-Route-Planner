"""Public request and response models for the HTTP API."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


NonEmptyString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ApiModel(BaseModel):
    """Shared strict-model configuration for API contracts."""

    model_config = ConfigDict(extra="forbid")


class Coordinates(ApiModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class Address(ApiModel):
    """A user-confirmed address and its provider-independent coordinates."""

    formatted_address: NonEmptyString
    coordinates: Coordinates | None = None


class AddressValidationRequest(ApiModel):
    address: NonEmptyString


class AddressValidationResponse(ApiModel):
    is_valid: bool
    normalized_address: str | None = None
    place_id: str | None = None
    coordinates: Coordinates | None = None
    warnings: list[str] = Field(default_factory=list)


class OrderCreate(ApiModel):
    order_id: NonEmptyString
    address: Address
    age_minutes: int = Field(ge=0)


class OrderResponse(OrderCreate):
    pass


class RouteOrder(ApiModel):
    order_id: NonEmptyString
    address: Address
    age_minutes: int = Field(ge=0)


class OptimizeRouteRequest(ApiModel):
    start: Address
    orders: list[RouteOrder] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def require_unique_order_ids(self) -> "OptimizeRouteRequest":
        ids = [order.order_id for order in self.orders]
        if len(ids) != len(set(ids)):
            raise ValueError("order_id values must be unique")
        if "start" in ids:
            raise ValueError("order_id 'start' is reserved")
        return self


class OrderedStop(ApiModel):
    order_id: str
    address: Address
    position: int
    drive_minutes_from_start: int
    predicted_wait_minutes: int
    late_minutes: int


class OptimizeRouteResponse(ApiModel):
    ordered_stops: list[OrderedStop]
    total_drive_minutes: int
    score: float
    explanation: list[str]


class ErrorDetail(ApiModel):
    code: str
    message: str
    details: object | None = None


class ErrorResponse(ApiModel):
    error: ErrorDetail
