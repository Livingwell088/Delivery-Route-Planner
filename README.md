# Delivery Route Optimizer

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
- `POST /orders`, `GET /orders`, `GET /orders/{order_id}`, and
  `DELETE /orders/{order_id}`
- `POST /routes/optimize`

The current development travel-matrix service requires latitude and longitude
for every address. It uses a deterministic distance estimate and is designed
to be replaced by a live maps adapter without changing the API or routing
domain.

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

## Current limitations

- Exhaustive search is suitable only for small order counts because the number
  of possible sequences grows factorially.
- Travel times must be supplied as a complete directed matrix.
- The API has no live map provider, receipt scanner, database, or mobile-app
  integration. Orders are stored in memory and are cleared on restart.
- OR-Tools optimization is deferred until after the exhaustive prototype.
- Test inputs must be synthetic or fully anonymized; never commit raw customer
  receipts or personal information.

See `docs/phase-1-product-specification.md` for the V1 product decisions and
test-data requirements. See `docs/phase-2-routing.md` for the routing
specification.




1. The driver starts with one or more delivery orders and needs help choosing the delivery sequence.
2. Because each receipt is attached to an order, the driver photographs receipts one at a time.
3. The app extracts the customer’s delivery address and the relevant order time from each receipt.
4. After every scan, the app shows the extracted information. The driver confirms or corrects the address and time.
5. Once all orders are entered and confirmed, the app calculates the recommended delivery sequence.
6. The driver reviews the route and starts navigation using Apple Maps or Google Maps.
7. After completing a delivery, the driver marks it delivered. The app then opens navigation to the next customer.
8. After the final delivery, the app can navigate the driver back to the restaurant.



- There is only one time on the receipt which is the order placed time.
- There should a "submit" button tells the app that all receipts are captured
- I think it should only calculate after each is added since there are times where a driver needs to decide whether or not to take a specific order.
- "Valid address" should mean that the address matches the receipt and the map provider should also recognize it
- Driver should be able to but a warning should be given.
- Returning to the restaurant should be automatic after all orders are completed
- There should be a setting that the driver can choose for their default
