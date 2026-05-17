# IITC Follow Mode

Follow Mode gives IITC a more navigation-style user-location view.

It keeps IITC's normal user-location marker updates, but replaces the abrupt
camera catch-up behavior with smoother camera movement, optional heading-up map
rotation, and optional viewport bias so more map is visible ahead of you.

## Mini control

The plugin adds a small Leaflet-style control on the left side of the map:

```text
F   smooth follow on/off
R   heading-up map rotation on/off
B   viewport bias on/off
=   settings
```

The buttons highlight when enabled. The buttons intentionally do not use hover
tooltips, since those are annoying on mobile.

## Main features

- Smooth follow camera that eases toward a predicted user position.
- Heading-up map rotation using movement heading, browser GPS heading, or phone
  orientation when available.
- Viewport bias that keeps the user lower on the screen, leaving more room
  ahead.
- Heading indicator overlay on the user marker.
- Desktop simulator for testing movement without walking or driving.
- Simulator auto-stop when real GPS/location data arrives.

## Requirements

For real GPS follow behavior, enable IITC's built-in **User Location** plugin.
Follow Mode wraps that plugin so IITC still owns the user marker, accuracy
circle, and normal user-location hooks.

For desktop simulation only, Follow Mode can run without IITC User Location. It
creates a small fallback marker so the camera behavior can be tested from a
desktop browser.

## Settings

The normal settings panel keeps only the common choices visible:

- heading indicator on/off
- phone orientation heading on/off
- user screen position for viewport bias
- simulator auto-stop when real GPS arrives

The detailed tuning controls live under **Show dev settings**:

- camera timing and smoothing
- prediction limit
- rotation smoothing and speed threshold
- simulator speed, interval, and segment length
- simulator start/stop button

## Heading behavior

Browser geolocation heading is direction of travel. It usually does not change
when the phone rotates in place while standing still.

Phone orientation heading is used when available and when the user is stopped or
moving slowly. Some mobile browsers may require an extra permission prompt for
orientation data.

## Heading-up caveat

Heading-up rotation is done as a visual CSS rotation of Leaflet's map pane. This
works for follow-mode viewing, but normal map tapping or dragging can feel odd
while the map is rotated. Turn off **R** when you want normal IITC map
interaction.

## Build

```sh
npm run build
```

Output:

```text
dist/follow-mode.user.js
dist/follow-mode.meta.js
```

## Local dev install

```sh
npm run dev
```

Then install from:

```text
http://localhost:8000/dist/follow-mode.user.js
```

The generated `.user.js` and `.meta.js` headers point to the same local dev
server:

```text
@updateURL   http://localhost:8000/dist/follow-mode.meta.js
@downloadURL http://localhost:8000/dist/follow-mode.user.js
```

Tampermonkey may cache aggressively. Bump `VERSION` or append a query string
while testing.

## Console helpers

```js
window.plugin.followMode.setFollowing(true);
window.plugin.followMode.setFollowing(false);

window.plugin.followMode.simulator.start();
window.plugin.followMode.simulator.stop();
window.plugin.followMode.simulator.step();
```

Optional simulator settings:

```js
window.plugin.followMode.simulator.start({
  speedMps: 30,
  intervalMs: 250,
  segmentLengthMeters: 350,
});
```

## Current defaults

```js
{
  cameraIntervalMs: 100,
  cameraSmoothing: 0.22,
  cameraStopDistanceMeters: 1.5,
  predictionMaxMs: 1500,
  viewportBiasEnabled: true,
  viewportBiasY: 0.70,
  headingIndicatorEnabled: true,
  headingUpEnabled: true,
  deviceOrientationHeadingEnabled: true,
  simulatorSpeedMps: 12,
  simulatorIntervalMs: 250,
}
```

`cameraSmoothing` controls how much of the remaining distance the camera moves
each base interval. Larger values catch up faster; smaller values feel heavier
and smoother.
