# Phase 4: Mobile application shell

Historical phase notes: use the [current startup guide](startup-guide.md) for
today's Google configuration, port 8002, and Android/native OCR startup.

## What is implemented

The Expo/React Native app lives in `mobile/` and provides the complete mock
workflow needed before OCR is available:

1. Request camera permission and photograph a receipt (or continue without
   permission).
2. Populate an editable confirmation form with fake receipt extraction data.
3. Confirm orders, reject duplicates, view the active list, and remove orders
   with a confirmation prompt.
4. Submit the active orders to the existing `POST /routes/optimize` endpoint.
5. Display the optimized stop order, drive time, and predicted customer wait.
6. Save an Apple Maps or Google Maps preference and open the first stop.
7. Request foreground location permission.

The photo is intentionally not uploaded or retained. OCR and receipt-image
processing belong to a later phase.

## Run locally

In terminal one, start the API from the repository root:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn delivery_router.api.app:app --reload --host 0.0.0.0 --port 8000
```

In terminal two:

```powershell
Set-Location mobile
Copy-Item .env.example .env
npm start
```

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` for the target:

- iOS simulator: `http://127.0.0.1:8000`
- Android emulator: `http://10.0.2.2:8000`
- Physical phone: `http://<computer-LAN-IP>:8000`

The phone and computer must be on the same network, and the firewall must
permit the API port. Restart Expo after changing `.env`.

## Manual acceptance walkthrough

1. Open the app and grant or deny camera permission.
2. Select **Capture receipt** or **Add mock receipt**.
3. Review and edit the three extracted fields, then confirm.
4. Add at least two more mock orders.
5. Select **Submit and optimize route**.
6. Verify the route screen shows numbered stops returned by the Python API.
7. Open Settings, change the navigation app, return to Orders, optimize again,
   and verify the route action uses the saved choice.
8. Stop the API and retry optimization to verify the error state; restart it
   and retry to verify recovery.

## Deliberate limitations

- The restaurant and mock delivery coordinates are fixed in Worcester so the
  backend's no-Google development mode can optimize them.
- Location permission is wired, but the current device position does not yet
  replace the restaurant start location.
- Orders are held in component state and reset when the app restarts. Only the
  navigation preference is persisted.
- Route progress, delivery completion, manual stop reordering, and automatic
  return-to-restaurant navigation are future workflow increments.
