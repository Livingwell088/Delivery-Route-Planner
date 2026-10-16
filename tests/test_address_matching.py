"""Synthetic Google fixtures for delivery matching; no network or paid calls."""

from copy import deepcopy

from fastapi.testclient import TestClient
import httpx
import pytest

from delivery_router.api.address_matching import normalize_address_input
from delivery_router.api.app import create_app
from delivery_router.api.errors import ApiError
from delivery_router.api.google_maps import GoogleAddressValidationService, GoogleMapsClient
from delivery_router.api.schemas import Address, AddressContext
from delivery_router.api.services import RouteOptimizationService


ADDRESS = "10 Example St, Worcester, MA 01608"


def fixture(*, place="synthetic-a", city="Worcester", number="10", street="Example Street",
            postal="01608", precision="ROOFTOP", types=None, partial=False):
    return {
        "place_id": place,
        "formatted_address": f"{number} {street}, {city}, MA {postal}, USA",
        "types": types if types is not None else ["street_address"],
        "partial_match": partial,
        "address_components": [
            {"long_name": number, "types": ["street_number"]},
            {"long_name": street, "types": ["route"]},
            {"long_name": city, "types": ["locality", "political"]},
            {"long_name": "Massachusetts", "short_name": "MA", "types": ["administrative_area_level_1"]},
            {"long_name": postal, "types": ["postal_code"]},
            {"long_name": "United States", "short_name": "US", "types": ["country"]},
        ],
        "geometry": {"location_type": precision, "location": {"lat": 42.26, "lng": -71.80}},
    }


def service(results, *, status="OK", inspect=None):
    def handler(request):
        if inspect:
            inspect(request)
        return httpx.Response(200, json={"status": status, "results": results})
    return GoogleAddressValidationService(GoogleMapsClient(
        "synthetic-key", client=httpx.Client(transport=httpx.MockTransport(handler)),
    ))


def test_single_complete_result_has_components_and_requires_driver_confirmation():
    result = service([fixture()]).validate(ADDRESS)
    assert result.is_valid
    assert result.status == "needs_confirmation"
    assert result.validated_location is None
    assert result.candidates[0].street_number == "10"
    assert result.candidates[0].city == "Worcester"
    assert not result.candidates[0].requires_review


def test_ambiguous_nearby_towns_never_select_first_candidate():
    result = service([fixture(), fixture(place="synthetic-b", city="Shrewsbury")]).validate(ADDRESS)
    assert result.status == "needs_selection"
    assert not result.is_valid
    assert result.place_id is None and result.coordinates is None
    assert [c.city for c in result.candidates] == ["Worcester", "Shrewsbury"]
    assert result.candidates[1].requires_review
    assert any("town/city differs" in warning for warning in result.candidates[1].warnings)


def test_duplicate_place_ids_do_not_create_false_ambiguity():
    result = service([fixture(), deepcopy(fixture())]).validate(ADDRESS)
    assert result.is_valid
    assert len(result.candidates) == 1


def test_contradictory_duplicate_ids_cannot_hide_an_address_mismatch():
    with pytest.raises(ApiError) as caught:
        service([fixture(), fixture(city="Shrewsbury")]).validate(ADDRESS)
    assert caught.value.code == "map_provider_unavailable"


@pytest.mark.parametrize("unit", ["Apt 2", "Apartment B", "Suite 12", "Ste. 7", "Unit A", "Room 5", "#3"])
def test_unit_is_preserved_but_not_sent_to_google(unit):
    def inspect(request):
        assert request.url.params["address"] == ADDRESS
    original = f"10 Example St {unit}, Worcester, MA 01608"
    result = service([fixture()], inspect=inspect).validate(original)
    assert result.unit == unit
    assert result.raw_address == original
    assert result.is_valid
    assert any("not been verified" in warning for warning in result.warnings)


def test_separate_unit_segment_and_unicode_whitespace_are_normalized():
    result = normalize_address_input("  10\u00a0Example St, Apt 2,  Worcester, MA 01608  ")
    assert result.query == ADDRESS
    assert result.unit == "Apt 2"


def test_street_named_unit_is_not_removed():
    assert normalize_address_input("10 Unit Street, Worcester, MA").query == "10 Unit Street, Worcester, MA"


def test_no_results_keep_unit_and_require_correction():
    result = service([], status="ZERO_RESULTS").validate("10 Example St Apt 2, Worcester, MA")
    assert result.status == "invalid" and not result.is_valid
    assert result.unit == "Apt 2"
    assert result.candidates == []


@pytest.mark.parametrize("precision", ["GEOMETRIC_CENTER", "APPROXIMATE", "UNKNOWN"])
def test_imprecise_result_cannot_be_used_as_a_delivery_stop(precision):
    result = service([fixture(precision=precision)]).validate(ADDRESS)
    assert result.status == "invalid"
    assert not result.candidates[0].is_usable
    assert result.coordinates is None


def test_street_only_result_is_not_a_valid_delivery_address():
    item = fixture(types=["route"])
    item["address_components"] = [c for c in item["address_components"] if "street_number" not in c["types"]]
    result = service([item]).validate(ADDRESS)
    assert result.status == "invalid" and not result.is_valid


@pytest.mark.parametrize("changes, warning", [
    ({"number": "12"}, "street number differs"),
    ({"street": "Different Road"}, "street name differs"),
    ({"city": "Shrewsbury"}, "town/city differs"),
    ({"postal": "01545"}, "ZIP code differs"),
    ({"partial": True}, "partial match"),
    ({"precision": "RANGE_INTERPOLATED"}, "estimated along"),
])
def test_mismatches_and_approximation_require_review(changes, warning):
    result = service([fixture(**changes)]).validate(ADDRESS)
    assert result.status == "needs_confirmation"
    assert not result.is_valid
    assert result.candidates[0].is_usable and result.candidates[0].requires_review
    assert any(warning in value for value in result.warnings)


def test_zip_plus_four_does_not_conflict_with_same_five_digit_zip():
    assert service([fixture()]).validate(ADDRESS + "-1234").is_valid


def test_missing_zip_is_allowed_with_explicit_town_and_state():
    assert service([fixture()]).validate("10 Example St, Worcester, MA").is_valid


def test_missing_town_is_not_invented_from_worcester_bias():
    result = service([fixture()]).validate("10 Example St")
    assert not result.is_valid
    assert any("No town/city" in warning for warning in result.warnings)


def test_explicit_context_is_passed_to_lookup_and_endpoint():
    def inspect(request):
        assert request.url.params["address"] == "10 Example St, Worcester, MA, 01608"
        assert request.url.params["components"] == "country:US"
    client = TestClient(create_app(address_service=service([fixture()], inspect=inspect)))
    result = client.post("/addresses/validate", json={
        "address": "10 Example St", "context": {"city": "Worcester", "state": "MA", "postal_code": "01608"},
    })
    assert result.status_code == 200
    assert result.json()["is_valid"] is True


def test_context_cannot_override_explicit_town_in_address_text():
    result = service([fixture(city="Shrewsbury")]).validate(
        ADDRESS, AddressContext(city="Shrewsbury"),
    )
    assert not result.is_valid


def test_google_components_are_parsed_by_type_not_position_or_display_string():
    item = fixture()
    item["address_components"].reverse()
    item["formatted_address"] = "Provider display text, not parsed"
    result = service([item]).validate(ADDRESS)
    assert result.is_valid and result.candidates[0].city == "Worcester"


def test_postal_town_is_supported_when_locality_is_missing():
    item = fixture()
    for component in item["address_components"]:
        if "locality" in component["types"]:
            component["types"] = ["postal_town"]
    assert service([item]).validate(ADDRESS).is_valid


def test_non_address_poi_is_not_accepted_even_with_rooftop_coordinates():
    result = service([fixture(types=["point_of_interest"])]).validate(ADDRESS)
    assert result.status == "invalid"


def test_state_mismatch_requires_review():
    result = service([fixture()]).validate("10 Example St, Worcester, CT 01608")
    assert not result.is_valid
    assert any("state differs" in warning for warning in result.warnings)


def test_full_state_name_in_context_matches_short_google_state():
    result = service([fixture()]).validate(
        "10 Example St", AddressContext(city="Worcester", state="Massachusetts"),
    )
    assert result.is_valid


def test_first_street_only_suggestion_does_not_hide_a_precise_candidate():
    result = service([fixture(place="street-only", types=["route"]), fixture()]).validate(ADDRESS)
    assert result.is_valid and result.place_id == "synthetic-a"
    assert not result.candidates[0].is_usable


@pytest.mark.parametrize("exception", [httpx.ConnectError, httpx.ReadTimeout])
def test_network_failure_is_not_misreported_as_invalid_address(exception):
    def handler(request):
        raise exception("synthetic network failure", request=request)
    addresses = GoogleAddressValidationService(GoogleMapsClient(
        "synthetic-key", client=httpx.Client(transport=httpx.MockTransport(handler)),
    ))
    client = TestClient(create_app(address_service=addresses))
    response = client.post("/addresses/validate", json={"address": ADDRESS})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "map_provider_unavailable"


def test_invalid_payload_shape_is_a_structured_provider_error():
    addresses = GoogleAddressValidationService(GoogleMapsClient(
        "synthetic-key", client=httpx.Client(transport=httpx.MockTransport(
            lambda _request: httpx.Response(200, json=[]),
        )),
    ))
    response = TestClient(create_app(address_service=addresses)).post(
        "/addresses/validate", json={"address": ADDRESS},
    )
    assert response.status_code == 503


@pytest.mark.parametrize("malformation", ["geometry", "place_id", "address_components", "types"])
def test_incomplete_provider_result_is_recoverable_error(malformation):
    item = fixture()
    item.pop(malformation)
    with pytest.raises(ApiError) as caught:
        service([item]).validate(ADDRESS)
    assert caught.value.status_code == 503
    assert caught.value.code == "map_provider_unavailable"


def test_ambiguous_origin_is_blocked_before_matrix_request():
    class ForbiddenMatrix:
        def build(self, _locations):
            pytest.fail("Ambiguous addresses must not reach the matrix service")
    addresses = service([fixture(), fixture(place="synthetic-b", city="Shrewsbury")])
    routes = RouteOptimizationService(matrix_service=ForbiddenMatrix(), address_service=addresses)
    client = TestClient(create_app(address_service=addresses, route_service=routes))
    response = client.post("/routes/optimize", json={
        "start": {"formatted_address": ADDRESS},
        "orders": [{"order_id": "1", "age_minutes": 5, "address": {"formatted_address": ADDRESS}}],
    })
    assert response.status_code == 422
    assert response.json()["error"]["details"]["status"] == "needs_selection"
    assert len(response.json()["error"]["details"]["candidates"]) == 2


def test_route_resolution_preserves_unit_for_display_and_navigation():
    addresses = service([fixture()])
    routes = RouteOptimizationService(address_service=addresses)
    result = routes._resolve_address(Address(formatted_address="10 Example St Apt 2, Worcester, MA 01608"))
    assert result.unit == "Apt 2"
    assert result.formatted_address == "10 Example Street, Apt 2, Worcester, MA 01608, USA"
    assert result.raw_address == "10 Example St Apt 2, Worcester, MA 01608"
