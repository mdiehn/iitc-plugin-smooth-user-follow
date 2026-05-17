# Changelog

## 0.1.6-dev

- Auto-stop the simulator when real browser/IITC location fixes arrive.
- Capture browser geolocation speed and heading when available.
- Add supplemental browser geolocation while smooth follow is active so heading/speed metadata is available even if IITC already started its own watch.
- Add optional device-orientation heading for stationary heading-up rotation.
- Prefer movement heading while moving and device orientation while stationary or slow.
- Add settings for geolocation heading, device-orientation heading, stationary orientation speed, and simulator auto-stop.

## 0.1.5-dev

- Add experimental viewport bias so the user can sit lower in the visible map.
- Add experimental heading-up visual map rotation based on estimated bearing.
- Add settings for viewport bias, user screen Y position, heading-up rotation,
  rotation smoothing, and minimum speed for rotation.
- Pass simulator speed and bearing metadata into the shared location-fix path
  when using the fallback simulator marker.

## 0.1.4-dev

- Switched the camera loop to `requestAnimationFrame`.
- Added timestamped location fixes with speed and bearing estimation.
- Added short-term predicted camera targets between discrete GPS/simulator fixes.
- Added a heading indicator overlay on the user marker.
- Added settings for prediction limit and heading indicator visibility.


## 0.1.3-dev

- Replace dead-zone catch-up panning with a steady camera-follow loop.
- Location updates now set a target; a timer eases the map center toward that target.
- Add camera interval, smoothing, stop-distance, and simulator interval settings.
- Increase simulator update frequency for smoother desktop testing.

## 0.1.2-dev

- Point generated `@updateURL` and `@downloadURL` metadata at the local dev server.
- Keep the local URLs in both `dist/smooth-user-follow.user.js` and `dist/smooth-user-follow.meta.js`.

## 0.1.1-dev

- Add `npm run dev` for the local build/server loop.
- Let the desktop simulator create a fallback marker when IITC User Location is not enabled or not ready.
- Keep wrapping IITC User Location when its real marker is available.

## 0.1.0-dev

- Add first-pass smooth user-follow helper.
- Wrap IITC `user-location` marker updates without replacing them.
- Suppress built-in abrupt `setView()` follow recenter while smooth follow is active.
- Add desktop movement simulator.
- Add small `SF` / `SIM` Leaflet control.
