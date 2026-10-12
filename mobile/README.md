# RouteRunner mobile app

Expo/React Native client for the Delivery Route Planner.

## Source layout

```text
src/
├── App.js          Application state and screen orchestration
├── components/     Reusable UI elements
├── constants/      Shared storage keys and other fixed values
├── data/           Mock receipt and restaurant data
├── screens/        One module per application screen
├── services/       Backend API clients
└── theme/          Brand colors and shared presentation styles
```

Configuration, assets, and the native entry point remain at the mobile project
root because Expo expects them there.

See `../docs/phase-4-mobile.md` for setup and the manual acceptance workflow.

See `../docs/phase-6-validation.md` for receipt parser/OCR results, correction
workflow checks and remaining physical-device validation limits. Run `npm test`
for the deterministic receipt regression suite.
# Receipt order numbers

Receipt scans prefill the printed order number from an explicit order label or the prominent number beside the date on supported Ming House receipts. Leading zeros are preserved. Missing or ambiguous numbers require selection or entry in the editable confirmation form; scans no longer generate `OCR-###` identifiers.
