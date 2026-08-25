# Phase 2: Routing algorithm prototype

## Scope

The prototype is an isolated Python package. It will accept a restaurant,
multiple delivery orders, and a travel-time matrix. It will compare:

1. Shortest route
2. Oldest order first
3. Age-aware exhaustive optimization

Each result will include predicted delivery times, total driving time, average
and maximum customer wait, severely late order count, and an explanation of
the selected sequence. OR-Tools is intentionally deferred.

## Planned module boundaries

- `models.py`: validated inputs and result types
- `scoring.py`: configurable objective and penalties
- `strategies.py`: exhaustive search and baselines
- `metrics.py`: route measurements and comparisons
- `explanations.py`: customer-readable route rationale

## Data policy

Only synthetic or fully anonymized fixtures belong in `data/fixtures/`. Raw
receipts and customer information must remain outside version control.
