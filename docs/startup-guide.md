# RouteRunner: setup, startup, testing, and troubleshooting

Updated October 16, 2026. This is the main startup guide for the current Windows
development setup. Older phase documents describe historical behavior and may
use port 8000. This guide consistently uses **backend port 8002** and **Metro
port 8081**.

## What runs where

| Part | Purpose | Location / address |
| --- | --- | --- |
| Python/FastAPI backend | Google address lookup and route optimization | Repository root; port 8002 |
| Metro/Expo | Serves the mobile JavaScript bundle | `mobile/`; normally port 8081 |
| Android emulator | Runs the installed RouteRunner Android app | Android Studio Device Manager |
| API documentation | Send backend test requests from your computer | http://127.0.0.1:8002/docs |
| Backend health | Confirm the API process is responding | http://127.0.0.1:8002/health |
| Backend Google usage | Local counters, limits and gross estimates | http://127.0.0.1:8002/maps/usage |

Repository location:

```text
C:\Users\nickl\OneDrive\Desktop\Personal Projects\Delivery-Route-Planner
```

Use separate PowerShell terminals for the backend and mobile tooling. Leave both
running while testing. Start the emulator before launching the Android app.

## Everyday startup

### 1. Start the backend — terminal one

```powershell
Set-Location 'C:\Users\nickl\OneDrive\Desktop\Personal Projects\Delivery-Route-Planner'
.\.venv\Scripts\python.exe -m uvicorn delivery_router.api.app:app --host 127.0.0.1 --port 8002
```

Success: the terminal reports Uvicorn running on `http://127.0.0.1:8002`.
Open http://127.0.0.1:8002/health; expect `{"status":"ok"}`. Health confirms the
process is running, not that your Google key or billing configuration works.

There is no need to activate the virtual environment when invoking its Python
executable directly. Run this command from the repository root so `.env` is found.

### 2. Start the Android emulator

In Android Studio, open **Device Manager** (from the welcome screen, use
**More Actions → Virtual Device Manager**, if shown). Press the Play button for
**Medium_Phone_API_35**. Wait until the Android home screen appears.

Alternatively, in another PowerShell terminal:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone_API_35
```

This AVD name and SDK executable exist on the current machine. On another
machine, list its configured AVDs with:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -list-avds
```

### 3. Start and launch the Android app — terminal two

For the reliable build/install/launch path:

```powershell
Set-Location 'C:\Users\nickl\OneDrive\Desktop\Personal Projects\Delivery-Route-Planner\mobile'
npm run android
```

This runs the repository's `expo run:android` script. It builds or incrementally
rebuilds the native app, installs/launches it, and starts Metro when needed.
First builds take longer. Success: **RouteRunner** opens in the emulator.

If RouteRunner is already installed and you only need JavaScript changes:

```powershell
Set-Location 'C:\Users\nickl\OneDrive\Desktop\Personal Projects\Delivery-Route-Planner\mobile'
npm start -- --clear
```

Then open the installed **RouteRunner** app from the emulator's app drawer.
Reload the app from its development menu if necessary. Do not open Expo Go for
the OCR workflow: native ML Kit requires the project's native Android build.
Do not assume Metro's `a` shortcut launches the installed custom app; use
`npm run android` if you are unsure.

If Metro is already running and you need to rebuild/install the native app,
run this in an additional terminal:

```powershell
npm run android -- --no-bundler
```

Do not start multiple Metro instances for the same app. If Metro chooses another
port, use the port it prints when setting up any debugging port forwarding.

## Configuration: the two different .env files

### Backend: `.env` in the repository root

```dotenv
APP_ENVIRONMENT=development
MAP_PROVIDER=google
GOOGLE_MAPS_API_KEY=YOUR_PRIVATE_BACKEND_KEY
GOOGLE_MAPS_REGION=us
GOOGLE_MAPS_COMPONENTS=country:US
GOOGLE_MAPS_BOUNDS=42.20,-71.90|42.35,-71.70
GOOGLE_MAPS_TIMEOUT_SECONDS=10
GOOGLE_MAPS_MAX_ATTEMPTS=2
GOOGLE_MAPS_DEADLINE_SECONDS=20
GOOGLE_MAPS_MONTHLY_LIMIT_USD=5
GOOGLE_MAPS_GEOCODING_DAILY_LIMIT=500
GOOGLE_MAPS_MATRIX_DAILY_LIMIT=2000
GOOGLE_MAPS_USAGE_DB=data/private/maps-usage.sqlite3
```

Replace the sample key locally; do not leave a placeholder. The key's project
needs billing, **Geocoding API**, and **Routes API** enabled. Allow those APIs in
the backend key's restrictions. An Android-package-restricted key is not a
backend key. Find existing keys in Google Cloud **APIs & Services → Credentials**.

Use only the country filter above for the current nearby-town behavior. An old
`locality:Worcester` component is a hard restriction and can exclude neighboring
towns. Bounds are a soft bias, not a delivery boundary.

Save changes, stop the backend with **Ctrl+C**, and start it again. Editing an
environment file does not update settings already loaded by a running process.

### Mobile: `mobile/.env`

For the standard Android emulator:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:8002
```

`10.0.2.2` means the host computer's loopback interface from the Android emulator.
`127.0.0.1` inside Android normally means the emulator itself. The computer's
browser still uses `127.0.0.1:8002`.

The optional `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is a **separate Android Maps SDK
key**, used for the embedded map. Restrict it to Maps SDK for Android and the
app package/signing certificate. The package is `com.livingwell088.routerunner`.
Adding/changing that key requires `npm run android` to update native config.
Address lookup does not require putting the backend key in this file.

Restart Metro after changing mobile `.env`. Both `.env` files are ignored by Git.
Never put the private backend key in an `EXPO_PUBLIC_*` variable or screenshots.
The checked-in `mobile/.env.example` has older sample host/port values; explicitly
set the emulator URL above rather than using those samples unchanged.

### If either file is missing

From the repository root, copy only missing files so saved keys are not replaced:

```powershell
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
if (-not (Test-Path -LiteralPath 'mobile/.env')) {
    Copy-Item -LiteralPath 'mobile/.env.example' -Destination 'mobile/.env'
}
```

Edit them using the settings above. In File Explorer, enable **View → Show → File
name extensions** if needed; make sure the file is `.env`, not `.env.txt`.

## First-time dependency setup

Skip this section on a machine where the current app already builds and runs.

Requirements: Python 3.11+, Node.js 22.13.x or newer as required by Expo SDK 57,
npm, and Android Studio with the Android SDK/platform tools, emulator, and a
configured virtual device. Configure the Gradle JDK supported by the installed
Android toolchain in Android Studio; if a command-line build reports Java is
missing, configure `JAVA_HOME` to that installed JDK rather than an invented path.

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
Set-Location mobile
npm ci
```

Then configure both environment files and follow everyday startup. `npm ci`
installs dependencies from the lockfile; do not run it every time you launch.

## Check the backend independently of Android

Open http://127.0.0.1:8002/docs, expand **POST /addresses/validate**, choose
**Try it out**, replace the entire example body with this, and press **Execute**:

```json
{"address":"455 Main St, Worcester, MA 01608"}
```

Do not leave Swagger's literal `"string"` values in the request. `context` is
optional for a full address. Expect HTTP 200 with the matching Worcester
candidate and `status: "needs_confirmation"`. `validated_location: null` remains
expected until the selected candidate is confirmed through `POST /addresses/confirm`.
The lookup also returns `lookup_reference`; see [Step 4](phase-7-confirmed-locations.md)
for the confirmation body. This live lookup consumes Google usage.

For more address tests and expected results, see
[Step 2 live address checks](phase-7-address-candidates.md). For mobile review,
see [Step 3 emulator tests](phase-7-mobile-review.md).

For confirmed-location routing and its manual checks, see
[Step 5: Place ID matrices](phase-7-place-id-matrix.md). Restart the backend after
updating its code; the mobile configuration and native build are unchanged by Step 5.

## Automated tests and Android bundle verification

For the current completion status and final device walkthrough, see
[Phase 7 acceptance](phase-7-acceptance.md). The cross-stack check runs actual
mobile service modules against an isolated backend with mocked Google transport:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_phase7_acceptance.py -q -p no:cacheprovider
```

It needs Node.js, makes no live Google calls, and does not use port 8002 or the
app's saved orders/usage database.

Step 6 adds a default $5 **gross-usage** allowance, ignoring Google's free usage
and credits: 1,000 combined geocoding requests/matrix elements per UTC month.
This is deliberately conservative and can stop requests while the Google bill
is still $0. View `/maps/usage` for this backend's counters. See
[usage controls and manual checks](phase-7-usage-controls.md) for configuration.
Keep `data/private/maps-usage.sqlite3` across backend restarts; deleting it resets
local accounting. It contains counters, not addresses or credentials.

Backend, from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
```

Mobile, from `mobile/`:

```powershell
npm test
```

These suites use mocked provider responses and do not need live Google requests.
The cache plugin is disabled for Python because the existing pytest cache has
had Windows permission issues in this workspace.

Verify Android JavaScript/Hermes bundling, from `mobile/`:

```powershell
.\node_modules\.bin\expo.cmd export --platform android --output-dir dist/startup-check
```

Success: Expo prints **Exported: dist/startup-check** and an `.hbc` bundle.
This checks bundling; it does not install an APK or prove the UI works. The
output directory is Git-ignored. Use a normal local terminal if an automation
sandbox prevents executing the installed Hermes compiler.

## Emulator utilities

Check connected devices:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

Expect an entry such as `emulator-5554` with status `device`, not `offline`.
With several devices connected, use `-s emulator-5554` (or the actual serial)
before other adb commands.

If the native app cannot reach Metro on its usual port:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
```

An alternative backend connection is adb reverse plus
`EXPO_PUBLIC_API_URL=http://127.0.0.1:8002`:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8002 tcp:8002
```

Use either this backend forwarding setup or the standard `10.0.2.2` setup;
remember to restart Metro after changing its environment. Forwarding can need
to be reapplied after emulator/device restarts.

To make a synthetic receipt image available to Android's photo picker:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" push `
  'C:\Users\nickl\OneDrive\Desktop\Personal Projects\Delivery-Route-Planner\data\fixtures\receipts\receipt-001-clean-reprint.png' `
  '/sdcard/Download/receipt-001-clean-reprint.png'
```

Use the app's receipt image picker and browse Downloads. If the image is not
visible yet, use the emulator's Files app to locate it or refresh the picker.
Use committed synthetic fixtures, not private customer receipts, for shared tests.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `.env` changes seem ignored | Save the root file, run backend from root, stop/restart it. An existing shell environment variable can override a file value. Do not print keys while diagnosing. |
| Google configuration error | Replace placeholder; enable Geocoding/Routes and billing; check key/API/application restrictions. Restart after correcting config. |
| Startup rejects Google key/provider | Set `MAP_PROVIDER=google` with a nonblank key. A key in development-provider mode is deliberately rejected. |
| Browser `/health` fails | Backend is stopped, wrong port, or startup failed. Read terminal one. |
| Browser works but emulator lookup fails | Check `mobile/.env` host/port, restart Metro, and ensure backend still runs. Use `10.0.2.2:8002` unless deliberately using adb reverse. |
| Address lookup waits/fails | Wait up to 25 seconds; retain the draft and retry after fixing network/server. Do not keep tapping retry for a quota error. |
| Blank embedded map | Check the separate Android Maps SDK key and native rebuild. Backend Geocoding success does not configure the map SDK. |
| ML Kit/native module missing in Expo Go | Build and launch RouteRunner with `npm run android`; do not test receipt OCR in Expo Go. |
| No emulator detected | Boot it completely; check `adb devices`; select the correct serial if several are attached. |
| Port 8002 or 8081 is occupied | Reuse the intended running process or stop it in its terminal with Ctrl+C. Do not kill unrelated processes. Keep configured ports consistent. |
| Script execution policy blocks npm.ps1 | Use `npm.cmd` in place of `npm`; do not weaken machine-wide execution policy just to launch the app. |
| Python activation script is blocked | Use `.\.venv\Scripts\python.exe` directly, as above. |
| Route requires address confirmation | Restart the backend after updating to Step 4. Confirm the restaurant on Orders. Expired or changed destinations require a fresh lookup; remove and add an order again if its destination needs review. |

To inspect listeners without stopping anything:

```powershell
Get-NetTCPConnection -LocalPort 8002,8081 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

## Shutdown and saved state

Press **Ctrl+C** in the backend and Metro terminals. Close the emulator when
finished. App orders and receipt fingerprints are currently session-scoped;
a full app restart clears them. The navigation preference persists. Backend
order CRUD storage is also in memory and resets with the backend.

Development-provider mode is for backend estimates/tests only. It cannot satisfy
the new mobile Google candidate-review requirement. Google live lookups and
route calculations can consume billable usage; billing alerts do not stop calls.

## Optional physical-device / iOS notes

For a physical phone, use the computer's LAN IP in the mobile backend URL and
start Uvicorn with `--host 0.0.0.0`; the phone must be on a reachable network and
Windows Firewall must allow the intended port. Do not expose the development
server publicly. This project's current manual target is the Android emulator.

An iOS simulator can use `127.0.0.1:8002`, but local iOS simulator/build tooling
requires macOS/Xcode. Windows Android checks do not verify Apple Maps behavior.

## Reference

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Current backend contract/configuration](phase-7-foundation.md)
- [Address evaluation and live test results](phase-7-address-candidates.md)
- [Mobile review implementation and emulator checklist](phase-7-mobile-review.md)
- [Receipt OCR validation](phase-6-validation.md)
