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
      // IITC user-location uses getBounds().pad(-0.15), giving an inner 70% dead zone.
      // Keep that threshold for the first pass; only change the camera movement style.
      deadZonePad: 0.15,
      minPanIntervalMs: 1500,
      panDurationSeconds: 0.45,
      panEaseLinearity: 0.25,
      simulatorSpeedMps: 12,
      simulatorIntervalMs: 1000,
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
      lastPanAt: 0,
      latestLatLng: null,
      pendingPanTimer: null,
      control: null,
      followButton: null,
      simulatorButton: null,
      waitingNoticeShown: false,
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
    if (window.plugin.userLocation && typeof window.plugin.userLocation.onLocationChange === 'function') {
      plugin.wrapUserLocation();
      plugin.updateControl();
      return;
    }

    if (!plugin.state.waitingNoticeShown) {
      plugin.warn('Waiting for IITC user-location plugin. Enable User Location for marker/follow support.');
      plugin.state.waitingNoticeShown = true;
    }

    window.setTimeout(plugin.waitForUserLocation, 1000);
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
        plugin.handleLocationForCamera(latlng, { force: false });
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
      if (latlng) plugin.handleLocationForCamera(latlng, { force: true });
    } else {
      plugin.clearPendingPan();
    }
  };

  plugin.toggleFollowing = function () {
    plugin.setFollowing(!plugin.isFollowing());
  };

  plugin.getCurrentUserLatLng = function () {
    const userLocation = window.plugin.userLocation;
    const latlng = userLocation?.user?.latlng || plugin.state.latestLatLng;

    if (!latlng) return null;
    if (latlng.lat === 0 && latlng.lng === 0) return null;
    return latlng;
  };

  plugin.handleLocationForCamera = function (latlng, options = {}) {
    if (!window.map || !latlng) return;
    if (!options.force && !plugin.isOutsideDeadZone(latlng)) return;

    const now = Date.now();
    const elapsed = now - plugin.state.lastPanAt;

    if (options.force || elapsed >= plugin.settings.minPanIntervalMs) {
      plugin.clearPendingPan();
      plugin.panTo(latlng);
      return;
    }

    plugin.schedulePendingPan(plugin.settings.minPanIntervalMs - elapsed);
  };

  plugin.isOutsideDeadZone = function (latlng) {
    const pad = Math.max(0, Math.min(0.45, Number(plugin.settings.deadZonePad)));
    const bounds = window.map.getBounds().pad(-pad);
    return !bounds.contains(latlng);
  };

  plugin.panTo = function (latlng) {
    if (!window.map || !latlng) return;

    plugin.state.lastPanAt = Date.now();

    window.map.panTo(latlng, {
      animate: true,
      duration: Number(plugin.settings.panDurationSeconds),
      easeLinearity: Number(plugin.settings.panEaseLinearity),
    });
  };

  plugin.schedulePendingPan = function (delayMs) {
    if (plugin.state.pendingPanTimer) return;

    plugin.state.pendingPanTimer = window.setTimeout(() => {
      plugin.state.pendingPanTimer = null;

      if (!plugin.isFollowing()) return;
      const latlng = plugin.state.latestLatLng;
      if (!latlng || !plugin.isOutsideDeadZone(latlng)) return;

      plugin.panTo(latlng);
    }, Math.max(100, delayMs));
  };

  plugin.clearPendingPan = function () {
    if (!plugin.state.pendingPanTimer) return;
    window.clearTimeout(plugin.state.pendingPanTimer);
    plugin.state.pendingPanTimer = null;
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
        <p>First-pass smooth follow. No viewport biasing yet.</p>
        <label>Dead-zone pad: <input id="suf-dead-zone-pad" type="number" step="0.01" min="0" max="0.45" value="${plugin.settings.deadZonePad}"></label>
        <label>Min pan interval ms: <input id="suf-min-pan-interval" type="number" step="100" min="0" value="${plugin.settings.minPanIntervalMs}"></label>
        <label>Pan duration seconds: <input id="suf-pan-duration" type="number" step="0.05" min="0" value="${plugin.settings.panDurationSeconds}"></label>
        <label>Simulator speed m/s: <input id="suf-sim-speed" type="number" step="1" min="0" value="${plugin.settings.simulatorSpeedMps}"></label>
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
      plugin.settings.deadZonePad = Number($('#suf-dead-zone-pad').val());
      plugin.settings.minPanIntervalMs = Number($('#suf-min-pan-interval').val());
      plugin.settings.panDurationSeconds = Number($('#suf-pan-duration').val());
      plugin.settings.simulatorSpeedMps = Number($('#suf-sim-speed').val());
      plugin.updateControl();
    });
  };

  plugin.simulator.toggle = function () {
    if (plugin.simulator.running) plugin.simulator.stop();
    else plugin.simulator.start();
  };

  plugin.simulator.start = function (options = {}) {
    if (!window.plugin.userLocation || typeof window.plugin.userLocation.onLocationChange !== 'function') {
      plugin.warn('Cannot start simulator until the IITC user-location plugin is available.');
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

    window.plugin.userLocation.onLocationChange(sim.position.lat, sim.position.lng);
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
