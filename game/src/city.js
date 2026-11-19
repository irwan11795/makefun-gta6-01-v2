// city.js — kota SOLHAVEN: grid jalan, 4 distrik, gedung, taman, laut, pejalan kaki.
// Ditulis dari nol oleh Builder A. Dependensi: three + utils.
import * as THREE from 'three';
import { box, cyl, randRange, resolveAABB } from './utils.js';

const HALF = 240; // setengah ukuran kota (480 x 480)
const ROAD_STEP = 60; // jarak antar garis jalan
const ROAD_W = 10; // lebar jalan
const GRID = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
const BLOCKS = [-210, -150, -90, -30, 30, 90, 150, 210];

// RNG deterministik supaya kota stabil antar load (bagus untuk screenshot/test).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = {
  marina: { walls: [0x2fa8a0, 0x35b5ac, 0x1f8f96, 0x4fc3b8, 0xe8f0ee], roof: 0x2b6f6a, hMin: 8, hMax: 18 },
  downtown: { walls: [0x3a6ea5, 0x2f5d8f, 0x4a7fb8, 0x5b8fc4, 0x2c4f78], roof: 0x22364d, hMin: 20, hMax: 40 },
  oldtown: { walls: [0xd97b3f, 0xc96f35, 0xe08a4a, 0xb85c2e, 0xd9a05b], roof: 0x7a4a2b, hMin: 8, hMax: 16 },
  hills: { walls: [0x5a9e5f, 0x4c8a52, 0x6fb377, 0x3f7d46, 0x86c48a], roof: 0x33502f, hMin: 10, hMax: 22 },
};

function districtAt(cx, cz) {
  if (cz >= 120) return 'marina';
  if (cx >= 120) return 'hills';
  if (cx <= -120) return 'oldtown';
  return 'downtown';
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function createCity(scene) {
  const rng = mulberry32(1337);
  const roads = [];
  const buildings = [];
  const colliders = [];
  const pedestrians = [];

  // ---------- ground ----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshLambertMaterial({ color: 0x86ac72 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- jalan ----------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3c4147 });
  for (const g of GRID) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, HALF * 2), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(g, 0.02, 0);
    v.receiveShadow = true;
    scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, ROAD_W), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, g);
    h.receiveShadow = true;
    scene.add(h);
  }

  // ---------- segmen jalan (untuk lalu lintas) ----------
  for (const g of GRID) {
    for (let s = -HALF; s < HALF; s += ROAD_STEP) {
      roads.push({ x1: g, z1: s, x2: g, z2: s + ROAD_STEP, vertical: true });
      roads.push({ x1: s, z1: g, x2: s + ROAD_STEP, z2: g, vertical: false });
    }
  }

  // ---------- pantai & laut di selatan ----------
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, 8),
    new THREE.MeshLambertMaterial({ color: 0xe9d9a6 })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.03, HALF + 2);
  beach.receiveShadow = true;
  scene.add(beach);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, 90),
    new THREE.MeshLambertMaterial({ color: 0x2f9fd8 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.04, HALF + 51);
  scene.add(sea);

  // ---------- blok: trotoar / taman / gedung ----------
  const parkBlocks = new Set();
  while (parkBlocks.size < 8) {
    parkBlocks.add(Math.floor(rng() * 64));
  }
  let blockIndex = 0;
  for (const cz of BLOCKS) {
    for (const cx of BLOCKS) {
      const idx = blockIndex++;
      const district = districtAt(cx, cz);
      const isPark = parkBlocks.has(idx);
      const slab = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.MeshLambertMaterial({ color: isPark ? 0x6f9e5f : 0xb9b2a4 })
      );
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.03, cz);
      slab.receiveShadow = true;
      scene.add(slab);
      if (isPark) {
        for (let t = 0; t < 3; t++) {
          addTree(scene, cx + randRange(-16, 16), cz + randRange(-16, 16), rng);
        }
        continue;
      }
      const pal = PALETTES[district];
      const two = district === 'downtown' && rng() < 0.45;
      if (two) {
        addBuilding(scene, buildings, colliders, cx - 11, cz, 17, 20, pal, rng);
        addBuilding(scene, buildings, colliders, cx + 11, cz, 17, 20, pal, rng);
      } else {
        addBuilding(scene, buildings, colliders, cx + randRange(-6, 6), cz + randRange(-6, 6), randRange(18, 30), randRange(18, 30), pal, rng);
      }
      if (rng() < 0.5) {
        addTree(scene, cx + (rng() < 0.5 ? -22 : 22), cz + (rng() < 0.5 ? -22 : 22), rng);
      }
    }
  }

  // ---------- lampu jalan di persimpangan ----------
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c3240 });
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xcc9900 });
  for (let ix = 0; ix < GRID.length; ix += 2) {
    for (let iz = 0; iz < GRID.length; iz += 2) {
      const lx = GRID[ix] + 6;
      const lz = GRID[iz] + 6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.2, 8), lampMat);
      pole.position.set(lx, 2.6, lz);
      pole.castShadow = true;
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.0), lampHeadMat);
      head.position.set(lx, 5.25, lz);
      scene.add(head);
    }
  }

  // ---------- pejalan kaki ----------
  const shirts = [0xd94f4f, 0x4f7fd9, 0x53b06a, 0xe8c84a, 0x9a5fd0, 0xe8e8e8, 0x2f2f2f];
  const skins = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0];
  for (let i = 0; i < 24; i++) {
    const vertical = rng() < 0.5;
    const line = pick(rng, GRID);
    const lane = (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 2);
    const along = randRange(-230, 230);
    const x = vertical ? line + lane : along;
    const z = vertical ? along : line + lane;
    const heading = vertical ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    pedestrians.push(makePedestrian(scene, x, z, heading, randRange(1.2, 2.2), pick(rng, shirts), pick(rng, skins)));
  }

  const spawn = {
    player: { x: 0, z: 120 },
    heroCar: { x: 6, z: 120 },
    marina: { x: 0, z: 200 },
    downtown: { x: 0, z: -60 },
    oldtown: { x: -150, z: 60 },
    hills: { x: 150, z: -150 },
  };

  return {
    bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF },
    roads,
    buildings,
    colliders,
    pedestrians,
    spawn,
    districtCenters: {
      marina: { x: 0, z: 200 },
      downtown: { x: 0, z: -60 },
      oldtown: { x: -150, z: 60 },
      hills: { x: 150, z: -150 },
    },
    update(dt, game) {
      updatePedestrians(pedestrians, dt, game, colliders);
    },
  };
}

// ---------- helper ----------

function addBuilding(scene, buildings, colliders, x, z, w, d, pal, rng) {
  const h = pal.hMin + rng() * (pal.hMax - pal.hMin);
  const color = pick(rng, pal.walls);
  const body = box(w, h, d, color);
  body.position.set(x, h / 2, z);
  scene.add(body);
  // atap
  const roof = box(w * 0.72, 1.4, d * 0.72, pal.roof);
  roof.position.set(x, h + 0.7, z);
  scene.add(roof);
  // gedung tinggi: setback lantai atas
  if (h > 26) {
    const top = box(w * 0.45, h * 0.22, d * 0.45, color);
    top.position.set(x, h + 1.4 + h * 0.11, z);
    scene.add(top);
  }
  buildings.push({ x, z, w, d, h });
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}

function addTree(scene, x, z, rng) {
  const trunk = cyl(0.14, 0.2, 1.4, 0x7a5230, 8);
  trunk.position.set(x, 0.7, z);
  scene.add(trunk);
  const top = new THREE.Mesh(
    new THREE.ConeGeometry(randRange(1.2, 1.7), randRange(2.6, 3.6), 8),
    new THREE.MeshLambertMaterial({ color: pick(rng, [0x3f7d46, 0x4c8a52, 0x5a9e5f]) })
  );
  top.position.set(x, 2.9, z);
  top.castShadow = true;
  scene.add(top);
}

function makePedestrian(scene, x, z, heading, speed, shirtColor, skinColor) {
  const group = new THREE.Group();
  const body = box(0.55, 0.85, 0.32, shirtColor);
  body.position.y = 0.98;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshLambertMaterial({ color: skinColor })
  );
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3240 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), legMat);
  legL.position.set(-0.15, 0.3, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legR);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return { group, heading, speed, down: false, downTimer: 0, phase: Math.random() * 6.28, legs: [legL, legR] };
}

function updatePedestrians(pedestrians, dt, game, colliders) {
  const inCar = !!(game && game.state && game.state.inCar);
  const px = game && game.playerPos ? game.playerPos.x : 0;
  const pz = game && game.playerPos ? game.playerPos.z : 0;
  for (const p of pedestrians) {
    if (p.down) {
      p.downTimer += dt;
      if (p.downTimer > 6) {
        p.down = false;
        p.downTimer = 0;
        p.group.rotation.z = 0;
        p.group.position.y = 0;
      }
      continue;
    }
    const nx = p.group.position.x + Math.sin(p.heading) * p.speed * dt;
    const nz = p.group.position.z + Math.cos(p.heading) * p.speed * dt;
    const fixed = resolveAABB({ x: nx, z: nz }, 0.5, 0.5, colliders);
    if (fixed.x !== nx || fixed.z !== nz) {
      // mentok gedung: belok kanan 90 derajat
      p.heading += Math.PI / 2;
    } else {
      p.group.position.x = nx;
      p.group.position.z = nz;
    }
    if (Math.abs(p.group.position.x) > 235 || Math.abs(p.group.position.z) > 235) {
      p.heading += Math.PI; // putar balik di ujung kota
    }
    p.group.rotation.y = p.heading;
    // animasi jalan
    p.phase += dt * 8;
    const s = Math.sin(p.phase);
    p.legs[0].rotation.x = s * 0.5;
    p.legs[1].rotation.x = -s * 0.5;
    p.group.position.y = Math.abs(Math.cos(p.phase)) * 0.06;
    // tabrakan dengan mobil pemain
    if (inCar) {
      const dx = p.group.position.x - px;
      const dz = p.group.position.z - pz;
      if (dx * dx + dz * dz < 4) {
        p.down = true;
        p.downTimer = 0;
        p.group.rotation.z = Math.PI / 2;
        p.group.position.y = 0.3;
        if (game && typeof game.onCrime === 'function') game.onCrime(1);
      }
    }
  }
}
