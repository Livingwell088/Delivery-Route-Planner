# Phase 7 Step 1: location contract and Google configuration

Implemented 2026-10-15. Scope: the delivery-mode foundation only. Google
Geocoding API and Routes API remain the chosen providers. Dispatcher mode is
deferred until delivery mode is complete. This step does not add multi-driver
optimization, change receipt confirmation, or make live Google requests.

## Configuration and migration

| Setting | Values / default | Behavior |
| --- | --- | --- |
| `APP_ENVIRONMENT` | `development` (default), `test`, `production` | Production requires Google mode. Deployments must explicitly set this value. |
| `MAP_PROVIDER` | `development` (default), `google` | Development uses the existing local estimator. Google wires the existing real geocoding/matrix adapters. |
| `GOOGLE_MAPS_API_KEY` | Private server key | Required and nonblank in Google mode. Rejected in development mode so it cannot silently be ignored. |
| `GOOGLE_MAPS_REGION`, `GOOGLE_MAPS_COMPONENTS`, `GOOGLE_MAPS_BOUNDS` | Existing Worcester settings | Preserved in Step 1. The locality restriction will be revised in Step 2 for nearby-town ambiguity. |
| `GOOGLE_MAPS_TIMEOUT_SECONDS` | 10 | Existing per-request timeout; bounded retries are retained. |
| `GOOGLE_MAPS_MAX_ATTEMPTS` | 2 | Existing retry count; no automatic fallback to the local estimator. |

Existing installations using just a key must add `MAP_PROVIDER=google` to `.env`.
For offline development, explicitly use `MAP_PROVIDER=development` with no key.
The `.env.example` opts into Google and uses a placeholder; replace that locally.
The example placeholder is nonblank, so configuration validation alone cannot
prove credentials are usable. Google authentication and enabled APIs must still
be verified when live testing is authorized.

The application factory's explicit `google_api_key` argument selects Google
mode for compatibility with existing embedding/test callers; an empty string
is rejected. Trusted injected services remain supported for automated tests.
The selected provider is available as `app.state.map_provider` and logged without
the secret. Settings hide input values in displayed validation errors; callers
must not log structured exception input data or environment contents.

## Shared address contract

`Address` is used by `OrderCreate`, `OrderUpdate`, `OrderResponse`, `RouteOrder`,
`OptimizeRouteRequest.start`, and `OrderedStop.address`. This avoids a separate
restaurant-only or OCR-only location format. Manual entry and receipt drafts
will map to the same format in Step 3.

| Field | Meaning |
| --- | --- |
| `formatted_address` | Existing display/destination address; still required. |
| `coordinates` | Existing optional coordinates, retained for compatibility and development. |
| `raw_address` | Original user/receipt text, separate from the provider's normalized result. Outer whitespace is trimmed by request validation; internal text is preserved. |
| `unit` | Separate apartment, suite, or room; must survive a building-only lookup. Does not certify the unit exists. |
| `validated_location` | Optional Google snapshot with Place ID, canonical address, coordinates, backend reference, and timezone-aware validation/expiry timestamps. |

All new address fields are optional; older clients can still send just text and
coordinates. Responses now include null/default values for the additional fields.
Order CRUD preserves supplied metadata, but it is **not trusted proof**. Server
reference issuance, storage, verification, address binding, invalidation, and
expiry enforcement are Step 4. Google optimization still uses the pre-existing
resolution flow in Step 1; it does not yet consume these references or Place IDs.

`ValidatedLocation` requires a nonempty Place ID, normalized address, reference,
valid coordinate ranges, aware timestamps, and an expiry after validation time.
The structure is not a signature and does not prevent a caller from submitting
fabricated metadata. Do not use its presence as an authorization/validation gate.

## Candidate and validation states

`AddressCandidate` defines a Google candidate ID, normalized address, Place ID,
coordinates, structured street/locality/postal components, provider precision,
partial-match flag, and warnings. `location_type` deliberately accepts provider
strings to accommodate Google's precision categories. Candidate lists are
defined now; population and ranking are Step 2.

`AddressValidationResponse` retains legacy `is_valid`, `normalized_address`,
`place_id`, `coordinates`, and `warnings`, and adds `status`, `raw_address`,
`unit`, `candidates`, and `validated_location`.

| Status | Meaning / intended transition |
| --- | --- |
| `unvalidated` | No trusted provider resolution; includes development-only syntax checks. |
| `needs_selection` | Several plausible candidates; driver must select one (Step 2/3). |
| `needs_confirmation` | Provider returned a location, but receipt comparison/driver confirmation is still required. |
| `validated` | Reserved for a confirmed Google location with a backend-issued reference (Step 4). |
| `invalid` | Address could not be resolved or is syntactically invalid. |

A response cannot use `validated` without `is_valid=true` and a location snapshot,
or use `invalid` with `is_valid=true`. These checks enforce response structure,
not reference authenticity. Legacy `is_valid=true` means provider recognition,
not completed driver confirmation. Current Google results use
`needs_confirmation`, including partial matches (legacy `is_valid=false`); zero
results use `invalid`. No current adapter issues `validated`. Provider failures
continue to use structured HTTP errors rather than masquerading as invalid
addresses. Loading, offline, and cancellation are future mobile request states.

Planned transitions: edit -> unvalidated -> lookup -> invalid / needs_selection /
needs_confirmation -> driver confirms -> validated. Any destination edit must
invalidate its reference. Units are retained separately and bound to confirmation
even when they share the same building Place ID. These transitions and an
optimizer gate are not implemented in Step 1.

## Google setup and data-use review

Before live acceptance testing:

1. Select the Google Cloud project and billing account, enable Geocoding API and
   Routes API, and configure the server key locally. Cloud configuration was not
   inspected or changed by this implementation.
2. Restrict that key to the two server APIs and restrict server source IPs where
   deployment permits. Keep a separate Android Maps SDK key restricted to the
   application package/signing certificate. Never put the server key in
   `EXPO_PUBLIC_*`, source control, a mobile bundle, or logs.
3. Review billing alerts and any available quotas. Alerts do not stop requests.
   The monthly application cutoff discussed with the user belongs to Step 6;
   no spending cutoff is implemented here.
4. Display required Google Maps attribution on candidate/result views. Google
   content displayed on maps must use compatible Google maps. The current
   mobile iOS map provider and Apple navigation handoff require review against
   Google terms before release; Step 1 does not change the mobile map.
5. Provide publicly accessible privacy/terms pages before release. Explain
   that delivery addresses are transmitted to Google. Do not log receipt data.
6. Persist Place IDs under the documented exemption. Geocoding coordinates may
   be cached for up to 30 consecutive days under the service-specific terms;
   other permissions are conditional. Do not equate a validation-reference
   expiry with permission to store provider content. Do not build a reusable
   Routes-duration cache without a permitted basis. Step 6 will implement
   permitted retention, invalidation, and request deduplication. No cache is
   introduced here.

Official sources checked on 2026-10-15:

- [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies)
- [Routes policies](https://developers.google.com/maps/documentation/routes/policies)
- [Service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [API security guidance](https://developers.google.com/maps/api-security-best-practices)

## Verification and remaining scope

Automated tests cover invalid provider configuration, production refusal of
estimated mode, secret-safe displayed errors, real adapter wiring without live
requests, legacy address input, metadata persistence through order CRUD,
candidate representation, invalid coordinates, timezone/expiry requirements,
and the distinction between recognition and validated status.

Run from the repository root: `.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider`.
Tests use synthetic inputs and existing mocked Google transport. No credentials
or paid Google requests are needed. Mobile files are unchanged; the repository's
mobile instruction to read Expo v57 documentation before writing mobile code
will apply when Step 3 begins.

Step 1 verification: 97 backend tests passed; `git diff --check` passed. The
existing Starlette TestClient/httpx deprecation warning remains. Pytest's cache
plugin was disabled on the final run because the pre-existing cache directory
was not writable in this session. No live API request or mobile build was run.

Next steps retain the reviewed order: candidate evaluation (2), mobile review
(3), trusted reference enforcement/persistence (4), Place-ID matrix integration
(5), quotas/cache/error resilience (6), and end-to-end verification (7).
