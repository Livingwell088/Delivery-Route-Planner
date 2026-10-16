"""Phase 3 HTTP API tests."""

from fastapi.testclient import TestClient

from delivery_router.api.app import create_app
from delivery_router.api.services import RouteOptimizationService
from delivery_router.models import TravelTimeMatrix


def address(name: str, latitude: float = 40.0, longitude: float = -75.0) -> dict:
    return {
        "formatted_address": name,
        "coordinates": {"latitude": latitude, "longitude": longitude},
        "raw_address": None,
        "unit": None,
        "validated_location": None,
    }


class FixedMatrixService:
    """Test double that keeps endpoint tests independent of mapping math."""

    def build(self, _locations: dict) -> TravelTimeMatrix:
        return TravelTimeMatrix(
            {
                "start": {"A": 8, "B": 2, "C": 3},
                "A": {"start": 8, "B": 8, "C": 8},
                "B": {"start": 2, "A": 8, "C": 2},
                "C": {"start": 3, "A": 7, "B": 2},
            }
        )


class BrokenAddressService:
    def validate(self, _address: str):
        raise RuntimeError("private implementation detail")


def test_health_check() -> None:
    response = TestClient(create_app()).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]


def test_address_validation_returns_normalized_result_and_warning() -> None:
    client = TestClient(create_app())

    valid = client.post("/addresses/validate", json={"address": "  10  Main St  "})
    invalid = client.post("/addresses/validate", json={"address": "Main Street"})

    assert valid.json() == {
        "is_valid": True,
        "normalized_address": "10 Main St",
        "place_id": None,
        "coordinates": None,
        "warnings": [],
        "status": "unvalidated",
        "raw_address": "10  Main St",
        "unit": None,
        "candidates": [],
        "validated_location": None,
        "lookup_reference": None,
    }
    assert invalid.json()["is_valid"] is False
    assert invalid.json()["warnings"]


def test_unexpected_failures_have_safe_structured_response() -> None:
    client = TestClient(
        create_app(address_service=BrokenAddressService()),
        raise_server_exceptions=False,
    )

    response = client.post("/addresses/validate", json={"address": "10 Main St"})

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "internal_error",
            "message": "An unexpected server error occurred",
            "details": None,
        }
    }
    assert "private implementation detail" not in response.text


def test_order_lifecycle_and_structured_not_found_error() -> None:
    client = TestClient(create_app())
    payload = {"order_id": "A", "address": address("10 Main St"), "age_minutes": 24}

    created = client.post("/orders", json=payload)
    listed = client.get("/orders")
    fetched = client.get("/orders/A")
    deleted = client.delete("/orders/A")
    missing = client.get("/orders/A")

    assert created.status_code == 201
    assert listed.json() == [payload]
    assert fetched.json() == payload
    assert deleted.status_code == 204
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "order_not_found"


def test_order_can_be_updated_without_changing_its_id() -> None:
    client = TestClient(create_app())
    client.post(
        "/orders",
        json={"order_id": "A", "address": address("10 Main St"), "age_minutes": 24},
    )

    response = client.put(
        "/orders/A",
        json={"address": address("12 Main St"), "age_minutes": 30},
    )

    assert response.status_code == 200
    assert response.json()["order_id"] == "A"
    assert response.json()["address"]["formatted_address"] == "12 Main St"
    assert response.json()["age_minutes"] == 30


def test_complete_optimization_workflow_uses_phase_two_engine() -> None:
    route_service = RouteOptimizationService(matrix_service=FixedMatrixService())
    client = TestClient(create_app(route_service=route_service))
    payload = {
        "start": address("Restaurant"),
        "orders": [
            {"order_id": "A", "address": address("1 A St"), "age_minutes": 44},
            {"order_id": "B", "address": address("2 B St"), "age_minutes": 10},
            {"order_id": "C", "address": address("3 C St"), "age_minutes": 5},
        ],
    }

    response = client.post("/routes/optimize", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert [stop["order_id"] for stop in body["ordered_stops"]] == ["A", "C", "B"]
    assert body["total_drive_minutes"] == 20
    assert body["score"] == 191
    assert len(body["explanation"]) == 3


def test_optimize_rejects_duplicate_order_ids_with_structured_error() -> None:
    client = TestClient(create_app())
    order = {"order_id": "A", "address": address("1 A St"), "age_minutes": 10}

    response = client.post(
        "/routes/optimize",
        json={"start": address("Restaurant"), "orders": [order, order]},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_optimize_explains_missing_coordinates() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/routes/optimize",
        json={
            "start": {"formatted_address": "Restaurant"},
            "orders": [
                {"order_id": "A", "address": address("1 A St"), "age_minutes": 10}
            ],
        },
    )

    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "coordinates_required",
        "message": "Coordinates are required until a map provider is configured",
        "details": {"location_ids": ["start"]},
    }
