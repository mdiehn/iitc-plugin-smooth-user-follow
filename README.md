# IITC Follow Mode Add-on

A small IITC add-on that makes the **User Location** follow camera smoother and more useful while walking, biking, or driving.

Follow Mode keeps IITC's normal user-location marker, but changes how the map follows it:

- smoother camera movement
- optional heading-up map rotation
- optional screen bias so more map is visible ahead of you
- small heading indicator on the user marker
- manual drag/zoom suspension so the plugin does not fight you

## Install

Install the plugin here:

**[follow-mode.user.js](https://github.com/mdiehn/iitc-plugin-follow-mode/raw/refs/heads/main/dist/follow-mode.user.js)**

Plugin-manager metadata URL:

**[follow-mode.meta.js](https://github.com/mdiehn/iitc-plugin-follow-mode/raw/refs/heads/main/dist/follow-mode.meta.js)**

Current release: `1.0.0`

## Requirements

Enable IITC's built-in **User Location** plugin first.

Follow Mode depends on IITC User Location for the actual GPS marker, accuracy circle, and location updates. This plugin only improves how the map camera follows that location.

Recommended: in IITC's User Location settings, disable IITC's built-in user heading display. Follow Mode has its own heading indicator, and using both can be visually noisy.

## Quick use

1. Install the plugin.
2. Enable IITC's built-in **User Location** plugin.
3. Open Intel/IITC.
4. Tap the small reticle control on the map to start following your location.
5. Tap it again to stop.
6. If you drag or zoom the map, Follow Mode suspends the camera. Tap the reticle again, or use **Resume Follow**, to resume.

## Where the options are

Open **Follow Mode Opt** from IITC's toolbox/sidebar.

The options dialog has the normal user-facing controls near the top. Extra tuning and simulator controls are hidden under **Show dev options**.

The small reticle control on the map is meant for field use:

- tap once to start Follow Mode
- tap again to stop Follow Mode
- tap while suspended to resume the follow camera

## Main options

### Follow my location

Turns the smooth follow camera on or off.

When this is enabled, Follow Mode eases the map toward your current or predicted position instead of letting IITC jump the map abruptly.

### Heading-up map rotation

Rotates the map so your heading points toward the top of the screen.

This makes IITC feel more like a navigation app. Turn it off when you want normal north-up map behavior.

### Viewport bias

Keeps your marker lower on the screen so more map is visible ahead of you.

The **User screen position** option controls how far down the marker sits. `0.70` means roughly 70% down from the top of the screen.

### Show heading indicator

Draws a small direction indicator over the user marker.

This can replace IITC User Location's built-in heading arrow, which may be too large or distracting depending on your setup.

### Use phone orientation when stopped or slow

Uses phone orientation when available, so heading-up can still work while you are standing still or moving slowly.

Browser GPS heading usually means direction of travel. It often does not update just because you rotate the phone in place.

Some mobile browsers may ask for motion/orientation permission.

### Suspend follow camera when I drag or zoom the map

Stops the follow camera from fighting manual map interaction.

When you drag or zoom the map, Follow Mode freezes camera movement and keeps the current rotation. Your user marker still updates. Use the reticle control or **Resume Follow** to continue following.

This should usually stay enabled.

## Advanced/dev options

The dev section includes tuning controls for:

- camera timing and smoothing
- prediction limit
- rotation smoothing and speed threshold
- simulator speed, interval, and segment length
- optional ahead portal loading

Most users should not need these.

## Ahead portal loading

Ahead portal loading is experimental and is **disabled by default**.

When enabled, Follow Mode asks IITC to load map-data tiles ahead of your current heading while Follow Mode is active. This may help portals appear before they enter the visible map area.

Important notes:

- It makes extra Intel map-data requests beyond normal viewing.
- It is heading-based, not route-based.
- It does not follow roads, trails, or Portal Route paths.
- It should be used conservatively.
- Leave it off unless you are intentionally testing it.

To find it:

**Follow Mode Opt → Show dev options → Load portals ahead while following**

Keep the tile limit low and the polling interval conservative.

## Manual map behavior

Heading-up rotation is done by visually rotating Leaflet's map pane. That is useful while following your own location, but normal Leaflet dragging is still based on the unrotated map.

For that reason, Follow Mode suspends the follow camera when you manually drag or zoom. This avoids surprising movement while your finger is on the map.

Turn off **Heading-up map rotation** when you want to browse the map normally for a while.

## Desktop simulator

The dev options include a small simulator for desktop testing. It creates simulated movement so you can test camera follow, heading-up rotation, and viewport bias without walking or driving.

The simulator stops automatically when real GPS/location data arrives.

Console helpers are also available:

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

The generated `.user.js` and `.meta.js` headers point to the current Git branch on GitHub. For local testing, load the localhost `.user.js` directly, or use a dev loader to override the source URL.

Tampermonkey may cache aggressively. Bump `VERSION` or append a query string while testing.

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
  aheadFetchEnabled: false,
  simulatorSpeedMps: 12,
  simulatorIntervalMs: 250,
}
```

`cameraSmoothing` controls how much of the remaining distance the camera moves each base interval. Larger values catch up faster; smaller values feel heavier and smoother.
