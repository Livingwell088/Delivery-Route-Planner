# RouteRunner: initial TestFlight readiness review

November 9, 2026. Repository reviewed at `a2f87d7` on `navigation`. The worktree
was clean before this report. Read-only source/documentation review; no submission,
account changes, credential changes or runtime changes. This report is not legal
clearance. Issues below distinguish observed code from matters requiring evidence.

## Distribution objective

Use TestFlight for invited beta testing; a public App Store release is a separate
decision. Internal testers are eligible App Store Connect team members, while
ordinary friends/drivers generally belong in external testing. Apple supports up
to 100 internal and 10,000 external testers; external testing requires the
applicable Beta App Review process. Do not give account privileges just to avoid
review. [Apple TestFlight](https://developer.apple.com/testflight/).

An owned Mac is not required for Expo's hosted iOS build/submission workflow:
EAS supports running those commands from Windows. An iPhone tester is still
needed to observe actual camera, OCR, permissions and navigation behavior.
TestFlight uses a store-distribution build, not the development app served by
Metro. [Expo TestFlight guide](https://docs.expo.dev/submit/testflight/).

Apple currently requires Xcode 26+ and iOS 26 SDK+ for uploads. Select an Expo
SDK 57-compatible build image and verify the generated archive, rather than
assuming Android compilation proves iOS compatibility.
[Apple upload requirements](https://developer.apple.com/news/upcoming-requirements/),
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).

## Findings before inviting testers

Subsequent user decision: Google Maps only for now. The current change hides Apple
from Settings and alternatives and normalizes old Apple preferences to Google.
See [Google-only navigation](google-only-navigation.md). R1 below records the
original finding; the Apple handoff is now disabled at the product gate. The
other readiness findings remain separate from that mitigation.

### R1 — High priority: Google content sent to Apple Maps

`src/delivery_router/api/google_maps.py` obtains building coordinates and normalized
addresses from Google Geocoding; `mobile/src/services/navigationLinks.js` exports
those coordinates to Apple Maps. The reviewed non-EEA service terms restrict
Geocoding content used with non-Google maps (section 6.2); Routes has a related
restriction (19.2). Billing-account geography may change applicable terms.
This is a concrete contract risk, not proof that the implementation is permitted.

Proposed first beta: Google-only navigation until the applicable agreement is
confirmed or an independently sourced Apple-compatible flow is designed. Merely
removing the Place ID, relabeling coordinates, or changing URL schemes does not
remove their provenance. Reassess address/duration attribution, caching and
customer-facing policy requirements with the actual Google contract.
[Google service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms),
[Geocoding policy](https://developers.google.com/maps/documentation/geocoding/policies),
[Routes policy](https://developers.google.com/maps/documentation/routes/policies).

### R2 — High priority: backend access and deployment boundary

`src/delivery_router/api/app.py` exposes lookup, route, usage and order CRUD endpoints
without caller authentication. The shared in-memory order repository has no user
partition. Signed location confirmations validate addresses; they do not identify
or authorize a user. Even if mobile does not use CRUD, those routes exist when the
backend is exposed. Global usage caps limit total tracked work but cannot prevent
an anonymous caller consuming another tester's allowance.

Before reachable deployment, remove unused order endpoints or protect and isolate
them; protect billable calls with appropriate tester authorization and abuse
controls. Use a stable HTTPS backend, restricted server credentials, explicit
limits and durable ledger storage. `routeApi.js` defaults to HTTP localhost:8000;
the historical emulator configuration uses a development server on 8002. Neither
establishes a production endpoint available to an iPhone or Apple reviewer. No
deployed service was contacted or assumed to exist in this review.

### R3 — High priority: privacy policy and actual SDK disclosures

No privacy policy document or in-app privacy-policy link was found in the reviewed
source; Settings currently contains navigation preferences. Receipt-derived
addresses go through our backend to Google. External navigation receives building
coordinates. The policy must describe these flows, ownership/contact, retention,
deletion and third-party use. A driver's camera consent alone does not establish
the restaurant's authority to share customers' data.

ML Kit input OCR runs on-device, but Google documents separate SDK diagnostics and
usage collection. Do not declare the entire app "no data collected" merely
because photos are not uploaded by our OCR service. Review the exact iOS Google
Maps/ML Kit versions and compiled SDK disclosures before answering Apple's labels.
[Apple review privacy requirements](https://developer.apple.com/app-store/review/guidelines/),
[ML Kit processing](https://developers.google.com/ml-kit/terms),
[ML Kit iOS disclosures](https://developers.google.com/ml-kit/ios-data-disclosure),
[Apple privacy labels](https://developer.apple.com/app-store/app-privacy-details/).

### R4 — Before real receipts: retention and deletion need definition

`activeSession.js` saves addresses, units, order IDs, placed times and signed
location references to AsyncStorage. It excludes receipt images/OCR output and
rejects stale data at restore, but an eight-hour validity check is not a guarantee
that an inactive app securely deletes its files after eight hours. AsyncStorage
does not add app-level encryption. OS protection/backup behavior needs verification.

`ReceiptScannerScreen.js` and `receiptImage.js` create temporary original/cropped
photos; no explicit cleanup was found in the reviewed flow. Review cache lifespan,
cancellation/retake cleanup, backup rules and a clear-run deletion action. Keep only
necessary receipt fields and use synthetic fixtures until those decisions are made.
[FTC data-security guidance](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business).

### R5 — Release configuration and iOS evidence are incomplete

No checked-in `eas.json`, `.easignore`, or app-owned privacy manifest was found.
Some dependencies include privacy manifests; their existence does not establish
that the final iOS archive aggregates all required-reason APIs or SDK declarations.
The ML Kit podspec depends on GoogleMLKit/TextRecognition; resolved CocoaPods
versions and binary signatures remain unverified without an iOS build.

Prepare an explicit store profile and build-number strategy, inspect the upload
contents, configure environment variables securely and inspect the resulting iOS
archive/privacy report. Exclude local .env files, generated backups, receipt data
and `mobile/dist` artifacts. Public native SDK keys are extractable and need
platform/API restrictions; the backend secret must remain server-only. No private
credential values or full generated manifests were printed during this review.
A limited current-HEAD Google-key/private-key pattern scan found no match in
tracked text; this is not a complete secret-history audit or Cloud restriction audit.
[Apple SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/).

### R6 — Permission and review presentation mismatches

HomeScreen requests foreground location permission but the reviewed app source
does not read driver GPS. The configured description says location is used as a
route starting point, while planned routes start at the confirmed restaurant.
Remove the unused request or implement a justified, accurately described purpose.
Verify denial still permits the intended flow. The photo-library test-image
control is development-only; a release build must be tested with the actual camera.
Test-mode UI and developer setup messages also need an intentional beta/release
presentation. `supportsTablet` is true, so iPad layout/testing is in scope unless
deliberately changed before release.

### R7 — Copyright, licenses, name and asset provenance are not cleared

`mobile/LICENSE` contains Expo's MIT notice. Preserve applicable third-party
notices; it is not proof of rights to every app asset or a statement identifying
the user's own copyright. The npm lock inventory contains 516 entries not marked
dev, including MIT/Apache/BSD, caniuse-lite (CC-BY-4.0), lightningcss packages
(MPL-2.0) and node-forge (BSD-3-Clause OR GPL-2.0). These metadata flags do not mean
every entry ships in the app, and a dual-license option is not automatically a
requirement to license the entire app under GPL.

Next audit the actual distributed JS/native components and Python deployment,
read required notices/license conditions, and produce a third-party notices file.
No custom font asset was found in mobile/assets; icons and other images have not
had ownership or originality verified. Obtain provenance for each asset and any
restaurant branding/receipt template. Check RouteRunner name/trademark conflicts
in the intended markets; App Store name availability alone is not legal clearance.
No trademark or patent clearance search has been completed.

### R8 — Legal scope and Apple declarations require owner decisions

Confirm publisher (individual/business), tester/customer locations, business's
authority to process customer receipts, intended uses and support contact. Review
applicable privacy/security and breach-response duties with counsel where needed.
Do not assume GDPR/CCPA applies, or does not apply, without facts. Massachusetts
201 CMR 17 has a specific personal-information definition involving names plus
certain identifiers/account data; an address alone is not automatically enough
to establish that particular law applies. Full receipt photos may contain more.
[Massachusetts regulation](https://www.mass.gov/regulations/201-CMR-1700-standards-for-the-protection-of-personal-information-of-ma-residents).

Answer age-rating, encryption/export and any trader/business declarations from
the actual build and intended countries. Do not automatically set a non-exempt
encryption flag without reviewing the archive and dependencies.
[Apple export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/).
Avoid guaranteed-accuracy or guaranteed-delivery claims; predicted ages exclude
traffic/service time, and drivers must interact safely while stopped. Store review
requires rights to included content and services, not just functional code.

## Proposed order of work

1. Confirm membership, iPhone access, publisher/countries and internal/external
   testers. Choose a small synthetic-data beta and decide Google-only versus a
   separately justified Apple flow.
2. Fix the confirmed licensing/data-flow concern and production API exposure;
   choose a reachable HTTPS backend and tester-access model before deployment.
3. Implement accurate privacy/policy links, minimal permissions, data removal/
   cache handling and license notices. Obtain missing publisher/asset facts.
4. Configure EAS/store build without auto-submission; inspect build contents and
   generated iOS privacy/SDK details. Compile and install on an actual iPhone.
5. Test camera/OCR, denied permissions, address confirmation, restart/deletion,
   eight-stop routing and Maps return on the release build. Existing Android
   evidence (183 mobile/250 backend tests and Hermes export) remains useful but
   does not establish iOS readiness. Final Phase 9 device cases are still pending.
6. Prepare App Store Connect app/beta information, privacy answers, feedback
   contact and review instructions using synthetic examples. Review a concrete
   submission checklist with the user before uploading or submitting anything.

No new runtime implementation occurred, so no emulator rebuild or new manual
test is required for this report. Every later implementation must include numbered
tests and expected results. Every commit still requires explicit confirmation.
