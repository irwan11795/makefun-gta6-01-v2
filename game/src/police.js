import * as THREE from 'three';
import { clamp, angleLerp, randRange, damp, box, resolveAABB } from './utils.js';

// SOLHAVEN police system.
// Wanted 0: no units. Wanted >= 1: chase cars (2 + wanted).
// Wanted >= 3: helicopter spotlight. Wanted >= 4: SIEGE (+3 cars + roadblock).
// Busted: a unit within 2.5 m of the player for 2.5 s straight while the
// player is moving slower than 2 m/s -> game.lose('busted').

const BUST_DIST = 2.5;
const BUST_TIME = 2.5;
const MAX_UNITS = 9;

function makePoliceCar() {
  const group = new THREE.Group();

  // Body: white box with a black cabin / hood stripe feel.
  const body = box(2.0, 0.55, 4.2, 0xf2f2f2);
  body.position.y = 0.55;
  group.add(body);

  const cabin = box(1.7, 0.5, 2.0, 0x1a1a22);
  cabin.position.set(0, 1.05, -0.2);
  group.add(cabin);

  const stripe = box(2.02, 0.18, 4.22, 0x111111);
  stripe.position.y = 0.62;
  group.add(stripe);

  // Wheels: four dark cylinders turned on their side.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelPos = [[-0.95, 0.36, 1.35], [0.95, 0.36, 1.35], [-0.95, 0.36, -1.35], [0.95, 0.36, -1.35]];
  for (const [x, y, z] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    group.add(w);
  }

  // Lightbar: red (left) + blue (right) flashing beacons.
  const barBase = box(1.5, 0.1, 0.4, 0x222222);
  barBase.position.set(0, 1.38, -0.2);
  group.add(barBase);

  const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.34), redMat);
  red.position.set(-0.38, 1.5, -0.2);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.34), blueMat);
  blue.position.set(0.38, 1.5, -0.2);
  group.add(red);
  group.add(blue);

  // Headlights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), headMat);
    h.position.set(sx, 0.6, 2.12);
    group.add(h);
  }

  return { group, red, blue, redMat, blueMat };
}

function makeHelicopter() {
  const group = new THREE.Group();

  const body = box(2.2, 1.1, 3.6, 0x223344);
  body.position.y = 0;
  group.add(body);

  const cockpit = box(1.8, 0.8, 1.2, 0x9fd8ff);
  cockpit.position.set(0, 0.1, 1.5);
  group.add(cockpit);

  const tail = box(0.5, 0.5, 3.4, 0x223344);
  tail.position.set(0, 0.2, -3.2);
  group.add(tail);

  const skidL = box(0.12, 0.12, 2.6, 0x111111);
  skidL.position.set(-0.9, -0.9, 0);
  const skidR = box(0.12, 0.12, 2.6, 0x111111);
  skidR.position.set(0.9, -0.9, 0);
  group.add(skidL);
  group.add(skidR);

  // Main rotor (spins) + tail rotor.
  const rotor = box(7.0, 0.08, 0.5, 0x111111);
  rotor.position.y = 0.85;
  group.add(rotor);
  const tailRotor = box(0.08, 1.4, 0.4, 0x111111);
  tailRotor.position.set(0.3, 0.3, -4.8);
  group.add(tailRotor);

  // Spotlight cone pointing down.
  const coneGeo = new THREE.ConeGeometry(6, 30, 20, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = -15;
  cone.rotation.x = Math.PI;
  group.add(cone);

  const spot = new THREE.SpotLight(0xfff2b0, 60, 60, 0.35, 0.5, 1.2);
  spot.position.set(0, -0.5, 0);
  spot.target.position.set(0, -30, 0);
  group.add(spot);
  group.add(spot.target);

  return { group, rotor, tailRotor };
}

function pickRoadPointNear(city, px, pz, minDist, maxDist) {
  const roads = (city && city.roads) || [];
  const bounds = (city && city.bounds) || { minX: -120, maxX: 120, minZ: -120, maxZ: 120 };
  for (let attempt = 0; attempt < 12; attempt++) {
    let x; let z;
    if (roads.length > 0) {
      const r = roads[Math.floor(Math.random() * roads.length)];
      const t = Math.random();
      x = r.x1 + (r.x2 - r.x1) * t;
      z = r.z1 + (r.z2 - r.z1) * t;
      x += randRange(-6, 6);
      z += randRange(-6, 6);
    } else {
      const a = Math.random() * Math.PI * 2;
      const d = randRange(minDist, maxDist);
      x = px + Math.cos(a) * d;
      z = pz + Math.sin(a) * d;
    }
    const d = Math.hypot(x - px, z - pz);
    if (d >= minDist * 0.5 && d <= maxDist * 1.6) {
      return {
        x: clamp(x, bounds.minX + 4, bounds.maxX - 4),
        z: clamp(z, bounds.minZ + 4, bounds.maxZ - 4),
      };
    }
  }
  const a = Math.random() * Math.PI * 2;
  return {
    x: clamp(px + Math.cos(a) * maxDist, bounds.minX + 4, bounds.maxX - 4),
    z: clamp(pz + Math.sin(a) * maxDist, bounds.minZ + 4, bounds.maxZ - 4),
  };
}

export function createPolice(scene, city) {
  const units = [];
  let heli = null;
  let roadblock = null;
  let roadblockGroup = null;
  let bustTimer = 0;
  let flashT = 0;
  let sirenOn = false;

  function spawnUnit(px, pz) {
    const built = makePoliceCar();
    const p = pickRoadPointNear(city, px, pz, 35, 70);
    built.group.position.set(p.x, 0, p.z);
    built.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(built.group);
    const unit = {
      group: built.group,
      red: built.red,
      blue: built.blue,
      redMat: built.redMat,
      blueMat: built.blueMat,
      heading: Math.random() * Math.PI * 2,
      speed: 0,
      maxSpeed: 19,
      stuckT: 0,
    };
    unit.group.rotation.y = unit.heading;
    units.push(unit);
    return unit;
  }

  function removeUnit(unit) {
    scene.remove(unit.group);
    const i = units.indexOf(unit);
    if (i >= 0) units.splice(i, 1);
  }

  function ensureHeli() {
    if (heli) return;
    heli = makeHelicopter();
    scene.add(heli.group);
  }

  function removeHeli() {
    if (!heli) return;
    scene.remove(heli.group);
    heli = null;
  }

  function ensureRoadblock(px, pz, heading) {
    if (roadblock) return;
    roadblockGroup = new THREE.Group();
    const a = makePoliceCar();
    const b = makePoliceCar();
    // Parked across the road: sideways, side by side, blocking the lane.
    a.group.position.set(-2.4, 0, 0);
    a.group.rotation.y = Math.PI / 2;
    b.group.position.set(2.4, 0, 0);
    b.group.rotation.y = Math.PI / 2;
    roadblockGroup.add(a.group);
    roadblockGroup.add(b.group);
    roadblockGroup.position.set(px, 0, pz);
    roadblockGroup.rotation.y = heading;
    scene.add(roadblockGroup);
    roadblock = { group: roadblockGroup, cars: [a, b], x: px, z: pz };
  }

  function removeRoadblock() {
    if (!roadblockGroup) return;
    scene.remove(roadblockGroup);
    roadblockGroup = null;
    roadblock = null;
  }

  function collideBuildings(unit, dt) {
    const colliders = (city && city.colliders) || [];
    if (colliders.length === 0) return;
    const pos = unit.group.position;
    const half = { x: 1.1, z: 2.2 };
    for (const c of colliders) {
      const inside = pos.x > c.minX - half.x && pos.x < c.maxX + half.x
        && pos.z > c.minZ - half.z && pos.z < c.maxZ + half.z;
      if (!inside) continue;
      // Manual push-out (always correct), then also ask utils to resolve.
      const pushLeft = (pos.x - (c.minX - half.x));
      const pushRight = ((c.maxX + half.x) - pos.x);
      const pushBack = (pos.z - (c.minZ - half.z));
      const pushFront = ((c.maxZ + half.z) - pos.z);
      const m = Math.min(pushLeft, pushRight, pushBack, pushFront);
      if (m === pushLeft) pos.x = c.minX - half.x;
      else if (m === pushRight) pos.x = c.maxX + half.x;
      else if (m === pushBack) pos.z = c.minZ - half.z;
      else pos.z = c.maxZ + half.z;
      try {
        const out = resolveAABB(pos, half, c);
        if (out && typeof out.x === 'number' && typeof out.z === 'number') {
          pos.x = out.x;
          pos.z = out.z;
        }
      } catch (e) { /* utils signature differs; manual push-out already applied */ }
      // Simple bounce: stop and turn away.
      unit.speed = Math.min(unit.speed, 2);
      unit.heading += Math.PI * randRange(0.6, 1.4);
      unit.stuckT = 0.6;
    }
  }

  function update(dt, game) {
    if (!game || !game.state) return;
    if (dt <= 0) dt = 0.016;
    dt = Math.min(dt, 0.05);
    flashT += dt;

    const wanted = clamp(game.state.wanted || 0, 0, 5);
    // Stars are what the HUD shows (rounded); use them for thresholds so
    // the helicopter and the siege match the stars on screen, and a whole
    // number for the unit count so it never flickers on a fractional wanted.
    const stars = Math.round(wanted);
    const playerPos = game.playerPos || (game.player && game.player.group && game.player.group.position);
    if (!playerPos) return;
    const px = playerPos.x;
    const pz = playerPos.z;
    const playerSpeed = Math.abs(game.state.speed || game.player?.speed || 0);
    const playing = game.state.mode === 'playing';

    // ---- Desired unit count ----
    let target = 0;
    if (playing && wanted >= 1) target = 2 + Math.floor(wanted);
    if (playing && stars >= 4) target += 3; // SIEGE extra units
    target = Math.min(target, MAX_UNITS);

    while (units.length < target) spawnUnit(px, pz);
    while (units.length > target) removeUnit(units[units.length - 1]);

    // ---- Helicopter ----
    if (playing && stars >= 3) {
      ensureHeli();
    } else {
      removeHeli();
    }
    if (heli) {
      const hp = heli.group.position;
      hp.x = damp(hp.x, px, 1.6, dt);
      hp.z = damp(hp.z, pz, 1.6, dt);
      hp.y = damp(hp.y, 30, 1.6, dt);
      heli.rotor.rotation.y += dt * 28;
      heli.tailRotor.rotation.x += dt * 30;
      heli.group.rotation.y += dt * 0.4;
    }

    // ---- Roadblock (SIEGE only) ----
    if (playing && stars >= 4) {
      const heading = (game.player && game.player.heading) || 0;
      const aheadX = px + Math.sin(heading) * 28;
      const aheadZ = pz + Math.cos(heading) * 28;
      if (!roadblock) {
        ensureRoadblock(aheadX, aheadZ, heading);
      } else if (Math.hypot(roadblock.x - px, roadblock.z - pz) > 70) {
        removeRoadblock();
        ensureRoadblock(aheadX, aheadZ, heading);
      }
    } else {
      removeRoadblock();
    }

    // ---- Chase + flashing + busted check ----
    const flashing = Math.floor(flashT * 6) % 2 === 0;
    let nearestDist = Infinity;
    for (const unit of units) {
      unit.redMat.color.setHex(flashing ? 0xff2222 : 0x550000);
      unit.blueMat.color.setHex(flashing ? 0x112244 : 0x2266ff);
      unit.red.visible = true;
      unit.blue.visible = true;

      const dx = px - unit.group.position.x;
      const dz = pz - unit.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < nearestDist) nearestDist = dist;

      if (!playing) continue;

      const wantHeading = Math.atan2(dx, dz);
      const steer = clamp(angleLerp(0, ((wantHeading - unit.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI, 1), -1, 1);
      unit.heading += steer * 2.6 * dt;
      if (unit.stuckT > 0) {
        unit.stuckT -= dt;
        unit.speed = damp(unit.speed, 3, 2, dt);
      } else {
        const targetSpeed = dist > 60 ? unit.maxSpeed + 3 : unit.maxSpeed;
        unit.speed = damp(unit.speed, targetSpeed, 1.2, dt);
      }
      unit.group.position.x += Math.sin(unit.heading) * unit.speed * dt;
      unit.group.position.z += Math.cos(unit.heading) * unit.speed * dt;
      unit.group.rotation.y = unit.heading;
      // Slight body roll into turns.
      unit.group.rotation.z = clamp(-steer * 0.06, -0.08, 0.08);

      collideBuildings(unit, dt);

      // Keep inside city bounds.
      const b = (city && city.bounds) || { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };
      unit.group.position.x = clamp(unit.group.position.x, b.minX, b.maxX);
      unit.group.position.z = clamp(unit.group.position.z, b.minZ, b.maxZ);
    }

    // Siren state is visual here; audio siren is driven by boot via game.audio.
    const wantSiren = playing && stars >= 1;
    if (wantSiren !== sirenOn) {
      sirenOn = wantSiren;
      if (game.audio && typeof game.audio.siren === 'function') {
        try { game.audio.siren(sirenOn); } catch (e) { /* audio optional */ }
      }
    }

    // ---- Busted ----
    if (playing && wanted >= 1 && nearestDist <= BUST_DIST && playerSpeed < 2) {
      bustTimer += dt;
      if (bustTimer >= BUST_TIME) {
        bustTimer = 0;
        if (typeof game.lose === 'function') game.lose('busted');
      }
    } else {
      bustTimer = 0;
    }
  }

  function clear() {
    while (units.length > 0) removeUnit(units[0]);
    removeHeli();
    removeRoadblock();
    bustTimer = 0;
    sirenOn = false;
  }

  return {
    units,
    get heli() { return heli; },
    update,
    clear,
  };
}
