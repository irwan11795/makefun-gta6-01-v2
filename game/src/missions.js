import * as THREE from 'three';

// SOLHAVEN missions — 6-mission chain.
// You are a new driver in Solhaven hired by the mysterious "Madame Sol".
// Each mission: { id, name, briefing, objective, timeLimit, marker,
//   setup(game), update(dt, game), isDone(game) }.
// The beacon (glowing cylinder + ring) marks the current target and
// game.missions.currentMarker = { x, z } feeds the HUD / minimap.
// Finishing a mission shows a HUD message + chime and starts the next one.
// After mission 6 the game is won via game.win().

function dist2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function makeBeacon(scene) {
  const group = new THREE.Group();
  const cylGeo = new THREE.CylinderGeometry(2.2, 2.2, 14, 20, 1, true);
  const cylMat = new THREE.MeshBasicMaterial({
    color: 0x39ff88, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const cyl = new THREE.Mesh(cylGeo, cylMat);
  cyl.position.y = 7;
  group.add(cyl);

  const ringGeo = new THREE.RingGeometry(1.6, 2.4, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x39ff88, transparent: true, opacity: 0.9,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);

  const tipGeo = new THREE.SphereGeometry(0.5, 12, 10);
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xbaffd6 });
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.y = 14.2;
  group.add(tip);

  group.visible = false;
  scene.add(group);
  return { group, ring, cylMat, ringMat, tip };
}

export function createMissions(game) {
  const scene = game.scene;
  const city = game.city || {};
  const spawn = city.spawn || {};
  const districts = city.districtCenters || {};
  const bounds = city.bounds || { minX: -140, maxX: 140, minZ: -140, maxZ: 140 };

  const beacon = scene ? makeBeacon(scene) : null;
  let pulseT = 0;

  const at = (p) => ({ x: p?.x ?? 0, z: p?.z ?? 0 });
  const marina = at(spawn.marina || districts.marina || { x: 60, z: -90 });
  const downtown = at(spawn.downtown || districts.downtown || { x: 0, z: 0 });
  const oldtown = at(spawn.oldtown || districts.oldtown || { x: -70, z: 60 });
  const hills = at(spawn.hills || districts.hills || { x: -90, z: -80 });
  const heroCar = at(spawn.heroCar || spawn.player || { x: 10, z: 10 });

  // Five rush checkpoints spread across the districts.
  const rushPoints = [
    { x: marina.x, z: marina.z },
    { x: downtown.x + 30, z: downtown.z - 20 },
    { x: oldtown.x, z: oldtown.z },
    { x: hills.x + 20, z: hills.z + 20 },
    { x: downtown.x - 30, z: downtown.z + 30 },
  ];

  const api = {
    list: [],
    current: 0,
    currentMarker: null,
    timeLeft: null,
    start,
    update,
    completeCurrentObjective,
    reset,
    jumpTo,
  };
  // Boot wires game.missions = createMissions(game); also expose it here so
  // the HUD can read game.missions.currentMarker even if boot wires it late.
  game.missions = api;

  function playerXZ() {
    const p = game.playerPos || (game.player && game.player.group && game.player.group.position);
    return p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
  }

  function setMarker(x, z) {
    api.currentMarker = { x, z };
    if (game.missions) game.missions.currentMarker = api.currentMarker;
    const m = api.list[api.current];
    if (m) m.marker = { x, z };
    if (beacon) {
      beacon.group.position.set(x, 0, z);
      beacon.group.visible = game.state?.mode === 'playing';
    }
  }

  function hideBeacon() {
    if (beacon) beacon.group.visible = false;
  }

  function say(text, dur) {
    try {
      if (game.hud && typeof game.hud.showMessage === 'function') game.hud.showMessage(text, dur || 5);
    } catch (e) { /* HUD optional */ }
  }

  function chime() {
    try {
      if (game.audio && typeof game.audio.chime === 'function') game.audio.chime();
    } catch (e) { /* audio optional */ }
  }

  function mission(i) { return api.list[i]; }

  const list = [
    {
      id: 'first-wheels',
      name: 'First Wheels',
      briefing: 'Madame Sol needs a driver. Your gold car is waiting downtown — go claim it.',
      objective: 'Reach the gold car and press E to get in',
      timeLimit: null,
      marker: { ...heroCar },
      _done: false,
      setup() {
        this._done = false;
        setMarker(heroCar.x, heroCar.z);
        say('Madame Sol: "The gold car is yours. Don\'t scratch it."');
      },
      update() {},
      isDone() {
        if (this._done) return true;
        if (game.state && game.state.inCar) { this._done = true; return true; }
        const p = playerXZ();
        // Standing next to the car also counts if boot already seated the player.
        if (dist2D(p.x, p.z, heroCar.x, heroCar.z) < 4 && game.state && game.state.inCar) {
          this._done = true; return true;
        }
        return false;
      },
    },
    {
      id: 'sunset-delivery',
      name: 'Sunset Delivery',
      briefing: 'A package for the Marina — and the sun is already going down. 90 seconds.',
      objective: 'Deliver the package to the Marina before the timer runs out',
      timeLimit: 90,
      marker: { ...marina },
      _done: false,
      setup() {
        this._done = false;
        api.timeLeft = 90;
        setMarker(marina.x, marina.z);
        say('Madame Sol: "Marina. Ninety seconds. No excuses."');
      },
      update(dt) {
        api.timeLeft = Math.max(0, (api.timeLeft ?? 90) - dt);
        if (api.timeLeft <= 0 && !this._done && game.state?.mode === 'playing') {
          if (typeof game.lose === 'function') game.lose('Time up — the delivery window closed.');
        }
      },
      isDone() {
        if (this._done) return true;
        const p = playerXZ();
        if (dist2D(p.x, p.z, marina.x, marina.z) < 8) { this._done = true; return true; }
        return false;
      },
    },
    {
      id: 'checkpoint-rush',
      name: 'Checkpoint Rush',
      briefing: 'Five checkpoints, two minutes, one very impatient client. Chain them in order.',
      objective: 'Drive through all 5 checkpoints in order',
      timeLimit: 120,
      marker: { ...rushPoints[0] },
      _idx: 0,
      _done: false,
      setup() {
        this._idx = 0;
        this._done = false;
        api.timeLeft = 120;
        setMarker(rushPoints[0].x, rushPoints[0].z);
        say('Checkpoint 1 of 5 — go!');
      },
      update(dt) {
        api.timeLeft = Math.max(0, (api.timeLeft ?? 120) - dt);
        if (api.timeLeft <= 0 && !this._done && game.state?.mode === 'playing') {
          if (typeof game.lose === 'function') game.lose('Time up — the rush window closed.');
        }
        const p = playerXZ();
        const cp = rushPoints[this._idx];
        if (cp && dist2D(p.x, p.z, cp.x, cp.z) < 6) {
          this._idx += 1;
          if (this._idx >= rushPoints.length) {
            this._done = true;
          } else {
            const next = rushPoints[this._idx];
            setMarker(next.x, next.z);
            say(`Checkpoint ${this._idx + 1} of 5 — go!`, 3);
            chime();
          }
        }
      },
      isDone() { return this._done; },
    },
    {
      id: 'tail-the-courier',
      name: 'Tail the Courier',
      briefing: 'A courier is carrying something Madame Sol wants to know about. Follow him — close, but not too close.',
      objective: 'Stay 8–40 m behind the courier for 45 seconds',
      timeLimit: null,
      marker: null, // dynamic: follows the courier
      _done: false,
      _tailTime: 0,
      _lostTime: 0,
      _waypoints: [],
      _wp: 0,
      _courier: null,
      setup() {
        this._done = false;
        this._tailTime = 0;
        this._lostTime = 0;
        this._wp = 0;
        // Courier route: a loop through the districts.
        this._waypoints = [
          { x: downtown.x, z: downtown.z },
          { x: marina.x, z: marina.z },
          { x: oldtown.x, z: oldtown.z },
          { x: hills.x, z: hills.z },
          { x: downtown.x, z: downtown.z },
        ];
        const p = playerXZ();
        const start = { x: p.x + 25, z: p.z + 10 };
        if (!this._courier && scene) {
          const g = new THREE.Group();
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.7, 4.0),
            new THREE.MeshLambertMaterial({ color: 0xd8a020 }),
          );
          body.position.y = 0.6;
          g.add(body);
          const cab = new THREE.Mesh(
            new THREE.BoxGeometry(1.7, 0.55, 1.8),
            new THREE.MeshLambertMaterial({ color: 0x222222 }),
          );
          cab.position.set(0, 1.2, -0.2);
          g.add(cab);
          scene.add(g);
          this._courier = g;
        }
        if (this._courier) {
          this._courier.position.set(start.x, 0, start.z);
          this._courier.visible = true;
        }
        setMarker(start.x, start.z);
        say('Madame Sol: "Follow the yellow courier. Don\'t let him see you — or lose you."');
      },
      update(dt) {
        if (!this._courier) return;
        const c = this._courier.position;
        const target = this._waypoints[this._wp] || this._waypoints[0];
        const dx = target.x - c.x;
        const dz = target.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 5) {
          this._wp = (this._wp + 1) % this._waypoints.length;
        } else {
          const speed = 8;
          c.x += (dx / d) * speed * dt;
          c.z += (dz / d) * speed * dt;
          this._courier.rotation.y = Math.atan2(dx, dz);
        }
        setMarker(c.x, c.z);
        const p = playerXZ();
        const pd = dist2D(p.x, p.z, c.x, c.z);
        if (pd >= 8 && pd <= 40) {
          this._tailTime += dt;
          this._lostTime = 0;
          if (this._tailTime >= 45) this._done = true;
        } else if (pd > 55) {
          this._lostTime += dt;
          if (this._lostTime >= 6 && game.state?.mode === 'playing') {
            if (typeof game.lose === 'function') game.lose('You lost the courier.');
          }
        } else {
          // Too close (< 8 m): tail time stalls but the tail is not lost.
          this._lostTime = 0;
        }
      },
      isDone() { return this._done; },
    },
    {
      id: 'heat-escape',
      name: 'Heat Escape',
      briefing: 'The heat is on — three stars and every unit in Solhaven is looking for you. Lose them, or vanish into the hideout.',
      objective: 'Drop your wanted level to 0, or reach the hideout',
      timeLimit: null,
      marker: { ...oldtown },
      _done: false,
      setup() {
        this._done = false;
        setMarker(oldtown.x, oldtown.z);
        if (typeof game.setWanted === 'function') game.setWanted(3);
        else if (game.state) game.state.wanted = 3;
        say('Madame Sol: "Three stars. Lose them — or run to the Old Town hideout."');
      },
      update() {
        const p = playerXZ();
        if (dist2D(p.x, p.z, oldtown.x, oldtown.z) < 8) {
          if (typeof game.setWanted === 'function') game.setWanted(0);
          else if (game.state) game.state.wanted = 0;
          this._done = true;
        }
      },
      isDone() {
        if (this._done) return true;
        if ((game.state?.wanted || 0) === 0) { this._done = true; return true; }
        return false;
      },
    },
    {
      id: 'the-last-score',
      name: 'The Last Score',
      briefing: 'One vault, one score, one way out. Grab it downtown, then outrun the full siege to the Hills hideout.',
      objective: 'Take the score from the Downtown vault, then escape to the Hills hideout',
      timeLimit: null,
      marker: { ...downtown },
      _phase: 0,
      _done: false,
      setup() {
        this._phase = 0;
        this._done = false;
        setMarker(downtown.x, downtown.z);
        say('Madame Sol: "The vault is downtown. Take it — and then run."');
      },
      update() {
        const p = playerXZ();
        if (this._phase === 0 && dist2D(p.x, p.z, downtown.x, downtown.z) < 8) {
          this._phase = 1;
          if (typeof game.setWanted === 'function') game.setWanted(4);
          else if (game.state) game.state.wanted = 4;
          setMarker(hills.x, hills.z);
          say('Score taken! Full siege — escape to the Hills hideout!', 5);
          chime();
        } else if (this._phase === 1 && dist2D(p.x, p.z, hills.x, hills.z) < 8) {
          this._done = true;
        }
      },
      isDone() { return this._done; },
    },
  ];

  api.list = list;

  function cleanupCourier() {
    const m4 = list[3];
    if (m4 && m4._courier) {
      m4._courier.visible = false;
    }
  }

  function advance() {
    const done = list[api.current];
    if (!done) return;
    cleanupCourier();
    if (api.current >= list.length - 1) {
      api.timeLeft = null;
      hideBeacon();
      say('SOLHAVEN COMPLETE — Madame Sol is pleased.', 6);
      chime();
      if (typeof game.win === 'function') game.win();
      return;
    }
    api.current += 1;
    if (game.state) game.state.missionIndex = api.current;
    const next = list[api.current];
    api.timeLeft = next.timeLimit ?? null;
    say(`${next.name} — ${next.briefing}`, 6);
    chime();
    next.setup(game);
    if (game.hud && typeof game.hud.showObjective === 'function') {
      try { game.hud.showObjective(next.objective); } catch (e) { /* ignore */ }
    }
  }

  function start() {
    api.current = 0;
    if (game.state) game.state.missionIndex = 0;
    const m = list[0];
    api.timeLeft = m.timeLimit ?? null;
    m.setup(game);
    if (game.hud && typeof game.hud.showObjective === 'function') {
      try { game.hud.showObjective(m.objective); } catch (e) { /* ignore */ }
    }
  }

  function reset() {
    cleanupCourier();
    // Reset per-mission flags so a fresh run is clean.
    for (const m of list) {
      m._done = false;
      if (typeof m._idx !== 'undefined') m._idx = 0;
      if (typeof m._tailTime !== 'undefined') { m._tailTime = 0; m._lostTime = 0; m._wp = 0; }
      if (typeof m._phase !== 'undefined') m._phase = 0;
    }
    start();
  }

  // Jump the chain to mission i (used by Continue-from-save): switch the
  // active mission and run its setup, without touching the other missions.
  function jumpTo(i) {
    const idx = Math.max(0, Math.min(list.length - 1, i | 0));
    cleanupCourier();
    api.current = idx;
    if (game.state) game.state.missionIndex = idx;
    const m = list[idx];
    api.timeLeft = m.timeLimit ?? null;
    m.setup(game);
    if (game.hud && typeof game.hud.showObjective === 'function') {
      try { game.hud.showObjective(m.objective); } catch (e) { /* ignore */ }
    }
  }

  function update(dt) {
    if (!game.state || game.state.mode !== 'playing') {
      if (beacon) beacon.group.visible = false;
      return;
    }
    if (dt <= 0) dt = 0.016;
    dt = Math.min(dt, 0.1);
    pulseT += dt;
    const m = list[api.current];
    if (!m) return;
    // Beacon pulse.
    if (beacon) {
      beacon.group.visible = true;
      const s = 1 + Math.sin(pulseT * 4) * 0.12;
      beacon.ring.scale.set(s, s, 1);
      beacon.cylMat.opacity = 0.16 + Math.sin(pulseT * 4) * 0.06;
      if (api.currentMarker) {
        beacon.group.position.x = api.currentMarker.x;
        beacon.group.position.z = api.currentMarker.z;
      }
    }
    try { m.update(dt, game); } catch (e) { /* a mission bug must not kill the frame */ }
    if (game.state.mode !== 'playing') return;
    let done = false;
    try { done = m.isDone(game); } catch (e) { done = false; }
    if (done) advance();
  }

  function completeCurrentObjective() {
    // Self-test path: force the active mission's completion through the same
    // isDone -> advance transition the player uses.
    const m = list[api.current];
    if (!m) return;
    m._done = true;
    if (typeof m._idx !== 'undefined') m._idx = 999;
    if (typeof m._phase !== 'undefined') m._phase = 1;
    if (m.id === 'the-last-score') {
      // Phase 1 (grab) then phase 2 (escape) both count as done for the test.
      m._done = true;
    }
    if (m.id === 'heat-escape' && game.state) {
      if (typeof game.setWanted === 'function') game.setWanted(0);
      else game.state.wanted = 0;
    }
    // Run the same transition the live update loop runs.
    update(0);
    // If update() did not run the transition (e.g. mode was not 'playing'
    // when the test called this), advance directly — the mission is forced
    // done, so the transition is the same one update() would have taken.
    // update() already advanced when it ran, in which case list[current]
    // is no longer m and this is a no-op.
    if (list[api.current] === m) advance();
  }

  return api;
}
