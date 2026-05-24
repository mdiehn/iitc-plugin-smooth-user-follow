# IITC plugin: Follow Mode Add-on

Follow Mode Add-on improves IITC's **User Location** follow behavior with smoother movement, heading-up rotation, and viewport bias.

It keeps IITC's normal user-location marker updates, but replaces abrupt camera catch-up behavior with smoother movement so IITC feels more like a navigation app.

## Status

Latest development build: `0.2.18-dev`

Version 0.2.18-dev centers the reticle glyph in the standard control button so the fill and icon sit more evenly.

Heading-up rotation is useful while following your location. If you manually drag or zoom the map, Follow Mode now suspends camera movement and freezes the current rotation until you explicitly resume follow.

**Install:** [`follow-mode.user.js`](https://github.com/mdiehn/iitc-plugin-follow-mode/raw/refs/heads/main/dist/follow-mode.user.js)

Plugin-manager metadata URL: [`follow-mode.meta.js`](https://github.com/mdiehn/iitc-plugin-follow-mode/raw/refs/heads/main/dist/follow-mode.meta.js)

## Quick start

1. Enable IITC's built-in **User Location** plugin.
2. In IITC's User Location settings, disable IITC's built-in user heading display. Follow Mode provides its own heading indicator and rotation.
3. Open IITC on mobile or desktop.
4. Tap the small reticle map control to start Follow Mode, or open **Follow Mode Opt** from the IITC toolbox/sidebar.
5. Leave **Heading-up map rotation** and **Viewport bias** on if you want navigation-style behavior.
6. If follow is suspended after dragging or zooming, tap the reticle control or **Resume Follow** to resume.

## Options panel

Follow Mode adds a **Follow Mode Opt** entry to IITC's toolbox/sidebar for options. It also adds a small reticle map control for field use: tap it to start Follow Mode, tap again to stop, or tap it while suspended to resume.

The main options are:

- **Follow my location**: turn smooth camera follow on or off.
- **Heading-up map rotation**: rotate the map so your heading points toward the top of the screen.
- **Viewport bias**: keep your marker lower on the screen so more map is visible ahead.
- **Show heading indicator**: draw a small direction arrow over the user marker.
- **Use phone orientation when stopped or slow**: use device orientation when available, so heading-up can work while standing still.
- **Load portals ahead while following**: field-test option to fetch map-data tiles ahead of your current heading while Follow Mode is active.
- **Suspend follow camera when I drag or zoom the map**: stop camera movement and freeze the current rotation during manual map interaction.
- **User screen position**: tune how low the marker sits when viewport bias is enabled. `0.70` means about 70% down from the top.

The detailed tuning controls live under **Show dev options**:

- camera timing and smoothing
- prediction limit
- rotation smoothing and speed threshold
- ahead-portal distance, wedge angle, poll interval, and tile limit
- simulator speed, interval, and segment length
- simulator start/stop button

## Main features

- Smooth follow camera that eases toward a predicted user position.
- Heading-up map rotation using movement heading, browser GPS heading, or phone orientation when available.
- Viewport bias that keeps the user lower on the screen, leaving more room ahead.
- Heading indicator overlay on the user marker.
- Desktop simulator for testing movement without walking or driving.
- Simulator auto-stop when real GPS/location data arrives.
- Optional experimental loading of portals ahead of your current heading.
- Manual drag/zoom suspension with an explicit **Resume Follow** control.
- Small reticle map control for starting, stopping, and resuming Follow Mode.

## Requirements

For real GPS follow behavior, enable IITC's built-in **User Location** plugin. Follow Mode wraps that plugin so IITC still owns the user marker, accuracy circle, and normal user-location hooks.

For desktop simulation only, Follow Mode can run without IITC User Location. It creates a small fallback marker so the camera behavior can be tested from a desktop browser.


## Load portals ahead

Follow Mode can optionally ask IITC to load portal data ahead of your current heading while follow mode is active.

This helps portals appear along the road or trail before they enter the visible map area, without manually panning the map.

The first version is heading-based: it looks ahead in the direction Follow Mode thinks you are moving. It does not yet follow a Portal Route path, curve with roads, or request a true route corridor.

Enable it from:

**Follow Mode Opt → Show dev options → Load portals ahead while following**

Keep the tile limit and polling interval conservative while testing so local camera movement does not turn into excessive Intel requests.

## Heading behavior

Browser geolocation heading is direction of travel. It usually does not change when the phone rotates in place while standing still.

Phone orientation heading is used when available and when the user is stopped or moving slowly. Some mobile browsers may require an extra permission prompt for orientation data.

## Manual map interaction

Heading-up rotation is done as a visual CSS rotation of Leaflet's map pane. This works well for follow-mode viewing, but normal map dragging uses Leaflet's unrotated coordinate system.

To avoid unexpected rotation changes under your finger, Follow Mode suspends the follow camera when you manually drag or zoom the map. It keeps the current rotation frozen, continues updating the user marker and heading indicator, and shows a temporary **Resume Follow** button. Tap **Resume Follow** when you want the camera and heading-up rotation to take over again.

Turn off **Heading-up map rotation** when you want normal IITC map interaction for a longer period.

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
