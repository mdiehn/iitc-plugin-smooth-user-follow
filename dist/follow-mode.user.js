// ==UserScript==
// @id             iitc-plugin-follow-mode
// @name           IITC plugin: Follow Mode
// @category       Controls
// @version        0.2.8-dev.20260517113021
// @namespace      https://github.com/mdiehn/iitc-follow-mode
// @updateURL      https://raw.githubusercontent.com/mdiehn/iitc-follow-mode/refs/heads/main/dist/follow-mode.meta.js
// @downloadURL    https://raw.githubusercontent.com/mdiehn/iitc-follow-mode/refs/heads/main/dist/follow-mode.user.js
// @description    Use smoothed, heading-up, IITC user-location follow movement.
// @author         Mike Diehn and Frank
// @match          https://intel.ingress.com/*
// @match          https://*.ingress.com/intel*
// @grant          none
// ==/UserScript==

(function () {
  function wrapper(plugin_info) {
    // Follow Mode for IITC
// Build placeholders are replaced by build.js.

/* global L, $, dialog */

if (typeof window.plugin !== 'function') window.plugin = function () {};

window.plugin.followMode = window.plugin.followMode || {};

(function followModePlugin() {
  const plugin = window.plugin.followMode;

  plugin.pluginId = 'follow-mode';
  plugin.version = '0.2.8-dev.20260517113021';
  plugin.buildTime = '2026-05-17T11:30:21.545Z';

  plugin.storageKey = 'plugin-follow-mode-settings';

  plugin.defaultSettings = {
    enabled: true,
    // Location updates set the target, and a camera loop eases the map center
    // toward a predicted target. Public settings keep the simple on/off pieces
    // visible; tuning knobs stay in the dev section of the settings dialog.
    cameraIntervalMs: 100,
    cameraSmoothing: 0.22,
    cameraStopDistanceMeters: 1.5,
    predictionMaxMs: 1500,
    viewportBiasEnabled: true,
    viewportBiasY: 0.70,
    headingIndicatorEnabled: true,
    headingUpEnabled: true,
    autoStopSimulatorOnRealGps: true,
    useGeolocationHeading: true,
    deviceOrientationHeadingEnabled: true,
    stationaryOrientationMaxSpeedMps: 1,
    rotationSmoothing: 0.18,
    rotationMinSpeedMps: 2,
    simulatorSpeedMps: 12,
    simulatorIntervalMs: 250,
    simulatorSegmentLengthMeters: 350,
  };

  plugin.loadStoredSettings = function () {
    try {
      const stored = window.localStorage?.getItem(plugin.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn('[Follow Mode]', 'Could not load stored settings:', error);
      return {};
    }
  };

  plugin.saveSettings = function () {
    try {
      window.localStorage?.setItem(plugin.storageKey, JSON.stringify(plugin.settings));
    } catch (error) {
      console.warn('[Follow Mode]', 'Could not save settings:', error);
    }
  };

  plugin.settings = Object.assign({}, plugin.defaultSettings, plugin.loadStoredSettings(), plugin.settings || {});

  plugin.state = Object.assign(
    {
      following: false,
      wrapped: false,
      originalOnLocationChange: null,
      originalOnBrowserLocationSuccess: null,
      originalOnOrientationChange: null,
      originalLocate: null,
      pendingLocationMetadata: null,
      publishingSyntheticLocation: false,
      latestLatLng: null,
      previousFix: null,
      latestFix: null,
      cameraTargetLatLng: null,
      cameraCenterTargetLatLng: null,
      cameraAnimationFrame: null,
      cameraLastFrameMs: null,
      mapRotationDeg: 0,
      headingMarker: null,
      headingBearingDeg: null,
      deviceOrientationBearingDeg: null,
      deviceOrientationTimestampMs: null,
      supplementalGeolocationWatchId: null,
      supplementalGeolocationActive: false,
      deviceOrientationListenerStarted: false,
      deviceOrientationPermissionRequested: false,
      optionsButtonId: null,
      legacyOptionsButton: null,
      waitingNoticeShown: false,
      fallbackLayer: null,
      fallbackMarker: null,
      fallbackCircle: null,
      fallbackLatLng: null,
    },
    plugin.state || {}
  );

  plugin.simulator = Object.assign(
    {
      running: false,
      timer: null,
      position: null,
      bearing: 90,
      distanceOnSegment: 0,
      options: null,
    },
    plugin.simulator || {}
  );

  plugin.log = function (...args) {
    console.log('[Follow Mode]', ...args);
  };

  plugin.warn = function (...args) {
    console.warn('[Follow Mode]', ...args);
  };

  plugin.setup = function () {
    plugin.injectStyles();
    plugin.addOptionsButton();
    plugin.waitForUserLocation();
  };

  plugin.waitForUserLocation = function () {
    if (plugin.hasRealUserLocation()) {
      plugin.wrapUserLocation();
      plugin.updateOptionsButton();
      return;
    }

    if (!plugin.state.waitingNoticeShown) {
      plugin.warn('IITC user-location marker is not ready. Simulator will use Follow Mode fallback marker.');
      plugin.state.waitingNoticeShown = true;
    }

    window.setTimeout(plugin.waitForUserLocation, 1000);
  };

  plugin.hasUserLocationApi = function () {
    return !!(window.plugin.userLocation && typeof window.plugin.userLocation.onLocationChange === 'function');
  };

  plugin.hasRealUserLocation = function () {
    return !!(plugin.hasUserLocationApi() && window.plugin.userLocation.marker);
  };

  plugin.maybeStartDeviceOrientation = async function () {
    if (!plugin.settings.deviceOrientationHeadingEnabled) return false;
    if (plugin.state.deviceOrientationListenerStarted) return true;
    if (!window.DeviceOrientationEvent) return false;

    if (typeof DeviceOrientationEvent.requestPermission === 'function' && !plugin.state.deviceOrientationPermissionRequested) {
      let permission;
      try {
        permission = await DeviceOrientationEvent.requestPermission(true);
      } catch (error) {
        plugin.state.deviceOrientationPermissionRequested = false;
        throw error;
      }

      plugin.state.deviceOrientationPermissionRequested = true;
      if (permission !== 'granted') {
        plugin.warn('Device orientation permission was not granted.');
        return false;
      }
    }

    const eventType = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(eventType, plugin.onDeviceOrientationEvent, true);
    plugin.state.deviceOrientationListenerStarted = true;
    return true;
  };

  plugin.onDeviceOrientationEvent = function (event) {
    const heading = plugin.extractDeviceOrientationHeading(event);
    if (heading === null) return;

    plugin.recordOrientationHeading(heading, {
      source: 'device-orientation-event',
      timestampMs: Date.now(),
    });
  };

  plugin.extractDeviceOrientationHeading = function (event) {
    if (!event) return null;

    const { type, alpha, webkitCompassHeading, absolute } = event;
    let heading = null;

    if (type === 'deviceorientationabsolute' && alpha !== null && alpha !== undefined) {
      heading = 360 - Number(alpha);
    } else if (webkitCompassHeading !== undefined && webkitCompassHeading !== null) {
      heading = Number(webkitCompassHeading);
    } else if (absolute === true && alpha !== null && alpha !== undefined) {
      heading = 360 - Number(alpha);
    }

    if (!Number.isFinite(heading)) return null;
    return plugin.normalizeBearing(heading);
  };

  plugin.wrapUserLocation = function () {
    const userLocation = window.plugin.userLocation;

    if (!userLocation || typeof userLocation.onLocationChange !== 'function') return false;
    if (plugin.state.wrapped) return true;

    plugin.state.originalOnLocationChange = userLocation.onLocationChange;

    userLocation.onLocationChange = function followModeOnLocationChange(lat, lng) {
      const latlng = new L.LatLng(lat, lng);
      const metadata = plugin.consumePendingLocationMetadata(lat, lng) || {};
      const isSynthetic = metadata.source === 'simulator' || plugin.state.publishingSyntheticLocation;

      if (plugin.settings.autoStopSimulatorOnRealGps && plugin.simulator.running && !isSynthetic) {
        plugin.simulator.stop({ reason: 'real-location' });
      }

      const originalFollow = !!userLocation.follow;
      const shouldOwnCamera = plugin.shouldOwnFollowCamera(originalFollow);

      if (shouldOwnCamera) userLocation.follow = false;

      try {
        plugin.state.originalOnLocationChange.apply(this, arguments);
      } finally {
        if (shouldOwnCamera) userLocation.follow = originalFollow;
      }

      plugin.recordLocationFix(latlng, metadata);
    };

    if (typeof userLocation.onBrowserLocationSuccess === 'function') {
      plugin.state.originalOnBrowserLocationSuccess = userLocation.onBrowserLocationSuccess;
      userLocation.onBrowserLocationSuccess = function followModeBrowserLocationSuccess(position) {
        return plugin.withPendingLocationMetadata(
          plugin.getMetadataFromGeolocationPosition(position),
          () => plugin.state.originalOnBrowserLocationSuccess.apply(this, arguments)
        );
      };
    }

    if (typeof userLocation.onOrientationChange === 'function') {
      plugin.state.originalOnOrientationChange = userLocation.onOrientationChange;
      userLocation.onOrientationChange = function followModeOrientationChange(direction) {
        const result = plugin.state.originalOnOrientationChange.apply(this, arguments);
        plugin.recordOrientationHeading(direction, { source: 'iitc-user-location' });
        return result;
      };
    }

    plugin.state.originalLocate = userLocation.locate;

    if (typeof userLocation.locate === 'function') {
      userLocation.locate = function followModeLocate(lat, lng, accuracy, persistentZoom) {
        const wasFollowing = !!userLocation.follow || !!plugin.state.following;
        const result = plugin.state.originalLocate.apply(this, arguments);

        // The native locate action intentionally uses setView() once. After that,
        // keep our visible follow state aligned with IITC's follow flag.
        plugin.state.following = !!userLocation.follow;
        if (wasFollowing && !userLocation.follow) plugin.state.following = false;
        if (plugin.state.following) {
          const latlng = plugin.getCurrentUserLatLng();
          if (latlng) plugin.updateCameraTarget(latlng);
        } else {
          plugin.stopCameraLoop();
        }
        plugin.updateOptionsButton();
        return result;
      };
    }

    plugin.state.wrapped = true;
    plugin.log('Wrapped IITC user-location follow camera');
    return true;
  };

  plugin.shouldOwnFollowCamera = function (originalFollow) {
    return plugin.settings.enabled && (originalFollow || plugin.state.following);
  };

  plugin.isFollowing = function () {
    return plugin.settings.enabled && (plugin.state.following || !!window.plugin.userLocation?.follow);
  };

  plugin.setFollowing = function (following) {
    const enabled = !!following;
    plugin.state.following = enabled;

    if (window.plugin.userLocation) {
      window.plugin.userLocation.follow = enabled;
    }

    window.app?.setFollowMode?.(enabled);
    plugin.updateOptionsButton();

    if (enabled) {
      plugin.maybeStartDeviceOrientation().catch((error) => plugin.warn('Device orientation is not available:', error));
      plugin.startSupplementalGeolocationWatch();
      const latlng = plugin.getCurrentUserLatLng();
      if (latlng) {
        plugin.recordLocationFix(latlng, { timestampMs: Date.now() });
        plugin.updateCameraTarget(latlng, { snap: true });
      }
      plugin.startCameraLoop();
    } else {
      plugin.stopCameraLoop();
      plugin.stopSupplementalGeolocationWatch();
      plugin.resetMapOrientation();
    }
  };

  plugin.toggleFollowing = function () {
    plugin.setFollowing(!plugin.isFollowing());
  };

  plugin.toggleHeadingUp = function () {
    plugin.settings.headingUpEnabled = !plugin.settings.headingUpEnabled;
    if (!plugin.settings.headingUpEnabled) plugin.resetMapOrientation();
    if (plugin.settings.headingUpEnabled) {
      plugin.maybeStartDeviceOrientation().catch((error) => plugin.warn('Device orientation is not available:', error));
      if (plugin.isFollowing()) plugin.startCameraLoop();
    }
    plugin.saveSettings();
    plugin.updateOptionsButton();
  };

  plugin.toggleViewportBias = function () {
    plugin.settings.viewportBiasEnabled = !plugin.settings.viewportBiasEnabled;
    if (plugin.isFollowing()) plugin.startCameraLoop();
    plugin.saveSettings();
    plugin.updateOptionsButton();
  };

  plugin.getCurrentUserLatLng = function () {
    const userLocation = window.plugin.userLocation;
    const latlng = userLocation?.user?.latlng || plugin.state.latestLatLng || plugin.state.fallbackLatLng;

    if (!latlng) return null;
    if (latlng.lat === 0 && latlng.lng === 0) return null;
    return latlng;
  };

  plugin.withPendingLocationMetadata = function (metadata, callback) {
    const previousMetadata = plugin.state.pendingLocationMetadata;
    plugin.state.pendingLocationMetadata = Object.assign({}, metadata || {});

    try {
      return callback();
    } finally {
      plugin.state.pendingLocationMetadata = previousMetadata;
    }
  };

  plugin.consumePendingLocationMetadata = function (lat, lng) {
    const metadata = plugin.state.pendingLocationMetadata;
    plugin.state.pendingLocationMetadata = null;

    if (!metadata) return null;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return metadata;

    if (Number.isFinite(Number(metadata.lat)) && Number.isFinite(Number(metadata.lng))) {
      const input = new L.LatLng(Number(lat), Number(lng));
      const pending = new L.LatLng(Number(metadata.lat), Number(metadata.lng));
      if (plugin.distanceMeters(input, pending) > 5) return null;
    }

    return metadata;
  };

  plugin.getMetadataFromGeolocationPosition = function (position) {
    const coords = position?.coords || {};
    const metadata = {
      source: 'browser-geolocation',
      timestampMs: Number(position?.timestamp) || Date.now(),
      lat: Number(coords.latitude),
      lng: Number(coords.longitude),
    };

    if (Number.isFinite(Number(coords.accuracy))) metadata.accuracyMeters = Number(coords.accuracy);
    if (Number.isFinite(Number(coords.speed))) metadata.speedMps = Math.max(0, Number(coords.speed));
    if (plugin.settings.useGeolocationHeading && Number.isFinite(Number(coords.heading))) {
      metadata.bearingDeg = plugin.normalizeBearing(Number(coords.heading));
      metadata.headingSource = 'geolocation';
    }

    return metadata;
  };

  plugin.startSupplementalGeolocationWatch = function () {
    if (plugin.state.supplementalGeolocationActive) return true;
    if (!navigator?.geolocation?.watchPosition) return false;

    try {
      plugin.state.supplementalGeolocationWatchId = navigator.geolocation.watchPosition(
        plugin.onSupplementalGeolocationSuccess,
        plugin.onSupplementalGeolocationError,
        {
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 1000,
        }
      );
      plugin.state.supplementalGeolocationActive = true;
      return true;
    } catch (error) {
      plugin.warn('Could not start supplemental geolocation watch:', error);
      return false;
    }
  };

  plugin.onSupplementalGeolocationSuccess = function (position) {
    const metadata = plugin.getMetadataFromGeolocationPosition(position);
    metadata.source = 'supplemental-geolocation';

    if (!Number.isFinite(metadata.lat) || !Number.isFinite(metadata.lng)) return;

    if (plugin.settings.autoStopSimulatorOnRealGps && plugin.simulator.running) {
      plugin.simulator.stop({ reason: 'real-location' });
    }

    const latlng = new L.LatLng(metadata.lat, metadata.lng);

    if (plugin.hasRealUserLocation()) {
      plugin.recordLocationFix(latlng, metadata);
    } else {
      plugin.updateFallbackLocation(metadata.lat, metadata.lng, metadata);
    }
  };

  plugin.onSupplementalGeolocationError = function (error) {
    plugin.warn('Supplemental geolocation error:', error);
  };

  plugin.stopSupplementalGeolocationWatch = function () {
    if (!plugin.state.supplementalGeolocationActive) return;

    if (navigator?.geolocation?.clearWatch && plugin.state.supplementalGeolocationWatchId !== null) {
      navigator.geolocation.clearWatch(plugin.state.supplementalGeolocationWatchId);
    }

    plugin.state.supplementalGeolocationWatchId = null;
    plugin.state.supplementalGeolocationActive = false;
  };

  plugin.publishLocation = function (lat, lng, metadata = {}) {
    const enrichedMetadata = Object.assign({ source: 'simulator' }, metadata, {
      lat: Number(lat),
      lng: Number(lng),
    });

    if (plugin.hasRealUserLocation()) {
      if (!plugin.state.wrapped) plugin.wrapUserLocation();

      plugin.state.publishingSyntheticLocation = true;
      try {
        plugin.withPendingLocationMetadata(enrichedMetadata, () => {
          window.plugin.userLocation.onLocationChange(lat, lng);
        });
      } finally {
        plugin.state.publishingSyntheticLocation = false;
      }
      return;
    }

    plugin.updateFallbackLocation(lat, lng, enrichedMetadata);
  };

  plugin.ensureFallbackMarker = function () {
    if (!window.L || !window.map) return false;
    if (plugin.state.fallbackMarker) return true;

    const latlng = window.map.getCenter();
    const icon = new L.DivIcon({
      iconSize: new L.Point(24, 24),
      iconAnchor: new L.Point(12, 12),
      className: 'follow-mode-fallback-marker',
      html: '<div></div>',
    });

    const marker = new L.Marker(latlng, {
      icon,
      zIndexOffset: 300,
      interactive: false,
    });

    const circle = new L.Circle(latlng, 40, {
      stroke: true,
      color: '#ffce00',
      opacity: 0.5,
      fillOpacity: 0.15,
      fillColor: '#ffce00',
      weight: 1.5,
      interactive: false,
    });

    const layer = new L.LayerGroup([marker, circle]);
    layer.addTo(window.map);

    if (typeof window.addLayerGroup === 'function') {
      window.addLayerGroup('Follow mode simulator location', layer, true);
    }

    plugin.state.fallbackLayer = layer;
    plugin.state.fallbackMarker = marker;
    plugin.state.fallbackCircle = circle;
    plugin.state.fallbackLatLng = latlng;
    return true;
  };

  plugin.updateFallbackLocation = function (lat, lng, metadata = {}) {
    if (!plugin.ensureFallbackMarker()) return;

    const latlng = new L.LatLng(lat, lng);
    plugin.state.fallbackLatLng = latlng;
    plugin.state.fallbackMarker.setLatLng(latlng);
    plugin.state.fallbackCircle.setLatLng(latlng);
    plugin.recordLocationFix(latlng, metadata);
  };

  plugin.recordLocationFix = function (latlng, metadata = {}) {
    if (!latlng) return;

    const timestampMs = Number(metadata.timestampMs || Date.now());
    const previousFix = plugin.state.latestFix;
    const hasExplicitSpeed = Number.isFinite(Number(metadata.speedMps));
    const hasExplicitBearing = plugin.settings.useGeolocationHeading && Number.isFinite(Number(metadata.bearingDeg));
    const fix = {
      latlng,
      timestampMs,
      source: metadata.source || 'unknown',
      accuracyMeters: Number.isFinite(Number(metadata.accuracyMeters)) ? Number(metadata.accuracyMeters) : null,
      speedMps: hasExplicitSpeed ? Math.max(0, Number(metadata.speedMps)) : null,
      bearingDeg: hasExplicitBearing ? plugin.normalizeBearing(Number(metadata.bearingDeg)) : null,
      headingSource: hasExplicitBearing ? metadata.headingSource || 'metadata' : null,
    };

    let distanceMeters = null;

    if (previousFix?.latlng && previousFix?.timestampMs && timestampMs > previousFix.timestampMs) {
      const elapsedSeconds = Math.max(0.001, (timestampMs - previousFix.timestampMs) / 1000);
      distanceMeters = plugin.distanceMeters(previousFix.latlng, latlng);

      if (fix.speedMps === null) {
        fix.speedMps = distanceMeters >= 0.5 ? distanceMeters / elapsedSeconds : 0;
      }

      if (fix.bearingDeg === null && distanceMeters >= 0.5) {
        fix.bearingDeg = plugin.bearingDegrees(previousFix.latlng, latlng);
        fix.headingSource = 'movement';
      }
    }

    if (fix.speedMps === null) fix.speedMps = 0;

    if (fix.bearingDeg === null && previousFix?.bearingDeg !== null && previousFix?.bearingDeg !== undefined && fix.speedMps > 0.2) {
      fix.bearingDeg = previousFix.bearingDeg;
      fix.headingSource = previousFix.headingSource || 'previous';
    }

    plugin.state.previousFix = previousFix;
    plugin.state.latestFix = fix;
    plugin.state.latestLatLng = latlng;

    const effectiveHeading = plugin.getEffectiveHeadingDeg(fix);
    plugin.state.headingBearingDeg = effectiveHeading;
    plugin.updateHeadingIndicator(latlng, effectiveHeading);

    if (plugin.isFollowing()) {
      plugin.updateCameraTarget(plugin.getPredictedLatLng(Date.now()));
      plugin.startCameraLoop();
    }
  };

  plugin.recordOrientationHeading = function (direction, metadata = {}) {
    if (!plugin.settings.deviceOrientationHeadingEnabled) return;

    const numericDirection = Number(direction);
    if (!Number.isFinite(numericDirection)) {
      plugin.state.deviceOrientationBearingDeg = null;
      plugin.state.deviceOrientationTimestampMs = null;
      return;
    }

    plugin.state.deviceOrientationBearingDeg = plugin.normalizeBearing(numericDirection);
    plugin.state.deviceOrientationTimestampMs = Number(metadata.timestampMs || Date.now());

    const latlng = plugin.getCurrentUserLatLng();
    const effectiveHeading = plugin.getEffectiveHeadingDeg(plugin.state.latestFix);
    plugin.state.headingBearingDeg = effectiveHeading;
    if (latlng) plugin.updateHeadingIndicator(latlng, effectiveHeading);

    if (plugin.isFollowing()) plugin.startCameraLoop();
  };

  plugin.getStationaryOrientationMaxSpeedMps = function () {
    const speed = Number(plugin.settings.stationaryOrientationMaxSpeedMps);
    if (!Number.isFinite(speed)) return 1;
    return Math.max(0, speed);
  };

  plugin.getEffectiveHeadingDeg = function (fix = plugin.state.latestFix) {
    const movementBearing = Number(fix?.bearingDeg);
    const movementSpeedMps = Number(fix?.speedMps || 0);
    const deviceBearing = Number(plugin.state.deviceOrientationBearingDeg);
    const hasDeviceBearing = plugin.settings.deviceOrientationHeadingEnabled && Number.isFinite(deviceBearing);
    const hasMovementBearing = Number.isFinite(movementBearing);

    if (hasDeviceBearing && (!hasMovementBearing || movementSpeedMps <= plugin.getStationaryOrientationMaxSpeedMps())) {
      return plugin.normalizeBearing(deviceBearing);
    }

    if (hasMovementBearing) return plugin.normalizeBearing(movementBearing);
    if (hasDeviceBearing) return plugin.normalizeBearing(deviceBearing);
    return null;
  };

  plugin.getRotationHeadingDeg = function () {
    if (!plugin.settings.headingUpEnabled || !plugin.isFollowing()) return null;

    const fix = plugin.state.latestFix;
    const movementBearing = Number(fix?.bearingDeg);
    const movementSpeedMps = Number(fix?.speedMps || 0);
    const deviceBearing = Number(plugin.state.deviceOrientationBearingDeg);

    if (
      plugin.settings.deviceOrientationHeadingEnabled &&
      Number.isFinite(deviceBearing) &&
      (!Number.isFinite(movementBearing) || movementSpeedMps <= plugin.getStationaryOrientationMaxSpeedMps())
    ) {
      return plugin.normalizeBearing(deviceBearing);
    }

    if (Number.isFinite(movementBearing) && movementSpeedMps >= plugin.getRotationMinSpeedMps()) {
      return plugin.normalizeBearing(movementBearing);
    }

    return null;
  };

  plugin.updateCameraTarget = function (latlng, options = {}) {
    if (!window.map || !latlng) return;

    plugin.state.cameraTargetLatLng = latlng;

    if (options.snap) {
      const centerTarget = plugin.getCameraCenterForTarget(latlng);
      plugin.state.cameraCenterTargetLatLng = centerTarget;
      window.map.panTo(centerTarget, { animate: false });
      plugin.applyMapPaneTransform();
      return;
    }

    plugin.startCameraLoop();
  };

  plugin.startCameraLoop = function () {
    if (plugin.state.cameraAnimationFrame || !window.map) return;

    plugin.state.cameraLastFrameMs = null;
    plugin.state.cameraAnimationFrame = window.requestAnimationFrame(plugin.stepCameraTowardTarget);
  };

  plugin.stopCameraLoop = function () {
    if (!plugin.state.cameraAnimationFrame) return;

    window.cancelAnimationFrame(plugin.state.cameraAnimationFrame);
    plugin.state.cameraAnimationFrame = null;
    plugin.state.cameraLastFrameMs = null;
  };

  plugin.getCameraIntervalMs = function () {
    const interval = Number(plugin.settings.cameraIntervalMs);
    if (!Number.isFinite(interval)) return 100;
    return Math.max(16, interval);
  };

  plugin.getCameraSmoothing = function () {
    const smoothing = Number(plugin.settings.cameraSmoothing);
    if (!Number.isFinite(smoothing)) return 0.22;
    return Math.max(0.01, Math.min(1, smoothing));
  };

  plugin.getCameraStopDistanceMeters = function () {
    const distance = Number(plugin.settings.cameraStopDistanceMeters);
    if (!Number.isFinite(distance)) return 1.5;
    return Math.max(0, distance);
  };

  plugin.getViewportBiasY = function () {
    const biasY = Number(plugin.settings.viewportBiasY);
    if (!Number.isFinite(biasY)) return 0.70;
    return Math.max(0.50, Math.min(0.90, biasY));
  };

  plugin.getRotationSmoothing = function () {
    const smoothing = Number(plugin.settings.rotationSmoothing);
    if (!Number.isFinite(smoothing)) return 0.18;
    return Math.max(0.01, Math.min(1, smoothing));
  };

  plugin.getRotationMinSpeedMps = function () {
    const speed = Number(plugin.settings.rotationMinSpeedMps);
    if (!Number.isFinite(speed)) return 2;
    return Math.max(0, speed);
  };

  plugin.getPredictionMaxMs = function () {
    const maxMs = Number(plugin.settings.predictionMaxMs);
    if (!Number.isFinite(maxMs)) return 1500;
    return Math.max(0, Math.min(5000, maxMs));
  };

  plugin.getPredictedLatLng = function (nowMs = Date.now()) {
    const fix = plugin.state.latestFix;
    if (!fix?.latlng) return plugin.state.cameraTargetLatLng || plugin.state.latestLatLng;

    const speedMps = Math.max(0, Number(fix.speedMps || 0));
    const bearingDeg = Number(fix.bearingDeg);
    const elapsedMs = Math.max(0, Math.min(plugin.getPredictionMaxMs(), Number(nowMs) - Number(fix.timestampMs || nowMs)));

    if (!Number.isFinite(bearingDeg) || speedMps <= 0 || elapsedMs <= 0) return fix.latlng;

    return plugin.destinationPoint(fix.latlng, bearingDeg, (speedMps * elapsedMs) / 1000);
  };

  plugin.stepCameraTowardTarget = function (frameMs) {
    if (!plugin.isFollowing()) {
      plugin.stopCameraLoop();
      plugin.resetMapOrientation();
      return;
    }

    const target = plugin.getPredictedLatLng(Date.now());
    if (!window.map || !target) {
      plugin.state.cameraAnimationFrame = window.requestAnimationFrame(plugin.stepCameraTowardTarget);
      return;
    }

    const lastFrameMs = plugin.state.cameraLastFrameMs || frameMs;
    const elapsedMs = Math.max(1, Number(frameMs) - Number(lastFrameMs));

    plugin.stepMapRotation(elapsedMs);
    plugin.state.cameraTargetLatLng = target;

    const centerTarget = plugin.getCameraCenterForTarget(target);
    plugin.state.cameraCenterTargetLatLng = centerTarget;

    const current = window.map.getCenter();
    const remainingMeters = plugin.distanceMeters(current, centerTarget);
    const stopDistanceMeters = plugin.getCameraStopDistanceMeters();

    if (remainingMeters > stopDistanceMeters) {
      const baseIntervalMs = plugin.getCameraIntervalMs();
      const smoothing = plugin.getCameraSmoothing();
      const alpha = 1 - Math.pow(1 - smoothing, elapsedMs / baseIntervalMs);

      const zoom = window.map.getZoom();
      const currentPoint = window.map.project(current, zoom);
      const targetPoint = window.map.project(centerTarget, zoom);
      const nextPoint = currentPoint.add(targetPoint.subtract(currentPoint).multiplyBy(alpha));
      const nextCenter = window.map.unproject(nextPoint, zoom);

      window.map.panTo(nextCenter, { animate: false });
    }

    plugin.applyMapPaneTransform();
    plugin.state.cameraLastFrameMs = frameMs;
    plugin.state.cameraAnimationFrame = window.requestAnimationFrame(plugin.stepCameraTowardTarget);
  };

  plugin.getCameraCenterForTarget = function (target) {
    if (!window.map || !target || !plugin.settings.viewportBiasEnabled) return target;

    const zoom = window.map.getZoom();
    const size = window.map.getSize();
    const targetPoint = window.map.project(target, zoom);
    const desiredScreenOffset = new L.Point(0, size.y * (plugin.getViewportBiasY() - 0.5));
    const mapOffset = plugin.rotatePoint(desiredScreenOffset, -plugin.getMapRotationDeg());
    const centerPoint = targetPoint.subtract(mapOffset);

    return window.map.unproject(centerPoint, zoom);
  };

  plugin.stepMapRotation = function (elapsedMs) {
    const desired = plugin.getDesiredMapRotationDeg();
    const baseIntervalMs = plugin.getCameraIntervalMs();
    const smoothing = plugin.getRotationSmoothing();
    const alpha = 1 - Math.pow(1 - smoothing, elapsedMs / baseIntervalMs);
    const current = plugin.getMapRotationDeg();
    const delta = plugin.shortestAngleDelta(current, desired);

    plugin.state.mapRotationDeg = plugin.normalizeSignedBearing(current + delta * alpha);
  };

  plugin.getDesiredMapRotationDeg = function () {
    if (!plugin.settings.headingUpEnabled || !plugin.isFollowing()) return 0;

    const headingDeg = plugin.getRotationHeadingDeg();
    if (!Number.isFinite(Number(headingDeg))) return plugin.getMapRotationDeg();
    return plugin.normalizeSignedBearing(-headingDeg);
  };

  plugin.getMapRotationDeg = function () {
    return Number.isFinite(Number(plugin.state.mapRotationDeg)) ? Number(plugin.state.mapRotationDeg) : 0;
  };

  plugin.resetMapOrientation = function () {
    plugin.state.mapRotationDeg = 0;
    plugin.applyMapPaneTransform();
  };

  plugin.applyMapPaneTransform = function () {
    if (!window.map?._mapPane || !window.L?.DomUtil) return;

    const pane = window.map._mapPane;
    const pos = L.DomUtil.getPosition(pane) || new L.Point(0, 0);
    const size = window.map.getSize();
    const rotationDeg = plugin.getMapRotationDeg();
    const transformProp = L.DomUtil.TRANSFORM || 'transform';

    pane.style.transformOrigin = `${size.x / 2 - pos.x}px ${size.y / 2 - pos.y}px`;
    pane.style[transformProp] = `translate3d(${pos.x}px,${pos.y}px,0) rotate(${rotationDeg}deg)`;
  };

  plugin.rotatePoint = function (point, angleDeg) {
    const angle = (Number(angleDeg) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return new L.Point(point.x * cos - point.y * sin, point.x * sin + point.y * cos);
  };

  plugin.shortestAngleDelta = function (fromDeg, toDeg) {
    return ((Number(toDeg) - Number(fromDeg) + 540) % 360) - 180;
  };

  plugin.normalizeSignedBearing = function (bearingDeg) {
    const normalized = plugin.normalizeBearing(bearingDeg);
    return normalized > 180 ? normalized - 360 : normalized;
  };

  plugin.distanceMeters = function (a, b) {
    if (!a || !b) return Infinity;
    if (window.map && typeof window.map.distance === 'function') return window.map.distance(a, b);
    if (typeof a.distanceTo === 'function') return a.distanceTo(b);

    const radiusMeters = 6371000;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
    const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
    const sinLat = Math.sin(deltaLat / 2);
    const sinLng = Math.sin(deltaLng / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return radiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };


  plugin.bearingDegrees = function (from, to) {
    if (!from || !to) return null;

    const lat1 = (from.lat * Math.PI) / 180;
    const lat2 = (to.lat * Math.PI) / 180;
    const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return plugin.normalizeBearing((Math.atan2(y, x) * 180) / Math.PI);
  };

  plugin.normalizeBearing = function (bearingDeg) {
    return ((Number(bearingDeg) % 360) + 360) % 360;
  };

  plugin.ensureHeadingIndicator = function () {
    if (!plugin.settings.headingIndicatorEnabled || !window.L || !window.map) return false;
    if (plugin.state.headingMarker) return true;

    const icon = new L.DivIcon({
      iconSize: new L.Point(32, 32),
      iconAnchor: new L.Point(16, 16),
      className: 'follow-mode-heading-marker',
      html: '<div class="fm-heading-wrap"><div class="fm-heading-arrow"></div></div>',
    });

    plugin.state.headingMarker = new L.Marker(window.map.getCenter(), {
      icon,
      zIndexOffset: 350,
      interactive: false,
    });
    plugin.state.headingMarker.addTo(window.map);
    return true;
  };

  plugin.updateHeadingIndicator = function (latlng, bearingDeg) {
    if (!plugin.settings.headingIndicatorEnabled || !latlng) return;
    if (!plugin.ensureHeadingIndicator()) return;

    plugin.state.headingMarker.setLatLng(latlng);

    const markerElement = plugin.state.headingMarker.getElement();
    const headingWrap = markerElement?.querySelector('.fm-heading-wrap');
    if (!headingWrap) return;

    if (bearingDeg === null || !Number.isFinite(Number(bearingDeg))) {
      headingWrap.classList.add('fm-heading-unknown');
      headingWrap.style.transform = '';
      return;
    }

    headingWrap.classList.remove('fm-heading-unknown');
    headingWrap.style.transform = `rotate(${plugin.normalizeBearing(bearingDeg)}deg)`;
  };

  plugin.injectStyles = function () {
    if (document.getElementById('follow-mode-style')) return;

    const style = document.createElement('style');
    style.id = 'follow-mode-style';
    style.textContent = `
      #toolbox a.follow-mode-options-link,
      #toolbox_component a.follow-mode-options-link {
        font-weight: bold;
      }
      .follow-mode-dialog p {
        margin: 0.4em 0 0.7em;
      }
      .follow-mode-dialog label {
        display: block;
        margin: 0.45em 0;
      }
      .follow-mode-dialog input[type="number"] {
        width: 6.5em;
      }
      .follow-mode-dialog fieldset {
        border: 1px solid #555;
        margin: 0.7em 0;
        padding: 0.5em 0.7em;
      }
      .follow-mode-dialog legend {
        padding: 0 0.3em;
      }
      .follow-mode-dialog button {
        margin: 0.35em 0.35em 0.35em 0;
      }
      .follow-mode-dialog .fm-dev-settings {
        display: none;
      }
      .follow-mode-dialog .fm-dev-settings.fm-open {
        display: block;
      }
      .follow-mode-dialog code {
        user-select: text;
      }
      .follow-mode-fallback-marker div {
        width: 18px;
        height: 18px;
        margin: 3px;
        border-radius: 50%;
        background: #ffce00;
        border: 2px solid #111;
        box-shadow: 0 0 0 2px rgba(255, 206, 0, 0.35);
      }
      .follow-mode-heading-marker {
        pointer-events: none;
      }
      .follow-mode-heading-marker .fm-heading-wrap {
        width: 32px;
        height: 32px;
        transform-origin: 16px 16px;
      }
      .follow-mode-heading-marker .fm-heading-arrow {
        position: absolute;
        left: 12px;
        top: 0;
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-bottom: 13px solid #ffce00;
        filter: drop-shadow(0 0 2px #000);
      }
      .follow-mode-heading-marker .fm-heading-unknown {
        display: none;
      }
    `;
    document.head.appendChild(style);
  };

  plugin.addOptionsButton = function () {
    if (plugin.state.optionsButtonId || plugin.state.legacyOptionsButton) return;

    if (window.IITC?.toolbox?.addButton) {
      plugin.state.optionsButtonId = IITC.toolbox.addButton({
        id: 'follow-mode-options',
        label: 'Follow Mode Opt',
        action: plugin.showOptions,
      });
      plugin.updateOptionsButton();
      return;
    }

    const toolbox = document.getElementById('toolbox') || document.getElementById('toolbox_component');
    if (!toolbox) {
      window.setTimeout(plugin.addOptionsButton, 1000);
      return;
    }

    const link = document.createElement('a');
    link.href = '#';
    link.className = 'follow-mode-options-link';
    link.textContent = 'Follow Mode Opt';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      plugin.showOptions();
    });

    toolbox.appendChild(link);
    plugin.state.legacyOptionsButton = link;
    plugin.updateOptionsButton();
  };

  plugin.updateOptionsButton = function () {
    if (window.IITC?.toolbox?.updateButton && plugin.state.optionsButtonId) {
      IITC.toolbox.updateButton(plugin.state.optionsButtonId, {
        label: 'Follow Mode Opt',
        action: plugin.showOptions,
      });
    }

    if (plugin.state.legacyOptionsButton) {
      plugin.state.legacyOptionsButton.textContent = 'Follow Mode Opt';
    }
  };

  plugin.showOptions = function () {
    const simulatorLabel = plugin.simulator.running ? 'Stop simulator' : 'Start simulator';
    const html = `
      <div class="follow-mode-dialog">
        <p>Follow Mode gives IITC a navigation-style user-follow camera: smooth follow, optional heading-up rotation, and optional viewport bias.</p>

        <fieldset>
          <legend>Options</legend>
          <label><input id="fm-follow-enabled" type="checkbox" ${plugin.isFollowing() ? 'checked' : ''}> Follow my location</label>
          <label><input id="fm-heading-up" type="checkbox" ${plugin.settings.headingUpEnabled ? 'checked' : ''}> Heading-up map rotation</label>
          <label><input id="fm-bias-enabled" type="checkbox" ${plugin.settings.viewportBiasEnabled ? 'checked' : ''}> Viewport bias</label>
          <label><input id="fm-heading-enabled" type="checkbox" ${plugin.settings.headingIndicatorEnabled ? 'checked' : ''}> Show heading indicator</label>
          <label><input id="fm-device-heading" type="checkbox" ${plugin.settings.deviceOrientationHeadingEnabled ? 'checked' : ''}> Use phone orientation when stopped or slow</label>
          <label>User screen position: <input id="fm-bias-y" type="number" step="0.01" min="0.5" max="0.9" value="${plugin.settings.viewportBiasY}"> <span>0.70 keeps you low on screen</span></label>
          <label><input id="fm-autostop-sim" type="checkbox" ${plugin.settings.autoStopSimulatorOnRealGps ? 'checked' : ''}> Stop simulator when real GPS arrives</label>
        </fieldset>

        <p>Use <strong>Follow Mode Opt</strong> in the IITC toolbox/sidebar to reopen this panel.</p>

        <button id="fm-toggle-dev-settings" type="button">Show dev options</button>
        <div id="fm-dev-settings" class="fm-dev-settings">
          <fieldset>
            <legend>Camera tuning</legend>
            <label>Camera interval ms: <input id="fm-camera-interval" type="number" step="25" min="25" value="${plugin.settings.cameraIntervalMs}"></label>
            <label>Camera smoothing: <input id="fm-camera-smoothing" type="number" step="0.01" min="0.01" max="1" value="${plugin.settings.cameraSmoothing}"></label>
            <label>Stop distance meters: <input id="fm-camera-stop-distance" type="number" step="0.5" min="0" value="${plugin.settings.cameraStopDistanceMeters}"></label>
            <label>Prediction max ms: <input id="fm-prediction-max" type="number" step="100" min="0" max="5000" value="${plugin.settings.predictionMaxMs}"></label>
          </fieldset>

          <fieldset>
            <legend>Heading and rotation tuning</legend>
            <label><input id="fm-geolocation-heading" type="checkbox" ${plugin.settings.useGeolocationHeading ? 'checked' : ''}> Use browser geolocation heading</label>
            <label>Stationary orientation max speed m/s: <input id="fm-stationary-orientation-speed" type="number" step="0.1" min="0" value="${plugin.settings.stationaryOrientationMaxSpeedMps}"></label>
            <label>Rotation smoothing: <input id="fm-rotation-smoothing" type="number" step="0.01" min="0.01" max="1" value="${plugin.settings.rotationSmoothing}"></label>
            <label>Rotation min speed m/s: <input id="fm-rotation-min-speed" type="number" step="0.5" min="0" value="${plugin.settings.rotationMinSpeedMps}"></label>
          </fieldset>

          <fieldset>
            <legend>Desktop simulator</legend>
            <label>Simulator speed m/s: <input id="fm-sim-speed" type="number" step="1" min="0" value="${plugin.settings.simulatorSpeedMps}"></label>
            <label>Simulator interval ms: <input id="fm-sim-interval" type="number" step="50" min="50" value="${plugin.settings.simulatorIntervalMs}"></label>
            <label>Simulator segment meters: <input id="fm-sim-segment" type="number" step="25" min="25" value="${plugin.settings.simulatorSegmentLengthMeters}"></label>
            <button id="fm-sim-toggle" type="button">${simulatorLabel}</button>
          </fieldset>

          <fieldset>
            <legend>Console helpers</legend>
            <p><code>window.plugin.followMode.setFollowing(true)</code></p>
            <p><code>window.plugin.followMode.simulator.start()</code></p>
          </fieldset>
        </div>
      </div>
    `;

    if (typeof dialog === 'function') {
      dialog({
        title: 'Follow Mode Options',
        html,
        width: 430,
        id: 'follow-mode-options',
        buttons: {
          OK: function () {
            plugin.saveSettingsFromDialog();
            $(this).dialog('close');
          },
        },
      });
    } else {
      alert('Follow Mode options are available from window.plugin.followMode.settings');
      return;
    }

    $('#fm-toggle-dev-settings').on('click', () => {
      const dev = $('#fm-dev-settings');
      dev.toggleClass('fm-open');
      $('#fm-toggle-dev-settings').text(dev.hasClass('fm-open') ? 'Hide dev options' : 'Show dev options');
    });

    $('#fm-sim-toggle').on('click', () => {
      plugin.saveSettingsFromDialog();
      plugin.simulator.toggle();
      $('#fm-sim-toggle').text(plugin.simulator.running ? 'Stop simulator' : 'Start simulator');
    });

  };

  plugin.saveSettingsFromDialog = function () {
    const oldCameraIntervalMs = plugin.getCameraIntervalMs();
    const oldSimulatorIntervalMs = Number(plugin.simulator.options?.intervalMs || plugin.settings.simulatorIntervalMs);

    const desiredFollowing = $('#fm-follow-enabled').is(':checked');
    const oldHeadingUpEnabled = !!plugin.settings.headingUpEnabled;
    const oldViewportBiasEnabled = !!plugin.settings.viewportBiasEnabled;

    plugin.settings.headingUpEnabled = $('#fm-heading-up').is(':checked');
    plugin.settings.viewportBiasEnabled = $('#fm-bias-enabled').is(':checked');
    plugin.settings.viewportBiasY = Number($('#fm-bias-y').val());
    plugin.settings.headingIndicatorEnabled = $('#fm-heading-enabled').is(':checked');
    plugin.settings.deviceOrientationHeadingEnabled = $('#fm-device-heading').is(':checked');
    plugin.settings.autoStopSimulatorOnRealGps = $('#fm-autostop-sim').is(':checked');

    if ($('#fm-camera-interval').length) plugin.settings.cameraIntervalMs = Number($('#fm-camera-interval').val());
    if ($('#fm-camera-smoothing').length) plugin.settings.cameraSmoothing = Number($('#fm-camera-smoothing').val());
    if ($('#fm-camera-stop-distance').length) plugin.settings.cameraStopDistanceMeters = Number($('#fm-camera-stop-distance').val());
    if ($('#fm-prediction-max').length) plugin.settings.predictionMaxMs = Number($('#fm-prediction-max').val());
    if ($('#fm-geolocation-heading').length) plugin.settings.useGeolocationHeading = $('#fm-geolocation-heading').is(':checked');
    if ($('#fm-stationary-orientation-speed').length) plugin.settings.stationaryOrientationMaxSpeedMps = Number($('#fm-stationary-orientation-speed').val());
    if ($('#fm-rotation-smoothing').length) plugin.settings.rotationSmoothing = Number($('#fm-rotation-smoothing').val());
    if ($('#fm-rotation-min-speed').length) plugin.settings.rotationMinSpeedMps = Number($('#fm-rotation-min-speed').val());
    if ($('#fm-sim-speed').length) plugin.settings.simulatorSpeedMps = Number($('#fm-sim-speed').val());
    if ($('#fm-sim-interval').length) plugin.settings.simulatorIntervalMs = Number($('#fm-sim-interval').val());
    if ($('#fm-sim-segment').length) plugin.settings.simulatorSegmentLengthMeters = Number($('#fm-sim-segment').val());

    plugin.saveSettings();

    if (desiredFollowing !== plugin.isFollowing()) {
      plugin.setFollowing(desiredFollowing);
    } else if (desiredFollowing) {
      plugin.startCameraLoop();
    }

    if (!plugin.settings.headingUpEnabled) {
      plugin.resetMapOrientation();
    } else if (!oldHeadingUpEnabled && plugin.isFollowing()) {
      plugin.maybeStartDeviceOrientation().catch((error) => plugin.warn('Device orientation is not available:', error));
      plugin.startCameraLoop();
    }

    if (oldViewportBiasEnabled !== plugin.settings.viewportBiasEnabled && plugin.isFollowing()) {
      plugin.startCameraLoop();
    }

    if (plugin.state.cameraAnimationFrame && plugin.getCameraIntervalMs() !== oldCameraIntervalMs) {
      plugin.stopCameraLoop();
      plugin.startCameraLoop();
    }

    if (!plugin.settings.headingIndicatorEnabled && plugin.state.headingMarker) {
      window.map.removeLayer(plugin.state.headingMarker);
      plugin.state.headingMarker = null;
    } else if (plugin.settings.headingIndicatorEnabled && plugin.state.latestFix?.latlng) {
      plugin.updateHeadingIndicator(plugin.state.latestFix.latlng, plugin.state.headingBearingDeg);
    }

    if (plugin.settings.deviceOrientationHeadingEnabled) {
      plugin.maybeStartDeviceOrientation().catch((error) => plugin.warn('Device orientation is not available:', error));
    } else {
      plugin.state.deviceOrientationBearingDeg = null;
      plugin.state.deviceOrientationTimestampMs = null;
    }

    if (plugin.simulator.options) {
      plugin.simulator.options.speedMps = plugin.settings.simulatorSpeedMps;
      plugin.simulator.options.intervalMs = plugin.settings.simulatorIntervalMs;
      plugin.simulator.options.segmentLengthMeters = plugin.settings.simulatorSegmentLengthMeters;
    }

    if (plugin.simulator.running && Number(plugin.settings.simulatorIntervalMs) !== oldSimulatorIntervalMs) {
      if (plugin.simulator.timer) window.clearInterval(plugin.simulator.timer);
      plugin.simulator.timer = window.setInterval(plugin.simulator.step, Number(plugin.settings.simulatorIntervalMs));
    }

    plugin.updateOptionsButton();
  };

  plugin.simulator.toggle = function () {
    if (plugin.simulator.running) plugin.simulator.stop();
    else plugin.simulator.start();
  };

  plugin.simulator.start = function (options = {}) {
    if (plugin.hasRealUserLocation()) {
      if (!plugin.state.wrapped) plugin.wrapUserLocation();
    } else if (!plugin.ensureFallbackMarker()) {
      plugin.warn('Cannot start simulator until the IITC map is available.');
      return false;
    }

    if (plugin.simulator.running) return true;

    const opts = Object.assign(
      {
        speedMps: plugin.settings.simulatorSpeedMps,
        intervalMs: plugin.settings.simulatorIntervalMs,
        segmentLengthMeters: plugin.settings.simulatorSegmentLengthMeters,
        enableFollow: true,
      },
      options
    );

    plugin.simulator.options = opts;
    plugin.simulator.position = plugin.simulator.getStartPosition();
    plugin.simulator.bearing = 90;
    plugin.simulator.distanceOnSegment = 0;
    plugin.simulator.running = true;

    if (opts.enableFollow) plugin.setFollowing(true);

    plugin.simulator.step();
    plugin.simulator.timer = window.setInterval(plugin.simulator.step, opts.intervalMs);
    plugin.updateOptionsButton();
    plugin.log('Simulator started');
    return true;
  };

  plugin.simulator.stop = function (options = {}) {
    if (plugin.simulator.timer) {
      window.clearInterval(plugin.simulator.timer);
      plugin.simulator.timer = null;
    }

    plugin.simulator.running = false;
    plugin.updateOptionsButton();

    if (options.reason === 'real-location') {
      plugin.log('Simulator stopped because real GPS/location data arrived');
    } else {
      plugin.log('Simulator stopped');
    }
  };

  plugin.simulator.getStartPosition = function () {
    const userLatLng = plugin.getCurrentUserLatLng();
    if (userLatLng) return userLatLng;
    return window.map.getCenter();
  };

  plugin.simulator.step = function () {
    const sim = plugin.simulator;
    const opts = sim.options || {
      speedMps: plugin.settings.simulatorSpeedMps,
      intervalMs: plugin.settings.simulatorIntervalMs,
      segmentLengthMeters: plugin.settings.simulatorSegmentLengthMeters,
    };

    if (!sim.position) sim.position = sim.getStartPosition();

    const distance = (Number(opts.speedMps) * Number(opts.intervalMs)) / 1000;
    sim.position = plugin.destinationPoint(sim.position, sim.bearing, distance);
    sim.distanceOnSegment += distance;

    if (sim.distanceOnSegment >= Number(opts.segmentLengthMeters)) {
      sim.distanceOnSegment = 0;
      sim.bearing = (sim.bearing + 90) % 360;
    }

    plugin.publishLocation(sim.position.lat, sim.position.lng, {
      timestampMs: Date.now(),
      speedMps: Number(opts.speedMps),
      bearingDeg: sim.bearing,
    });
  };

  plugin.destinationPoint = function (latlng, bearingDeg, distanceMeters) {
    const radiusMeters = 6371000;
    const bearing = (Number(bearingDeg) * Math.PI) / 180;
    const lat1 = (latlng.lat * Math.PI) / 180;
    const lon1 = (latlng.lng * Math.PI) / 180;
    const angularDistance = Number(distanceMeters) / radiusMeters;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
      );

    return new L.LatLng((lat2 * 180) / Math.PI, (((lon2 * 180) / Math.PI + 540) % 360) - 180);
  };

  const setup = plugin.setup;
  setup.info = plugin_info;

  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);

  if (window.iitcLoaded && typeof setup === 'function') setup();
})();

  }

  const script = document.createElement('script');
  const info = {};

  if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
      version: GM_info.script.version,
      name: GM_info.script.name,
      description: GM_info.script.description,
    };
  }

  script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
  (document.body || document.head || document.documentElement).appendChild(script);
})();
