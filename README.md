# Delivery Route Optimizer

For current Windows backend, Android emulator, and mobile startup instructions,
use the [RouteRunner startup guide](docs/startup-guide.md).

An isolated Python prototype that compares restaurant-delivery sequences using
driving time, customer wait, and severe-lateness penalties. It is intentionally
separate from the future mobile application.

## Requirements

- Python 3.11 or newer

## Setup

From the repository root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e . pytest
```

## Run the example

```powershell
python examples/basic_route.py
```

The synthetic example compares all strategies, selects the age-aware route,
and prints both the comparison rationale and detailed delivery predictions.

## Run the tests

```powershell
python -m pytest -q
```

Run an individual test file with verbose output:

```powershell
python -m pytest tests/test_acceptance.py -v
```

## Run the API

```powershell
uvicorn delivery_router.api.app:app --reload
```

Interactive OpenAPI documentation is then available at
`http://127.0.0.1:8000/docs`. The Phase 3 endpoints are:

- `POST /addresses/validate`
- `POST /orders`, `GET /orders`, `GET /orders/{order_id}`,
  `PUT /orders/{order_id}`, and `DELETE /orders/{order_id}`
- `POST /routes/optimize`

Without provider configuration, the development travel-matrix service requires
latitude and longitude and uses a deterministic distance estimate. To use
Google geocoding and road durations instead, enable the Geocoding API and
Routes API in Google Cloud. Select `MAP_PROVIDER=google` explicitly.
Copy `.env.example` to `.env`, replace the key
placeholder, and start the server:

```powershell
Copy-Item .env.example .env
# Edit .env locally and set GOOGLE_MAPS_API_KEY.
uvicorn delivery_router.api.app:app --reload --port 8002
```

Never commit the API key. When Google mode is enabled, optimization requests
may contain address text without manually supplied coordinates.

For an existing `.env` containing only a Google key, add `MAP_PROVIDER=google`.
The server now rejects a configured key in development-provider mode instead of
silently ignoring it. To run without Google, use `MAP_PROVIDER=development` and
remove `GOOGLE_MAPS_API_KEY`. Set `APP_ENVIRONMENT=production` for deployments;
production rejects the development estimator and Google mode requires a nonblank
key. Provider errors never trigger an automatic switch to estimated travel times.

Phase 7 adds the location contract, explicit configuration, and conservative
Google candidate evaluation. The default component filter is `country:US`; for
existing environments, remove `locality:Worcester` from `GOOGLE_MAPS_COMPONENTS`
to allow nearby towns. Ambiguous or review-required addresses cannot silently
reach the matrix service. Mobile selection and trusted backend validation
references are still pending. See [Phase 7 foundation](docs/phase-7-foundation.md)
and [candidate evaluation and manual checks](docs/phase-7-address-candidates.md).

## Routing strategies

- **Shortest route:** Enumerates every sequence and minimizes total driving
  time.
- **Oldest order first:** Delivers orders from oldest to youngest while
  preserving input order when ages tie.
- **Age-aware optimizer:** Enumerates every sequence and minimizes the
  configured weighted score.

## Default scoring

```text
score =
    total driving minutes
    + total customer wait minutes
    + (10 × total minutes beyond 45)
```

The severe-lateness threshold and all three weights are configurable through
`ScoringConfig`. Lower scores are preferred.

## Project layout

- `src/delivery_router/` — domain models, route evaluation, scoring,
  strategies, and explanations
- `src/delivery_router/api/` — FastAPI schemas, endpoints, repositories,
  application services, errors, and logging
- `tests/` — unit, integration, and acceptance tests
- `examples/` — runnable scenarios using synthetic data
- `docs/` — product and algorithm decisions
- `data/fixtures/` — anonymized or synthetic test inputs only
- `mobile/` — Expo/React Native client, with application code in `mobile/src/`

## Current limitations

- Exhaustive search is suitable only for small order counts because the number
  of possible sequences grows factorially.
- Travel times must be supplied as a complete directed matrix.
- Google mode has no live-traffic weighting. The API has no receipt scanner,
  database, or mobile-app integration. Orders are stored in memory and are
  cleared on restart.
- OR-Tools optimization is deferred until after the exhaustive prototype.
- Test inputs must be synthetic or fully anonymized; never commit raw customer
  receipts or personal information.

See `docs/phase-1-product-specification.md` for the V1 product decisions and
test-data requirements. See `docs/phase-2-routing.md` for the routing
specification.

## Mobile app (Phase 4)

The Expo/React Native shell is in `mobile/`. It supports the mock receipt
workflow from capture through an API-backed optimized stop list, including
camera/location permission prompts and a persisted navigation-app preference.
See `docs/phase-4-mobile.md` for setup and the manual acceptance walkthrough.
