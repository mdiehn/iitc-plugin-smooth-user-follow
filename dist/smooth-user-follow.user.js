// ==UserScript==
// @id             iitc-plugin-smooth-user-follow
// @name           IITC plugin: Smooth User Follow
// @category       Controls
// @version        0.1.3-dev
// @namespace      https://github.com/mdiehn/iitc-smooth-user-follow
// @updateURL      http://localhost:8000/dist/smooth-user-follow.meta.js
// @downloadURL    http://localhost:8000/dist/smooth-user-follow.user.js
// @description    Use steady-camera IITC user-location follow movement, with a desktop movement simulator.
// @author         Mike Diehn and Frank
// @match          https://intel.ingress.com/*
// @match          https://*.ingress.com/intel*
// @grant          none
// ==/UserScript==

(function () {
  function wrapper(plugin_info) {
    // Smooth User Follow for IITC
// Build placeholders are replaced by build.js.

/* global L, $, dialog */

if (typeof window.plugin !== 'function') window.plugin = function () {};

window.plugin.smoothUserFollow = window.plugin.smoothUserFollow || {};

(function smoothUserFollowPlugin() {
  const plugin = window.plugin.smoothUserFollow;

  plugin.pluginId = 'smooth-user-follow';
  plugin.version = '0.1.3-dev';
  plugin.buildTime = '2026-05-17T04:10:03.050Z';

  plugin.settings = Object.assign(
    {
      enabled: true,
      // Steady camera follow: location updates set the target, and a camera
      // loop eases the map center toward that target. No viewport bias yet.
      cameraIntervalMs: 100,
      cameraSmoothing: 0.22,
      cameraStopDistanceMeters: 1.5,
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
      cameraTargetLatLng: null,
      cameraTimer: null,
      cameraStepping: false,
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
      plugin.state.latestLatLng = latlng;

      const originalFollow = !!userLocation.follow;
      const shouldOwnCamera = plugin.shouldOwnFollowCamera(originalFollow);

      if (shouldOwnCamera) userLocation.follow = false;

      try {
        plugin.state.originalOnLocationChange.apply(this, arguments);
      } finally {
        if (shouldOwnCamera) userLocation.follow = originalFollow;
      }

      if (plugin.isFollowing()) {
        plugin.updateCameraTarget(latlng);
      }
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
      if (latlng) plugin.updateCameraTarget(latlng, { snap: true });
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

  plugin.publishLocation = function (lat, lng) {
    if (plugin.hasRealUserLocation()) {
      if (!plugin.state.wrapped) plugin.wrapUserLocation();
      window.plugin.userLocation.onLocationChange(lat, lng);
      return;
    }

    plugin.updateFallbackLocation(lat, lng);
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

  plugin.updateFallbackLocation = function (lat, lng) {
    if (!plugin.ensureFallbackMarker()) return;

    const latlng = new L.LatLng(lat, lng);
    plugin.state.latestLatLng = latlng;
    plugin.state.fallbackLatLng = latlng;
    plugin.state.fallbackMarker.setLatLng(latlng);
    plugin.state.fallbackCircle.setLatLng(latlng);

    if (plugin.isFollowing()) {
      plugin.updateCameraTarget(latlng);
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
    if (plugin.state.cameraTimer || !window.map) return;

    plugin.state.cameraTimer = window.setInterval(
      plugin.stepCameraTowardTarget,
      plugin.getCameraIntervalMs()
    );
  };

  plugin.stopCameraLoop = function () {
    if (!plugin.state.cameraTimer) return;

    window.clearInterval(plugin.state.cameraTimer);
    plugin.state.cameraTimer = null;
    plugin.state.cameraStepping = false;
  };

  plugin.getCameraIntervalMs = function () {
    const interval = Number(plugin.settings.cameraIntervalMs);
    if (!Number.isFinite(interval)) return 100;
    return Math.max(25, interval);
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

  plugin.stepCameraTowardTarget = function () {
    if (plugin.state.cameraStepping) return;
    if (!plugin.isFollowing()) {
      plugin.stopCameraLoop();
      return;
    }

    const target = plugin.state.cameraTargetLatLng || plugin.state.latestLatLng;
    if (!window.map || !target) return;

    const current = window.map.getCenter();
    const remainingMeters = plugin.distanceMeters(current, target);
    if (remainingMeters <= plugin.getCameraStopDistanceMeters()) return;

    plugin.state.cameraStepping = true;

    try {
      const zoom = window.map.getZoom();
      const currentPoint = window.map.project(current, zoom);
      const targetPoint = window.map.project(target, zoom);
      const nextPoint = currentPoint.add(
        targetPoint.subtract(currentPoint).multiplyBy(plugin.getCameraSmoothing())
      );
      const nextCenter = window.map.unproject(nextPoint, zoom);

      window.map.panTo(nextCenter, { animate: false });
    } finally {
      plugin.state.cameraStepping = false;
    }
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
      plugin.settings.simulatorSpeedMps = Number($('#suf-sim-speed').val());
      plugin.settings.simulatorIntervalMs = Number($('#suf-sim-interval').val());

      if (plugin.state.cameraTimer && plugin.getCameraIntervalMs() !== oldCameraIntervalMs) {
        plugin.stopCameraLoop();
        plugin.startCameraLoop();
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

    plugin.publishLocation(sim.position.lat, sim.position.lng);
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
