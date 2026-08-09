# TrueLine — four-wheel alignment with the phone you already own

A installable, offline-first PWA that measures **camber, total and individual toe,
caster, SAI, included angle and Ackermann** on a car sitting on your own driveway.
No adapter, no dongle, no account, no network. Every reading comes from the
phone's own accelerometer and gyroscope, and every byte of data stays in the
browser.

```
cd alignment-pwa
npm start              # http://localhost:5173
npm run serve:https    # https on your LAN — what you need on a phone
npm test               # 39 unit tests, no dependencies
```

Motion sensors are only exposed on a secure origin. `localhost` counts, but the
address your phone uses does not, which is what `serve:https` is for: it mints a
self-signed certificate, prints the LAN URL, and your phone will let you through
after one warning. Then **Share → Add to Home Screen** (iOS) or **Install app**
(Android) and it runs with no signal at all.

## What you need

| | |
|---|---|
| Any phone with a gyroscope | camber, caster, SAI, Ackermann |
| …plus a straight-edge longer than a rim (a 600 mm spirit level is ideal) | toe |
| …plus a tape measure | the thrust angle, and toe without a gyro |

## How it measures

**Camber** is pure gravity. Stand the phone against the rim lip at 12 and 6
o'clock; the wheel plane's tilt off vertical *is* the camber. The reading comes
from the elevation of the phone's screen normal, which makes it immune to
rotation about the contact line — you can hold the phone at any angle against the
rim and it reads the same.

**Toe** is the angle between two wheels, and no sensor sees two wheels at once. A
compass is useless next to a tonne of steel, so the app uses the gyroscope as a
memory instead: rest the straight-edge across a rim so it touches the lip fore
and aft, capture the bar's heading, then walk to the next wheel while the gyro
counts every degree you turn. Differences between those headings are the toe
angles.

**Caster and SAI** are inferred, exactly as an alignment rack does it: steer one
way, steer the other, and watch what the camber does. The phone measures both the
steer angle and the camber at the same time from the same pose.

## What makes it different from Gyraline

Gyraline pioneered the phone-as-alignment-head idea and sells a rim adapter (and
now a dedicated sensor board) to go with it. This is the same physics aimed
somewhere else — at the accuracy problems a real driveway creates:

- **Loop closure.** The toe walk ends back at the wheel it started on. Whatever
  heading the gyro quietly lost in between is measured directly and spread back
  across the captures in proportion to time, instead of being assumed away. The
  app tells you the drift rate it saw, in °/min, every single walk.
- **Ground-slope correction.** Lay the phone on the floor between a pair of
  wheels and the app subtracts that axle's cross-slope from its camber, and the
  fore/aft slope from caster. Your driveway no longer has to be a level rack.
- **Bar-tilt correction.** A straight-edge lying in a cambered wheel plane reads
  a heading rotated by roughly (bar tilt × camber) — 0.17° of phantom toe at 5°
  of tilt on a 2° cambered wheel. Because the app already knows that wheel's
  camber, it removes the error instead of nagging you to be perfect.
- **Runout cancelling.** Optional two-pass camber: measure, roll the car half a
  wheel turn, measure again. The average kills a bent or dirty rim, and the
  spread is reported so you know how bad the rim is.
- **A sweep that fits, not a sweep that demands.** Caster is solved by least
  squares over whatever lock angles you actually reached, so "about 20°" is fine,
  asymmetric is fine, and a third point makes it better instead of being ignored.
- **A tie-rod calculator that learns your car.** Record the toe, make a known
  number of turns, re-measure: the app works out degrees-per-turn for *your*
  linkage and from then on tells you "1 turn + 2 flats forward" per side.
- **Hands-free.** Auto-capture when the phone goes still, a beep when it lands
  and the reading spoken aloud — because the phone is usually face-down on a rim
  where you cannot see it.
- **Free, offline, and yours.** No account, no subscription, no telemetry;
  export the whole logbook as JSON or a report as CSV whenever you like.

## Honest limits

- **The thrust angle against the geometric centreline is not measurable from
  wheel headings.** Nothing in this measurement knows where the car's body is.
  Front toe is reported against the rear axle's thrust line (which is the number
  that keeps the steering wheel straight); if you want the centreline figure, the
  Help screen has the tape-measure procedure and a field to type it into.
- **Toe accuracy is bounded by gyro drift.** The Setup screen has a 30-second
  drift test that tells you which phone you have. Under ~0.5°/min is excellent;
  above ~3°/min, use the tape-measure mode.
- **Camber and caster are angles against gravity.** With no ground-slope capture,
  they inherit whatever your floor does.
- **A rack still wins** on speed and repeatability. This is for setting toe
  properly, checking camber after a suspension change, and knowing whether a
  shop's printout is plausible.
- Chock the wheels. Never get under a car on a jack. Re-torque what you loosen.

## Layout

```
index.html            app shell
manifest.webmanifest  installability
sw.js                 precache everything for offline use
styles/app.css        one stylesheet, dark, thumb-sized
js/
  app.js              hash router + shell
  math/quat.js        quaternions, vectors, W3C Euler conversion
  math/align.js       all alignment geometry (pure, dependency-free)
  sensors/orientation.js  sensor back ends, Mahony filter, capture averaging
  core/store.js       localStorage persistence
  core/compute.js     raw captures -> corrected report
  core/feedback.js    beeps, haptics, speech, wake lock
  ui/                 hyperscript helpers, widgets, one module per screen
tools/serve.mjs       static server (+ self-signed https)
tools/make-icons.mjs  generates the PNG icons with zlib and some maths
tests/                node --test; math, pipeline, and a Playwright smoke test
```

No build step and no dependencies — it is ES modules served as-is, which means
the file you debug is the file that ships.

### Sensor back ends

1. `RelativeOrientationSensor` (Chrome/Android): platform gyro+accel fusion, no
   magnetometer, so heading is relative and immune to the car's magnetic mess.
2. `devicemotion` + `deviceorientation` (iOS Safari and everything else): our own
   Mahony filter. Tilt is corrected against gravity; heading is a pure integral
   of the gyro, with bias re-learned every time the phone is put down. The
   accelerometer's sign convention is auto-detected against the Euler angles
   rather than sniffed from the user agent.
3. `deviceorientation` only: tilt works, so camber and caster do; toe falls back
   to tape mode.

### Tests

```
npm test           # geometry and the session pipeline (pure, fast)
npm run test:browser   # boots the app in Chromium and feeds it fake motion
```

The unit tests are not just smoke: the sweep solver is checked by round-tripping
through its own forward model, and the bar-tilt correction is checked against a
wheel plane constructed in 3D, so the corrections are verified rather than
asserted.

Browser tests skip themselves when Playwright is not installed.
