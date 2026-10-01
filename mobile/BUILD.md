# Building the Android app

The web app is what's deployed today. A native build exists for one reason:
**reminders that fire when the app is closed.** On the web they only fire while
the tab is open, and a missed one is lost rather than shown late — for a
reminders app that is the premise, not a detail. The code for real scheduled
notifications is already written and simply short-circuits on web.

Everything below except step 3 is already committed.

## What's configured

| | |
|---|---|
| Expo account | `omar_safar` (`owner` in app.json) |
| Package id | `com.omarsafar.ferman` — **permanent** once published; changing it later means a different app, not an update |
| `preview` profile | `buildType: apk` — a file you can sideload |
| `production` profile | `app-bundle` — Play Store upload only, **cannot be sideloaded** |
| API URL | set per profile in `eas.json` |

That last row is the one that would have broken silently. `.env.production`
deliberately leaves `EXPO_PUBLIC_API_BASE_URL` empty so the *web* build uses a
relative origin — it must, because production CORS is same-origin only. An APK
has no origin, so the same empty value would resolve to `http://localhost:7860`
and the app would call the phone itself. The build profiles set the absolute
Cloud Run URL, which wins because real environment variables take precedence
over `.env` entries.

## Build it

```bash
npm install -g eas-cli
eas login                 # omar_safar
cd mobile
eas build -p android --profile preview
```

First run asks to generate an Android keystore — say yes and let Expo manage it.
Then it queues; free-tier builds wait behind paid ones, so expect minutes rather
than seconds. It finishes with a download link and a QR code.

## Check these before handing it to anyone

The native notification path has probably never run for real, so:

1. Settings → enable reminder alerts, accept the Android permission prompt.
2. Create a reminder **two minutes out**, then **close the app entirely** —
   swipe it away, don't just background it — and lock the phone. The
   notification should still fire. If it doesn't, nothing else here matters.
3. A recurring reminder on two weekdays should fire once per day, not twice.
4. Sign in with your existing account and confirm tasks and lists arrive.
5. Reboot the phone with a reminder pending and check it survives. Android drops
   scheduled alarms on reboot unless the app re-registers them, and how
   `expo-notifications` handles that in this SDK version is worth confirming
   rather than assuming.

## Two things the APK gives up

**The microphone disappears.** Voice input is the browser's Web Speech API, so
`useVoiceInput` reports `supported: false` on native and the mic button doesn't
render. Real on-device speech-to-text needs a native module — now possible,
since custom builds are exactly what unlocks it, but it is separate work.

**No auto-update.** Every change means a new build and every tester
reinstalling. A Play Store internal-testing track ($25 one-off) removes both
that and the "unknown sources" warning.

## iOS

Not configured beyond the bundle identifier. It needs an Apple Developer account
at $99/year, with no free path — TestFlight or nothing. Worth paying only when a
specific iPhone tester is blocked by web notifications.
