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


## Google Maps mode
Set `GOOGLE_MAPS_API_KEY` before starting Uvicorn to activate the Google
adapters. `/addresses/validate` will geocode addresses and return Google's
canonical address, Place ID, and coordinates. `/routes/optimize` will use the
Routes API to calculate road-based durations instead of the local estimate.

The implementation deliberately omits `TRAFFIC_AWARE`, keeping matrix calls on
the lower-cost Essentials SKU. Provider calls have a ten-second timeout and
are translated into the API's stable structured-error format. Unit tests use
mock HTTP transports and never call or bill Google.

Copy `.env.example` to the ignored `.env` file for persistent local settings.
Configuration is validated at startup, API keys use Pydantic's secret type so
their value is excluded from representations, and the key never appears in
request or provider logs. Temporary network, HTTP 429, and provider 5xx
failures are retried at most once.

Geocoding is restricted to the United States, influenced toward Massachusetts,
and biased to a viewport around Worcester. Route optimization geocodes every
location first and sends Google's canonical addresses to the Routes API. This
lets a short input such as `455 Main St` resolve locally instead of selecting a
similarly named address in another country. The driver must still confirm the
canonical address returned by `/addresses/validate` before routing.

With Google mode active, coordinates can be omitted:

```json
{
  "start": {"formatted_address": "217A Chandler St, Worcester, MA"},
  "orders": [
    {
      "order_id": "A",
      "address": {"formatted_address": "455 Main St, Worcester, MA"},
      "age_minutes": 32
    }
  ]
}
```

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

## Structured error codes

| Code | Status | Meaning |
|---|---:|---|
| `validation_error` | 422 | Request fields or values are invalid. |
| `coordinates_required` | 422 | Local mode needs coordinates. |
| `address_not_found` | 422 | Google could not confidently resolve an address. |
| `route_unavailable` | 422 | No drivable route exists for a location pair. |
| `order_not_found` | 404 | The requested in-memory order does not exist. |
| `order_exists` | 409 | An order already uses the requested ID. |
| `map_provider_rate_limited` | 503 | Google quota is temporarily unavailable. |
| `map_provider_configuration_error` | 503 | Credentials or provider setup were rejected. |
| `map_provider_unavailable` | 503 | Google timed out or returned an unusable response. |
| `internal_error` | 500 | An unexpected error was safely hidden from the client. |

## Provider policy notes

The service does not cache Google geocoding or route content. Google's policy
generally restricts caching Maps content; Place IDs are the documented
exception. A future cost-reduction increment may cache only Place IDs after
the internal location model carries them through the complete workflow.
Customer addresses and provider keys are never written to application logs.

## Remaining production work

- Replace the in-memory repository with persistent storage.
- Add authentication and authorization before accepting real customer data.
- Add public Terms of Use, a Privacy Policy, and required Google attribution
  before distributing a client application.
- Restrict the Google key to a fixed server IP when the backend is deployed.



## Developer's Note to Self
- Created the backend API using FastAPI 
	- GET /health
		- return status if online
	- POST /addresses/validate
		- given an address, the API returns whether the address is valid based on Google Maps API, if it is returns the normalized address
	- POST /orders
		- Adds an order
	- GET /orders
		- Gets all the stored orders
	- GET /orders/{order_id}
		- Gets the order that matches the order_id
	- PUT /orders/{order_id}
		- Updates the order with the order_id
	- DELETE /orders/{order_id}
		- Deletes the order with the order_id 
	- POST /routes/optimize
		- Given the starting location and a list of orders, it will calculate and return the order of the deliveries based on the score
- Creates some models for addresses, orders (with address), routes, and more
- Integrated Google Cloud Maps, so addresses can be validated and routes can be more accurate
- Currently using an in-memory storage of orders
