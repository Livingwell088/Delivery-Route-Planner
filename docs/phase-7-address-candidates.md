# Phase 7 Step 2: Google address candidate evaluation

Implemented 2026-10-15. Step 1 was committed as `69e173f`; Step 2 is a separate,
uncommitted change. Delivery mode continues with Google APIs. No mobile files,
private credentials, cloud settings, or dispatcher functionality are changed.

## Behavior

`POST /addresses/validate` now returns Google's candidates rather than silently
choosing the first result. Each includes the Place ID (also its candidate ID),
normalized display address, coordinates, components, provider precision,
partial-match flag, `is_usable`, `requires_review`, and warnings. Provider order
is preserved. Identical Place IDs are deduplicated; contradictory duplicate
records fail as a recoverable provider error.

For an address candidate to be usable for further review, Google must identify a
street address, premise, or subpremise; return a street number, street, locality,
state, country; and return ROOFTOP or RANGE_INTERPOLATED precision. A building
result with an estimated position still requires review. City, street, postcode,
POI-only, approximate, and geometric-center results cannot become delivery stops.
`is_usable` means eligible for review, not validated or safe to route immediately.

| Result | API behavior |
| --- | --- |
| Zero results | `invalid`, `is_valid=false`, no selected coordinates/Place ID. |
| Only imprecise suggestions | `invalid`; candidates remain visible as correction hints. |
| Several usable candidates | `needs_selection`, `is_valid=false`; no top-level selection. |
| One usable candidate, mismatches/partial/interpolated result | `needs_confirmation`, `is_valid=false`, explicit warnings. |
| One usable candidate matching input components | `needs_confirmation`, legacy `is_valid=true`; driver confirmation/reference issuance still pending. |
| Malformed provider result or network failure | Structured HTTP 503, not an invalid-address success response. |

The existing optimization adapter refuses ambiguous/review-required results
before requesting a travel matrix and includes candidates/status in its 422
error details. This prevents a first-result guess during the migration. Full
trusted-reference enforcement and selection persistence remain Step 4. The
mobile selection/review interface remains Step 3.

## Input normalization and geography

- Collapse whitespace and normalize Unicode compatibility forms in lookup text.
  Keep the original text separately in `raw_address`.
- Extract a trailing apartment/suite/unit/room/floor/# identifier, including a
  separate comma segment. Remove it from the building lookup and return it in
  `unit`. Do not claim Google verified the unit. Preserve it in the resolved
  order's display/navigation address. This is a conservative parser for ordinary
  US receipt formats, not a general postal-address parser.
- Parse expected street number, street, town, state and ZIP from ordinary
  comma-separated US input. Common street/directional abbreviations compare
  equivalently. Compare five-digit ZIPs when ZIP+4 is present.
- Read Google's structured components by type; do not parse its display string.
- Flag street-number, street-name, locality, state, country, and ZIP differences.
  Missing input town or street number/name requires review, rather than assuming
  Worcester from geographic bias. Provider precision does not prove existence
  of an apartment or identify the ideal delivery entrance.
- New optional request `context` accepts `city`, `state`, `postal_code`, `country`
  when receipt text is incomplete. Missing context fields are appended to the
  lookup query. Explicit address-text components take precedence over context.
- Default hard filter is now only `country:US`. Existing region and Worcester
  bounds are soft biases, allowing nearby towns. Explicit environment component
  overrides still apply: remove old `locality:Worcester` restrictions locally.

Example request (synthetic address):

```json
{
  "address": "10 Example St Apt 2",
  "context": {"city": "Worcester", "state": "MA", "postal_code": "01608"}
}
```

Source reviewed: [Google Geocoding request/response documentation](https://developers.google.com/maps/documentation/geocoding/requests-geocoding).
Google recommends excluding unit information from lookup input, documents hard
component filters versus soft region/bounds bias, and distinguishes result
precision and partial matching. These rules guide the conservative evaluation;
the application does not equate Google recognition with certified deliverability.

## Automated verification

141 backend tests passed using synthetic mocked responses, including 44 new
Step 2 cases for ambiguous nearby towns, units, ZIP conflict, partial matches,
street-only fallback, imprecise coordinates, duplicate IDs, explicit context,
component order, malformed responses, disconnection/timeouts, and preventing
ambiguous optimization. `git diff --check` passed. The existing Starlette/httpx
deprecation warning remains. No paid Google requests or Android build were run.

## Manual testing needed: small live Google smoke test

Automated tests prove deterministic application behavior. A small live check is
still needed to verify the configured account and provider behavior for the local
service area. No emulator is needed for this backend-only step.

1. In your private root `.env`, set `MAP_PROVIDER=google` and your backend key.
   Use `GOOGLE_MAPS_COMPONENTS=country:US`, removing the old Worcester locality
   restriction. Enable Geocoding API in that key's project.
2. From the repository root, start the API:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn delivery_router.api.app:app --port 8002
   ```

3. Open `http://127.0.0.1:8002/docs`. Expand `POST /addresses/validate`, choose
   **Try it out**, enter an address, and execute. Omit `context` for these checks.
   Each lookup normally consumes one Geocoding request; retries can add usage.
   Do not post your key or private customer data in screenshots.

| Input | Expected result / pass criteria |
| --- | --- |
| `455 Main St, Worcester, MA 01608` | Candidates identify the entered building and Worcester. One precise matching candidate gives `needs_confirmation`, not `validated`. `is_valid` is true only if there are no review reasons. |
| `100 Maple Ave, Shrewsbury, MA 01545` | Shrewsbury is allowed; it is not silently changed to Worcester. Verify candidate town/street number and warnings. |
| `455 Main St Apt 2, Worcester, MA 01608` | Response retains `unit: "Apt 2"` and original address. Building lookup excludes the unit. A warning says the unit was not verified. This fictional unit is a parser check, not a real apartment lookup. |
| `455 Main St, Worcester, MA 01609` | A returned ZIP of 01608 is flagged with a ZIP warning and `is_valid=false`; it is not silently accepted. Multiple usable results give `needs_selection`. |
| `999999 Main St, Worcester, MA 01608` | No confidently accepted replacement. Expect `invalid` or a review-required suggestion with `is_valid=false`; a street-only result must never become routable. |
| `Main St, MA` | Must not be accepted without a house number/town. If multiple usable locations are returned, expect `needs_selection` with empty top-level location fields. Google can return one result, so this query does not guarantee live ambiguity. |

A 503 configuration/quota/network error means the live check is inconclusive,
not that the address is invalid. Candidate selection itself cannot be completed
in the mobile app yet. Report any confidently accepted wrong number, street,
town, or ZIP before proceeding. Exact rooftop/entrance accuracy and real driving
times still need the later end-to-end validation step.

## Live smoke-test results — 2026-10-16

The five remaining manual cases were executed directly against the running
local API on port 8002. All returned HTTP 200 with the expected application
behavior. Five local validation requests were submitted; provider-side usage
can be confirmed in Google Cloud. No Routes Matrix calls were requested.

| Case | Observed result | Verdict |
| --- | --- | --- |
| Shrewsbury Town Hall | Matching number/street/town/ZIP, ROOFTOP, `needs_confirmation`, `is_valid=true`. | Pass |
| Fictional Apt 2 at Worcester City Hall | Building recognized; `unit` and raw text preserved, unverified-unit warning. | Pass |
| Conflicting Worcester ZIP | Returned ZIP differed; explicit ZIP warning, `requires_review=true`, `is_valid=false`. | Pass |
| Implausible house number | Google returned only a partial street-level suggestion; API returned `invalid`, no top-level selected location. | Pass |
| Street/state without number or town | Street-only suggestions rejected as `invalid`; no top-level selected location. | Pass |

The user had already supplied a successful live response for the canonical
Worcester City Hall address. Together these complete the six-case smoke test.
Actual live ambiguity between several usable building candidates was not
triggered by these inputs; deterministic mocked tests cover that path. This
does not establish general address/entrance accuracy or test the future mobile
candidate-selection UI. Step 2 remains uncommitted pending review.
