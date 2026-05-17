# Changelog

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
