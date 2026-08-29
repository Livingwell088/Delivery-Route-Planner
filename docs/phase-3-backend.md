# Phase 3: Backend foundation

## Architecture

The backend follows a small ports-and-adapters structure:

1. `api/schemas.py` owns the public HTTP contract.
2. `api/app.py` handles HTTP transport, endpoint wiring, and request logging.
3. `api/services.py` converts API inputs into Phase 2 domain objects.
4. `models.py`, `strategies.py`, and the rest of the Phase 2 package remain
   independent of FastAPI and Pydantic.

This separation is intentional. A future geocoder, map provider, and database
can replace the development implementations without rewriting the optimizer.

## Development services

- Address validation currently normalizes whitespace and checks for a street
  number. It is not proof that an address is deliverable.
- Travel times use coordinates, haversine distance, a road-distance factor,
  and a fixed average speed. They are stable test estimates, not navigation
  ETAs.
- Orders use an in-memory repository and do not survive a process restart.
- Optimization is capped at eight orders because Phase 2 enumerates every
  permutation.

## Example optimization request

```json
{
  "start": {
    "formatted_address": "100 Restaurant Ave",
    "coordinates": {"latitude": 40.0000, "longitude": -75.0000}
  },
  "orders": [
    {
      "order_id": "A",
      "address": {
        "formatted_address": "10 Main St",
        "coordinates": {"latitude": 40.0150, "longitude": -75.0100}
      },
      "age_minutes": 32
    },
    {
      "order_id": "B",
      "address": {
        "formatted_address": "20 Oak St",
        "coordinates": {"latitude": 40.0050, "longitude": -75.0200}
      },
      "age_minutes": 12
    }
  ]
}
```

## Next production adapters

The next backend increment should implement a map-provider address validator
and matrix service behind the existing service interfaces, followed by a
persistent order repository. Provider credentials must come from environment
configuration and must never be committed.
