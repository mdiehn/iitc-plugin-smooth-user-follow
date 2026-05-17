# IITC plugin: Follow Mode

Follow Mode is an IITC plugin that makes the user-location view behave more like a navigation app.

It keeps IITC's normal user-location marker updates, but replaces abrupt camera catch-up behavior with smoother movement, heading-up map rotation, and optional viewport bias so more map is visible ahead of you.

## Status

Latest development build: `0.2.9-dev`

Version 0.2.9-dev changes the README install links to the same GitHub raw URL form used by Portal Route, which works better for IITC Mobile installs.

Heading-up rotation is useful while following your location, but normal IITC map tapping or dragging can feel odd while the map is rotated. Turn off **Heading-up map rotation** when you want normal map interaction.

**Install:** [`follow-mode.user.js`](https://github.com/mdiehn/iitc-follow-mode/raw/refs/heads/main/dist/follow-mode.user.js)

Plugin-manager metadata URL: [`follow-mode.meta.js`](https://github.com/mdiehn/iitc-follow-mode/raw/refs/heads/main/dist/follow-mode.meta.js)

## Quick start

1. Enable IITC's built-in **User Location** plugin.
2. Open IITC on mobile or desktop.
3. Open **Follow Mode Opt** from the IITC toolbox/sidebar.
4. Enable **Follow my location**.
5. Leave **Heading-up map rotation** and **Viewport bias** on if you want navigation-style behavior.

## Options panel

Follow Mode adds a **Follow Mode Opt** entry to IITC's toolbox/sidebar rather than using map-space controls.

The main options are:

- **Follow my location**: turn smooth camera follow on or off.
- **Heading-up map rotation**: rotate the map so your heading points toward the top of the screen.
- **Viewport bias**: keep your marker lower on the screen so more map is visible ahead.
- **Show heading indicator**: draw a small direction arrow over the user marker.
- **Use phone orientation when stopped or slow**: use device orientation when available, so heading-up can work while standing still.
- **User screen position**: tune how low the marker sits when viewport bias is enabled. `0.70` means about 70% down from the top.

The detailed tuning controls live under **Show dev options**:

- camera timing and smoothing
- prediction limit
- rotation smoothing and speed threshold
- simulator speed, interval, and segment length
- simulator start/stop button

## Main features

- Smooth follow camera that eases toward a predicted user position.
- Heading-up map rotation using movement heading, browser GPS heading, or phone orientation when available.
- Viewport bias that keeps the user lower on the screen, leaving more room ahead.
- Heading indicator overlay on the user marker.
- Desktop simulator for testing movement without walking or driving.
- Simulator auto-stop when real GPS/location data arrives.

## Requirements

For real GPS follow behavior, enable IITC's built-in **User Location** plugin. Follow Mode wraps that plugin so IITC still owns the user marker, accuracy circle, and normal user-location hooks.

For desktop simulation only, Follow Mode can run without IITC User Location. It creates a small fallback marker so the camera behavior can be tested from a desktop browser.

## Heading behavior

Browser geolocation heading is direction of travel. It usually does not change when the phone rotates in place while standing still.

Phone orientation heading is used when available and when the user is stopped or moving slowly. Some mobile browsers may require an extra permission prompt for orientation data.

## Heading-up caveat

Heading-up rotation is done as a visual CSS rotation of Leaflet's map pane. This works for follow-mode viewing, but normal map tapping or dragging can feel odd while the map is rotated. Turn off **Heading-up map rotation** when you want normal IITC map interaction.

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

The generated `.user.js` and `.meta.js` headers point to the current Git branch on GitHub. For local testing, load the localhost `.user.js` directly, or use your dev loader to override the source URL.

Tampermonkey may cache aggressively. Bump `VERSION` or append a query string while testing.

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

`cameraSmoothing` controls how much of the remaining distance the camera moves each base interval. Larger values catch up faster; smaller values feel heavier and smoother.
