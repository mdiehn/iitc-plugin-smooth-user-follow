# Changelog

## 0.2.13-dev

- Position the plugin as **IITC plugin: Follow Mode Add-on**.
- Change the userscript category to **Add-on**.
- Update README wording to describe Follow Mode as an add-on for IITC **User Location**.
- Promote the ahead-portal loading field test into its own README section while keeping it under dev options.

## 0.2.12-dev

- Add first-pass ahead portal loading while Follow Mode is active.
- Fetch a conservative set of IITC map-data tiles ahead of the current heading without moving the map.
- Add dev options for ahead distance, wedge angle, poll interval, movement threshold, and tile limit.

## 0.2.11-dev

- Make Follow Mode's heading indicator easier to see during road testing.
- Recommend disabling IITC's built-in user heading display while using Follow Mode.
## 0.2.10-dev

- Update repository/package naming and generated URLs for `mdiehn/iitc-plugin-follow-mode`.
- Keep dist filenames as `follow-mode.user.js` and `follow-mode.meta.js`.

## 0.2.9-dev

- Change README install and metadata links to GitHub raw URLs matching the Portal Route install style.
- Keep generated userscript update/download metadata branch-aware.

## 0.2.8-dev

- Apply Follow Mode option changes from the dialog **OK** button.
- Remove the separate **Save options** button from the Options dialog.

## 0.2.7-dev

- Update the userscript metadata description wording.
- Use GitHub raw URLs in the README install and metadata links.

## 0.2.6-dev

- Remove the Leaflet mini control to avoid using map viewport space.
- Add a **Follow Mode Opt** entry through IITC toolbox/sidebar controls.
- Move Follow, heading-up rotation, and viewport-bias toggles into the Options panel.
- Rename the user-facing dialog from Settings to Options.

## 0.2.5-dev

- Tighten the mini-control button width for the single-letter `F`, `R`, `B`, and `=` labels.
- Remove the leftover extra horizontal padding from the earlier longer labels.

## 0.2.4-dev

- Add branch-aware build URLs for generated `@updateURL` and `@downloadURL` metadata.
- Stamp generated `-dev` userscript versions with a build timestamp.
- Generate `follow-mode.meta.js` from the userscript metadata block.
- Update README install and metadata links during build.
- Add `npm run check` to build and syntax-check the generated userscript.

## 0.2.3-dev

- Update the README top section to match the Portal Route style.
- Add a clear bold install link to `follow-mode.user.js`.
- Keep the plugin-manager metadata URL near the top of the README.

## 0.2.2-dev

- Point generated metadata at the real GitHub raw URLs.
- Add an install section near the top of the README with links to the metadata and userscript files.

## 0.2.1-dev

- Shorten the mini control labels from `SF`, `ROT`, and `BIAS` to `F`, `R`, and `B`.
- Update the README and settings text to explain the compact control labels.

## 0.2.0-dev

- Rename the plugin to Follow Mode.
- Rename the build output to `follow-mode.user.js` and `follow-mode.meta.js`.
- Replace the mini control with four buttons: `SF`, `ROT`, `BIAS`, and `=`.
- Remove mobile-unfriendly title tooltips from the mini control buttons.
- Move simulator controls out of the mini control and into dev settings.
- Split the settings dialog into main settings and hidden dev settings.
- Persist settings in `localStorage`.
- Add a proper README focused on initial use and the mini control.

## 0.1.6-dev

- Auto-stop the simulator when real browser/IITC location fixes arrive.
- Capture browser geolocation speed and heading when available.
- Add supplemental browser geolocation while follow mode is active so heading/speed metadata is available even if IITC already started its own watch.
- Add optional device-orientation heading for stationary heading-up rotation.
- Prefer movement heading while moving and device orientation while stationary or slow.
- Add settings for geolocation heading, device-orientation heading, stationary orientation speed, and simulator auto-stop.

## 0.1.5-dev

- Add viewport bias so the user can sit lower in the visible map.
- Add heading-up visual map rotation based on estimated bearing.
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
