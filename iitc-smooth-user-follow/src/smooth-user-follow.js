// Smooth User Follow for IITC
// Build placeholders are replaced by build.js.

/* global L, $, dialog */

if (typeof window.plugin !== 'function') window.plugin = function () {};

window.plugin.smoothUserFollow = window.plugin.smoothUserFollow || {};

(function smoothUserFollowPlugin() {
  const plugin = window.plugin.smoothUserFollow;

  plugin.pluginId = 'smooth-user-follow';
  plugin.version = '__PLUGIN_VERSION__';
  plugin.buildTime = '__BUILD_TIME__';

  plugin.settings = Object.assign(
    {
      enabled: true,
      // Steady camera follow: location updates set the target, and a camera
      // loop eases the map center toward that target. No viewport bias yet.
      cameraIntervalMs: 100,
      cameraSmoothing: 0.22,
      cameraStopDistanceMeters: 1.5,
      predictionMaxMs: 1500,
      headingIndicatorEnabled: true,
      simulatorSpeedMps: 12,
      simulatorIntervalMs: 250,
      simulatorSegmentLengthMeters: 350,
    },
    plugin.settings || {}
  );

  plugin.state = Object.assign(
    {
      following: false,
      wrapped: false,
      originalOnLocationChange: null,
      originalLocate: null,
      latestLatLng: null,
      previousFix: null,
      latestFix: null,
      cameraTargetLatLng: null,
      cameraAnimationFrame: null,
      cameraLastFrameMs: null,
      headingMarker: null,
      headingBearingDeg: null,
      control: null,
      followButton: null,
      simulatorButton: null,
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
    console.log('[Smooth User Follow]', ...args);
  };

  plugin.warn = function (...args) {
    console.warn('[Smooth User Follow]', ...args);
  };

  plugin.setup = function () {
    plugin.injectStyles();
    plugin.addControl();
    plugin.waitForUserLocation();
  };

  plugin.waitForUserLocation = function () {
    if (plugin.hasRealUserLocation()) {
      plugin.wrapUserLocation();
      plugin.updateControl();
      return;
    }

    if (!plugin.state.waitingNoticeShown) {
      plugin.warn('IITC user-location marker is not ready. Simulator will use Smooth User Follow fallback marker.');
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

  plugin.wrapUserLocation = function () {
    const userLocation = window.plugin.userLocation;

    if (!userLocation || typeof userLocation.onLocationChange !== 'function') return false;
    if (plugin.state.wrapped) return true;

    plugin.state.originalOnLocationChange = userLocation.onLocationChange;

    userLocation.onLocationChange = function smoothUserFollowOnLocationChange(lat, lng) {
      const latlng = new L.LatLng(lat, lng);

      const originalFollow = !!userLocation.follow;
      const shouldOwnCamera = plugin.shouldOwnFollowCamera(originalFollow);

      if (shouldOwnCamera) userLocation.follow = false;

      try {
        plugin.state.originalOnLocationChange.apply(this, arguments);
      } finally {
        if (shouldOwnCamera) userLocation.follow = originalFollow;
      }

      plugin.recordLocationFix(latlng);
    };

    plugin.state.originalLocate = userLocation.locate;

    if (typeof userLocation.locate === 'function') {
      userLocation.locate = function smoothUserFollowLocate(lat, lng, accuracy, persistentZoom) {
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
        plugin.updateControl();
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
    plugin.updateControl();

    if (enabled) {
      const latlng = plugin.getCurrentUserLatLng();
      if (latlng) {
        plugin.recordLocationFix(latlng, { timestampMs: Date.now() });
        plugin.updateCameraTarget(latlng, { snap: true });
      }
      plugin.startCameraLoop();
    } else {
      plugin.stopCameraLoop();
    }
  };

  plugin.toggleFollowing = function () {
    plugin.setFollowing(!plugin.isFollowing());
  };

  plugin.getCurrentUserLatLng = function () {
    const userLocation = window.plugin.userLocation;
    const latlng = userLocation?.user?.latlng || plugin.state.latestLatLng || plugin.state.fallbackLatLng;

    if (!latlng) return null;
    if (latlng.lat === 0 && latlng.lng === 0) return null;
    return latlng;
  };

  plugin.publishLocation = function (lat, lng, metadata = {}) {
    if (plugin.hasRealUserLocation()) {
      if (!plugin.state.wrapped) plugin.wrapUserLocation();
      window.plugin.userLocation.onLocationChange(lat, lng);
      return;
    }

    plugin.updateFallbackLocation(lat, lng, metadata);
  };

  plugin.ensureFallbackMarker = function () {
    if (!window.L || !window.map) return false;
    if (plugin.state.fallbackMarker) return true;

    const latlng = window.map.getCenter();
    const icon = new L.DivIcon({
      iconSize: new L.Point(24, 24),
      iconAnchor: new L.Point(12, 12),
      className: 'smooth-user-follow-fallback-marker',
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
      window.addLayerGroup('Smooth follow simulator location', layer, true);
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
    const fix = {
      latlng,
      timestampMs,
      speedMps: Number.isFinite(Number(metadata.speedMps)) ? Number(metadata.speedMps) : null,
      bearingDeg: Number.isFinite(Number(metadata.bearingDeg)) ? plugin.normalizeBearing(Number(metadata.bearingDeg)) : null,
    };

    if (previousFix?.latlng && previousFix?.timestampMs && timestampMs > previousFix.timestampMs) {
      const elapsedSeconds = Math.max(0.001, (timestampMs - previousFix.timestampMs) / 1000);
      const distanceMeters = plugin.distanceMeters(previousFix.latlng, latlng);

      if (fix.speedMps === null && distanceMeters >= 0.5) {
        fix.speedMps = distanceMeters / elapsedSeconds;
      }

      if (fix.bearingDeg === null && distanceMeters >= 0.5) {
        fix.bearingDeg = plugin.bearingDegrees(previousFix.latlng, latlng);
      }
    }

    if (fix.speedMps === null) fix.speedMps = previousFix?.speedMps || 0;
    if (fix.bearingDeg === null) fix.bearingDeg = previousFix?.bearingDeg ?? plugin.state.headingBearingDeg;

    plugin.state.previousFix = previousFix;
    plugin.state.latestFix = fix;
    plugin.state.latestLatLng = latlng;

    if (fix.bearingDeg !== null && Number.isFinite(fix.bearingDeg)) {
      plugin.state.headingBearingDeg = plugin.normalizeBearing(fix.bearingDeg);
      plugin.updateHeadingIndicator(latlng, plugin.state.headingBearingDeg);
    } else {
      plugin.updateHeadingIndicator(latlng, null);
    }

    if (plugin.isFollowing()) {
      plugin.updateCameraTarget(plugin.getPredictedLatLng(Date.now()));
      plugin.startCameraLoop();
    }
  };

  plugin.updateCameraTarget = function (latlng, options = {}) {
    if (!window.map || !latlng) return;

    plugin.state.cameraTargetLatLng = latlng;

    if (options.snap) {
      window.map.panTo(latlng, { animate: false });
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
      return;
    }

    const target = plugin.getPredictedLatLng(Date.now());
    if (!window.map || !target) {
      plugin.state.cameraAnimationFrame = window.requestAnimationFrame(plugin.stepCameraTowardTarget);
      return;
    }

    plugin.state.cameraTargetLatLng = target;

    const current = window.map.getCenter();
    const remainingMeters = plugin.distanceMeters(current, target);
    const stopDistanceMeters = plugin.getCameraStopDistanceMeters();

    if (remainingMeters > stopDistanceMeters) {
      const lastFrameMs = plugin.state.cameraLastFrameMs || frameMs;
      const elapsedMs = Math.max(1, Number(frameMs) - Number(lastFrameMs));
      const baseIntervalMs = plugin.getCameraIntervalMs();
      const smoothing = plugin.getCameraSmoothing();
      const alpha = 1 - Math.pow(1 - smoothing, elapsedMs / baseIntervalMs);

      const zoom = window.map.getZoom();
      const currentPoint = window.map.project(current, zoom);
      const targetPoint = window.map.project(target, zoom);
      const nextPoint = currentPoint.add(targetPoint.subtract(currentPoint).multiplyBy(alpha));
      const nextCenter = window.map.unproject(nextPoint, zoom);

      window.map.panTo(nextCenter, { animate: false });
    }

    plugin.state.cameraLastFrameMs = frameMs;
    plugin.state.cameraAnimationFrame = window.requestAnimationFrame(plugin.stepCameraTowardTarget);
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
      className: 'smooth-user-follow-heading-marker',
      html: '<div class="suf-heading-wrap"><div class="suf-heading-arrow"></div></div>',
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
    const headingWrap = markerElement?.querySelector('.suf-heading-wrap');
    if (!headingWrap) return;

    if (bearingDeg === null || !Number.isFinite(Number(bearingDeg))) {
      headingWrap.classList.add('suf-heading-unknown');
      headingWrap.style.transform = '';
      return;
    }

    headingWrap.classList.remove('suf-heading-unknown');
    headingWrap.style.transform = `rotate(${plugin.normalizeBearing(bearingDeg)}deg)`;
  };

  plugin.injectStyles = function () {
    if (document.getElementById('smooth-user-follow-style')) return;

    const style = document.createElement('style');
    style.id = 'smooth-user-follow-style';
    style.textContent = `
      .smooth-user-follow-control a {
        width: 34px;
        height: 28px;
        line-height: 28px;
        text-align: center;
        font-weight: bold;
        font-size: 11px;
        text-decoration: none;
      }
      .smooth-user-follow-control a.suf-active {
        background: #ffce00;
        color: #000;
      }
      .smooth-user-follow-dialog label {
        display: block;
        margin: 0.35em 0;
      }
      .smooth-user-follow-dialog input {
        width: 6em;
      }
      .smooth-user-follow-dialog code {
        user-select: text;
      }
      .smooth-user-follow-fallback-marker div {
        width: 18px;
        height: 18px;
        margin: 3px;
        border-radius: 50%;
        background: #ffce00;
        border: 2px solid #111;
        box-shadow: 0 0 0 2px rgba(255, 206, 0, 0.35);
      }
      .smooth-user-follow-heading-marker {
        pointer-events: none;
      }
      .smooth-user-follow-heading-marker .suf-heading-wrap {
        width: 32px;
        height: 32px;
        transform-origin: 16px 16px;
      }
      .smooth-user-follow-heading-marker .suf-heading-arrow {
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
      .smooth-user-follow-heading-marker .suf-heading-unknown {
        display: none;
      }
    `;
    document.head.appendChild(style);
  };

  plugin.addControl = function () {
    if (!window.L || !window.map || plugin.state.control) return;

    const SmoothFollowControl = L.Control.extend({
      options: { position: 'topleft' },

      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar smooth-user-follow-control');

        const followButton = L.DomUtil.create('a', '', container);
        followButton.href = '#';
        followButton.title = 'Toggle smooth user follow';
        followButton.textContent = 'SF';

        const simulatorButton = L.DomUtil.create('a', '', container);
        simulatorButton.href = '#';
        simulatorButton.title = 'Start/stop simulated movement';
        simulatorButton.textContent = 'SIM';

        const settingsButton = L.DomUtil.create('a', '', container);
        settingsButton.href = '#';
        settingsButton.title = 'Smooth follow settings';
        settingsButton.textContent = '...';

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        L.DomEvent.on(followButton, 'click', L.DomEvent.stop)
          .on(followButton, 'click', plugin.toggleFollowing);
        L.DomEvent.on(simulatorButton, 'click', L.DomEvent.stop)
          .on(simulatorButton, 'click', plugin.simulator.toggle);
        L.DomEvent.on(settingsButton, 'click', L.DomEvent.stop)
          .on(settingsButton, 'click', plugin.showDialog);

        plugin.state.followButton = followButton;
        plugin.state.simulatorButton = simulatorButton;

        plugin.updateControl();
        return container;
      },
    });

    plugin.state.control = new SmoothFollowControl();
    plugin.state.control.addTo(window.map);
  };

  plugin.updateControl = function () {
    if (plugin.state.followButton) {
      plugin.state.followButton.classList.toggle('suf-active', plugin.isFollowing());
      plugin.state.followButton.title = plugin.isFollowing() ? 'Smooth follow is on' : 'Smooth follow is off';
    }

    if (plugin.state.simulatorButton) {
      plugin.state.simulatorButton.classList.toggle('suf-active', plugin.simulator.running);
      plugin.state.simulatorButton.title = plugin.simulator.running ? 'Stop simulated movement' : 'Start simulated movement';
    }
  };

  plugin.showDialog = function () {
    const html = `
      <div class="smooth-user-follow-dialog">
        <p>Steady camera follow. No viewport biasing yet.</p>
        <label>Camera interval ms: <input id="suf-camera-interval" type="number" step="25" min="25" value="${plugin.settings.cameraIntervalMs}"></label>
        <label>Camera smoothing: <input id="suf-camera-smoothing" type="number" step="0.01" min="0.01" max="1" value="${plugin.settings.cameraSmoothing}"></label>
        <label>Stop distance meters: <input id="suf-camera-stop-distance" type="number" step="0.5" min="0" value="${plugin.settings.cameraStopDistanceMeters}"></label>
        <label>Prediction max ms: <input id="suf-prediction-max" type="number" step="100" min="0" max="5000" value="${plugin.settings.predictionMaxMs}"></label>
        <label>Heading indicator: <input id="suf-heading-enabled" type="checkbox" ${plugin.settings.headingIndicatorEnabled ? 'checked' : ''}></label>
        <label>Simulator speed m/s: <input id="suf-sim-speed" type="number" step="1" min="0" value="${plugin.settings.simulatorSpeedMps}"></label>
        <label>Simulator interval ms: <input id="suf-sim-interval" type="number" step="50" min="50" value="${plugin.settings.simulatorIntervalMs}"></label>
        <p>Console helpers:</p>
        <p><code>window.plugin.smoothUserFollow.simulator.start()</code></p>
        <p><code>window.plugin.smoothUserFollow.setFollowing(true)</code></p>
        <button id="suf-save-settings">Save</button>
      </div>
    `;

    if (typeof dialog === 'function') {
      dialog({
        title: 'Smooth User Follow',
        html,
        width: 380,
        id: 'smooth-user-follow-settings',
      });
    } else {
      alert('Smooth User Follow settings are available from window.plugin.smoothUserFollow.settings');
      return;
    }

    $('#suf-save-settings').on('click', () => {
      const oldCameraIntervalMs = plugin.getCameraIntervalMs();
      const oldSimulatorIntervalMs = Number(plugin.simulator.options?.intervalMs || plugin.settings.simulatorIntervalMs);

      plugin.settings.cameraIntervalMs = Number($('#suf-camera-interval').val());
      plugin.settings.cameraSmoothing = Number($('#suf-camera-smoothing').val());
      plugin.settings.cameraStopDistanceMeters = Number($('#suf-camera-stop-distance').val());
      plugin.settings.predictionMaxMs = Number($('#suf-prediction-max').val());
      plugin.settings.headingIndicatorEnabled = $('#suf-heading-enabled').is(':checked');
      plugin.settings.simulatorSpeedMps = Number($('#suf-sim-speed').val());
      plugin.settings.simulatorIntervalMs = Number($('#suf-sim-interval').val());

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

      if (plugin.simulator.options) {
        plugin.simulator.options.speedMps = plugin.settings.simulatorSpeedMps;
        plugin.simulator.options.intervalMs = plugin.settings.simulatorIntervalMs;
      }

      if (plugin.simulator.running && Number(plugin.settings.simulatorIntervalMs) !== oldSimulatorIntervalMs) {
        if (plugin.simulator.timer) window.clearInterval(plugin.simulator.timer);
        plugin.simulator.timer = window.setInterval(plugin.simulator.step, Number(plugin.settings.simulatorIntervalMs));
      }

      plugin.updateControl();
    });
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
    plugin.updateControl();
    plugin.log('Simulator started');
    return true;
  };

  plugin.simulator.stop = function () {
    if (plugin.simulator.timer) {
      window.clearInterval(plugin.simulator.timer);
      plugin.simulator.timer = null;
    }

    plugin.simulator.running = false;
    plugin.updateControl();
    plugin.log('Simulator stopped');
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

    plugin.publishLocation(sim.position.lat, sim.position.lng, { timestampMs: Date.now() });
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
