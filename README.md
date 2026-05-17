# IITC Smooth User Follow

Small IITC helper plugin to enable smoother user-location following.

This first pass does **not** do viewport biasing. It keeps IITC north-up and pans toward the user's current position only after the marker leaves an inner dead zone. It also rate-limits camera moves so GPS marker updates stay separate from map movement.

## What it does

- Wraps `window.plugin.userLocation.onLocationChange()`.
- Lets IITC's `user-location` plugin keep updating the marker, accuracy circle, orientation, and hooks.
- Suppresses the built-in abrupt follow recenter while smooth follow is active.
- Uses `map.panTo()` instead of `map.setView()` for follow camera movement.
- Adds a tiny desktop control:
  - `SF` toggles smooth follow.
  - `SIM` starts/stops simulated movement for desktop testing.

## Requirements

Enable IITC's built-in **User Location** plugin first. This plugin is a helper around that plugin; it does not replace the user marker or browser geolocation watch.

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
npm run build
python3 -m http.server 8000
```

Then install from:

```text
http://localhost:8000/dist/smooth-user-follow.user.js
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
  intervalMs: 1000,
  segmentLengthMeters: 350,
});
```

## First-pass defaults

```js
{
  enabled: true,
  deadZonePad: 0.15,
  minPanIntervalMs: 1500,
  panDurationSeconds: 0.45,
  panEaseLinearity: 0.25,
}
```

`deadZonePad: 0.15` matches IITC's current inner 70% viewport threshold. The difference is that this plugin pans smoothly and rate-limits camera movement.

## Future work

- Add viewport biasing so the user appears lower on the screen.
- Add heading/vector-aware north-up biasing.
- Consider route-aware lookahead from Portal Route later.
- Consider whether this should remain separate or be folded into IITC's `user-location.js`.
