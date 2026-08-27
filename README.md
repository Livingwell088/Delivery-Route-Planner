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
- `tests/` — unit, integration, and acceptance tests
- `examples/` — runnable scenarios using synthetic data
- `docs/` — product and algorithm decisions
- `data/fixtures/` — anonymized or synthetic test inputs only

## Current limitations

- Exhaustive search is suitable only for small order counts because the number
  of possible sequences grows factorially.
- Travel times must be supplied as a complete directed matrix.
- The prototype has no map provider, receipt scanner, or mobile-app integration.
- OR-Tools optimization is deferred until after the exhaustive prototype.
- Test inputs must be synthetic or fully anonymized; never commit raw customer
  receipts or personal information.

See `docs/phase-2-routing.md` for the current routing specification.
