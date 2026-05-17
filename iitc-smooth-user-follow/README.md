# IITC Smooth User Follow

Small IITC helper plugin for testing smoother user-location following.

This pass does **not** do viewport biasing. It keeps IITC north-up and uses a steady camera loop: location updates set the target, and the map center eases toward that target.

## What it does

- Wraps `window.plugin.userLocation.onLocationChange()` when IITC's User Location plugin is available.
- Lets IITC's `user-location` plugin keep updating the marker, accuracy circle, orientation, and hooks.
- Uses a small fallback marker for desktop simulation when IITC's User Location plugin is unavailable or not ready.
- Suppresses the built-in abrupt follow recenter while smooth follow is active.
- Uses a steady camera loop instead of dead-zone catch-up recentering.
- Location updates set the camera target; the loop eases the map center toward it.
- Adds a tiny desktop control:
  - `SF` toggles smooth follow.
  - `SIM` starts/stops simulated movement for desktop testing.

## Requirements

For real GPS follow behavior, enable IITC's built-in **User Location** plugin.

For desktop simulation only, the plugin can run without IITC User Location. In that case it creates a small fallback simulator marker so you can test camera movement without going for a drive.

## Build

```sh
npm run build
```

Output:

```text
dist/smooth-user-follow.user.js
dist/smooth-user-follow.meta.js
```

## Local dev install

One easy loop:

```sh
npm run dev
```

That runs the build and starts a local web server on port 8000.

Then install from:

```text
http://localhost:8000/dist/smooth-user-follow.user.js
```

The generated `.user.js` and `.meta.js` headers also point to the local dev server:

```text
@updateURL   http://localhost:8000/dist/smooth-user-follow.meta.js
@downloadURL http://localhost:8000/dist/smooth-user-follow.user.js
```

Tampermonkey may cache aggressively. Bump `VERSION` or append a query string while testing.

## Console helpers

```js
window.plugin.smoothUserFollow.setFollowing(true);
window.plugin.smoothUserFollow.setFollowing(false);

window.plugin.smoothUserFollow.simulator.start();
window.plugin.smoothUserFollow.simulator.stop();
window.plugin.smoothUserFollow.simulator.step();
```

Optional simulator settings:

```js
window.plugin.smoothUserFollow.simulator.start({
  speedMps: 12,
  intervalMs: 250,
  segmentLengthMeters: 350,
});
```

## First-pass defaults

```js
{
  enabled: true,
  cameraIntervalMs: 100,
  cameraSmoothing: 0.22,
  cameraStopDistanceMeters: 1.5,
  simulatorSpeedMps: 12,
  simulatorIntervalMs: 250,
}
```

`cameraSmoothing` controls how much of the remaining distance the camera moves each tick. Larger values catch up faster; smaller values feel heavier and smoother.

## Future work

- Add viewport biasing so the user appears lower on the screen.
- Add heading/vector-aware north-up biasing.
- Consider route-aware lookahead from Portal Route later.
- Consider whether this should remain separate or be folded into IITC's `user-location.js`.


## 0.1.4-dev notes

This pass uses timestamped location fixes and predicts a short-term camera target between discrete fixes. The simulator still emits ordinary point updates, which exercise the same smoothing/prediction path as real location updates. A small heading indicator is overlaid on the user marker using the estimated bearing.
