"""Usage reservations, concurrency and request coalescing without Google traffic."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Event

import httpx
import pytest
from fastapi.testclient import TestClient

from delivery_router.api.app import create_app
from delivery_router.api.errors import ApiError
from delivery_router.api.google_maps import GoogleMapsClient
from delivery_router.api.map_usage import MapUsage
from delivery_router.api.settings import Settings
from delivery_router.api.singleflight import SingleFlight


def test_reservations_persist_and_block_before_exceeding_cap(tmp_path):
    path = tmp_path / "usage.sqlite3"
    usage = MapUsage(path, monthly_limit_usd=.025)
    usage.reserve("geocoding", 1)
    MapUsage(path, monthly_limit_usd=.025).reserve("route_matrix", 4)
    assert usage.snapshot()["estimated_gross_cost_usd"] == .025
    with pytest.raises(ApiError) as error:
        usage.reserve("geocoding", 1)
    assert error.value.code == "map_usage_limit_reached"
    assert usage.snapshot()["reserved_units"] == {"geocoding": 1, "route_matrix": 4}
    assert usage.snapshot()["remaining_gross_allowance_usd"] == 0


def test_cross_instance_concurrent_reservations_cannot_overspend(tmp_path):
    path = tmp_path / "usage.sqlite3"
    def attempt(_):
        try:
            MapUsage(path, monthly_limit_usd=.02).reserve("geocoding", 1)
            return True
        except ApiError:
            return False
    with ThreadPoolExecutor(max_workers=8) as pool:
        successes = list(pool.map(attempt, range(20)))
    assert sum(successes) == 4
    assert MapUsage(path).snapshot()["reserved_units"]["geocoding"] == 4


def test_daily_and_monthly_utc_resets_are_separate(tmp_path):
    now = datetime(2026, 10, 30, 23, 59, tzinfo=timezone.utc)
    usage = MapUsage(tmp_path / "usage.sqlite3", geocoding_daily_limit=1, clock=lambda: now)
    usage.reserve("geocoding", 1)
    with pytest.raises(ApiError):
        usage.reserve("geocoding", 1)
    now += timedelta(minutes=2)
    usage.reserve("geocoding", 1)
    assert usage.snapshot()["reserved_units"]["geocoding"] == 2
    now += timedelta(days=1)
    assert usage.snapshot()["reserved_units"]["geocoding"] == 0
    assert usage.snapshot()["month_utc"] == "2026-11"


def test_tracking_failure_stops_provider_call(tmp_path):
    path = tmp_path / "broken.sqlite3"
    path.write_text("not a database")
    calls = []
    client = GoogleMapsClient("test", usage=MapUsage(path), client=httpx.Client(transport=httpx.MockTransport(
        lambda request: calls.append(request) or httpx.Response(200, json={"status": "OK"}))))
    with pytest.raises(ApiError) as error:
        client.request_geocode("10 Example St")
    assert error.value.code == "map_usage_unavailable"
    assert not calls


def test_retry_attempts_reserve_units_and_do_not_refund_errors():
    usage = MapUsage(":memory:", monthly_limit_usd=.005)
    calls = []
    client = GoogleMapsClient("test", usage=usage, max_attempts=2, client=httpx.Client(transport=httpx.MockTransport(
        lambda request: calls.append(request) or httpx.Response(500))))
    with pytest.raises(ApiError) as error:
        client.request_geocode("10 Example St")
    assert error.value.code == "map_usage_limit_reached"
    assert len(calls) == 1
    assert usage.snapshot()["reserved_units"]["geocoding"] == 1


def test_matrix_reserves_origin_times_destination_units():
    usage = MapUsage(":memory:")
    client = GoogleMapsClient("test", usage=usage, client=httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=[]))))
    client.request_matrix({"origins": [{}, {}], "destinations": [{}, {}, {}]})
    assert usage.snapshot()["reserved_units"]["route_matrix"] == 6


def test_repeated_finished_requests_are_not_cached():
    usage = MapUsage(":memory:")
    calls = []
    client = GoogleMapsClient("test", usage=usage, client=httpx.Client(transport=httpx.MockTransport(
        lambda request: calls.append(request) or httpx.Response(200, json={"status": "ZERO_RESULTS"}))))
    client.request_geocode("10 Example St")
    client.request_geocode("10 Example St")
    assert len(calls) == 2
    assert usage.snapshot()["reserved_units"]["geocoding"] == 2
    assert not client.flight.pending


@pytest.mark.parametrize("fails", [False, True])
def test_only_overlapping_identical_requests_share_work(monkeypatch, fails):
    from concurrent.futures import Future
    from delivery_router.api import singleflight
    joining = Event()
    class ObservedFuture(Future):
        def result(self, timeout=None):
            joining.set()
            return super().result(timeout)
    monkeypatch.setattr(singleflight, "Future", ObservedFuture)
    flight = SingleFlight()
    entered, release = Event(), Event()
    calls = []
    def work():
        calls.append(1)
        entered.set()
        assert release.wait(2)
        if fails:
            raise ApiError(503, "test_error", "Test failure")
        return {"result": 1}
    with ThreadPoolExecutor(max_workers=2) as pool:
        leader = pool.submit(flight.run, "same", work)
        assert entered.wait(2)
        follower = pool.submit(flight.run, "same", work)
        assert joining.wait(2)
        release.set()
        if fails:
            for future in [leader, follower]:
                with pytest.raises(ApiError):
                    future.result()
        else:
            assert leader.result() == follower.result() == {"result": 1}
    assert calls == [1]
    assert not flight.pending
    assert flight.run("different", lambda: 2) == 2
    assert flight.run("same", lambda: 3) == 3


def test_zero_budget_blocks_at_api_boundary_and_usage_contains_no_addresses(monkeypatch):
    settings = Settings(_env_file=None, map_provider="google", google_maps_api_key="secret-test",
                        google_maps_usage_db=":memory:", google_maps_monthly_limit_usd=0)
    app = create_app(settings=settings)
    monkeypatch.setattr(app.state.address_service.client.client, "get", lambda *a, **kw: pytest.fail("Must not reach Google"))
    client = TestClient(app)
    response = client.post("/addresses/validate", json={"address": "10 Example St"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "map_usage_limit_reached"
    report = client.get("/maps/usage")
    assert report.status_code == 200
    assert report.json()["estimated_gross_cost_usd"] == 0
    assert "secret-test" not in report.text and "Example" not in report.text
    assert TestClient(create_app()).get("/maps/usage").json()["tracking"] is False


def test_deadline_prevents_retry_after_elapsed_attempt(monkeypatch):
    from delivery_router.api import google_maps
    elapsed = [0]
    monkeypatch.setattr(google_maps.time, "perf_counter", lambda: elapsed[0])
    monkeypatch.setattr(google_maps.time, "sleep", lambda seconds: None)
    usage = MapUsage(":memory:")
    calls = []
    def handler(request):
        calls.append(request)
        elapsed[0] = 30
        raise httpx.ReadTimeout("test")
    client = GoogleMapsClient("test", usage=usage, client=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(ApiError):
        client.request_geocode("10 Example St")
    assert len(calls) == 1
    assert usage.snapshot()["reserved_units"]["geocoding"] == 1


@pytest.mark.parametrize("status,expected_calls", [(400, 1), (401, 1), (403, 1), (429, 2), (500, 2)])
def test_retryable_and_terminal_statuses_have_bounded_reservations(status, expected_calls):
    usage = MapUsage(":memory:")
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(status if len(calls) == 1 else 200, json={"status": "ZERO_RESULTS"})
    client = GoogleMapsClient("test", usage=usage, client=httpx.Client(transport=httpx.MockTransport(handler)))
    if expected_calls == 1:
        with pytest.raises(ApiError):
            client.request_geocode("10 Example St")
    else:
        assert client.request_geocode("10 Example St")["status"] == "ZERO_RESULTS"
    assert len(calls) == expected_calls
    assert usage.snapshot()["reserved_units"]["geocoding"] == expected_calls


def test_provider_retry_after_prevents_early_retry():
    usage = MapUsage(":memory:")
    calls = []
    client = GoogleMapsClient("test", usage=usage, client=httpx.Client(transport=httpx.MockTransport(
        lambda request: calls.append(request) or httpx.Response(429, headers={"Retry-After": "60"}))))
    with pytest.raises(ApiError) as error:
        client.request_geocode("10 Example St")
    assert error.value.code == "map_provider_rate_limited"
    assert len(calls) == 1
