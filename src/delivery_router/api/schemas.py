"""Public request and response models for the HTTP API."""

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator


NonEmptyString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ApiModel(BaseModel):
    """Shared strict-model configuration for API contracts."""

    model_config = ConfigDict(extra="forbid")


class Coordinates(ApiModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


ValidationStatus = Literal[
    "unvalidated", "needs_selection", "needs_confirmation", "validated", "invalid"
]


class AddressCandidate(ApiModel):
    """A provider result to review, not proof that an order is ready to route."""

    candidate_id: NonEmptyString
    provider: Literal["google"] = "google"
    normalized_address: NonEmptyString
    place_id: NonEmptyString
    coordinates: Coordinates
    street_number: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    location_type: str | None = None
    partial_match: bool = False
    warnings: list[str] = Field(default_factory=list)


class ValidatedLocation(ApiModel):
    """Backend-issued location snapshot; references must be verified server-side."""

    provider: Literal["google"] = "google"
    place_id: NonEmptyString
    coordinates: Coordinates
    normalized_address: NonEmptyString
    validation_reference: NonEmptyString
    validated_at: AwareDatetime
    expires_at: AwareDatetime

    @model_validator(mode="after")
    def require_positive_validity_window(self) -> "ValidatedLocation":
        if self.expires_at <= self.validated_at:
            raise ValueError("expires_at must be later than validated_at")
        return self


class Address(ApiModel):
    """Shared by drafts, orders, restaurant origins, and optimized stops.

    Legacy text/coordinates remain accepted during the Phase 7 migration.
    Client-supplied location metadata alone never establishes trusted validation.
    """

    formatted_address: NonEmptyString
    coordinates: Coordinates | None = None
    raw_address: NonEmptyString | None = None
    unit: NonEmptyString | None = None
    validated_location: ValidatedLocation | None = None


class AddressValidationRequest(ApiModel):
    address: NonEmptyString


class AddressValidationResponse(ApiModel):
    # Legacy is_valid means provider recognition, not driver confirmation.
    is_valid: bool
    normalized_address: str | None = None
    place_id: str | None = None
    coordinates: Coordinates | None = None
    warnings: list[str] = Field(default_factory=list)
    status: ValidationStatus = "unvalidated"
    raw_address: str | None = None
    unit: str | None = None
    candidates: list[AddressCandidate] = Field(default_factory=list)
    validated_location: ValidatedLocation | None = None

    @model_validator(mode="after")
    def require_location_for_validated_status(self) -> "AddressValidationResponse":
        if self.status == "validated" and (
            not self.is_valid or self.validated_location is None
        ):
            raise ValueError("validated status requires a recognized, confirmed location")
        if self.status == "invalid" and self.is_valid:
            raise ValueError("invalid status cannot have is_valid=true")
        return self


class OrderCreate(ApiModel):
    order_id: NonEmptyString
    address: Address
    age_minutes: int = Field(ge=0)


class OrderResponse(OrderCreate):
    pass


class OrderUpdate(ApiModel):
    address: Address
    age_minutes: int = Field(ge=0)


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
