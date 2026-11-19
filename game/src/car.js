// car.js — mobil hero, lalu lintas, dan fisika arcade SOLHAVEN.
// Ditulis dari nol oleh Builder A. Dependensi: three + utils.
import * as THREE from 'three';
import { box, cyl, clamp, randRange, damp, resolveAABB, angleLerp } from './utils.js';

const TRAFFIC_COLORS = [0xd8d8d8, 0x3a6ea5, 0xd97b3f, 0x5a9e5f, 0xe8c84a, 0x8a5a9e, 0x222831, 0xc0c0c0];

function now(game) {
  return game && game.state ? game.state.time : 0;
}

function makeWheel(x, z, parent) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.38, z);
  const tire = cyl(0.38, 0.38, 0.3, 0x1a1a1a, 14);
  tire.rotation.z = Math.PI / 2;
  pivot.add(tire);
  parent.add(pivot);
  return pivot;
}

function addLights(group, front) {
  const z = front ? 2.21 : -2.21;
  const mat = new THREE.MeshLambertMaterial({
    color: front ? 0xfff6c0 : 0xd92020,
    emissive: front ? 0xffedb0 : 0x880000,
  });
  for (const sx of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.07), mat);
    lamp.position.set(sx, 0.62, z);
    group.add(lamp);
  }
}

export function createHeroCar(scene, x, z) {
  const group = new THREE.Group();
  // bodi
  const body = box(2.0, 0.55, 4.4, 0xb3122e);
  body.position.y = 0.58;
  group.add(body);
  // kabin kaca gelap
  const cabin = box(1.7, 0.5, 2.1, 0x18222e);
  cabin.position.set(0, 1.08, -0.25);
  group.add(cabin);
  // TRIM EMAS: strip sisi + grille depan + bumper belakang
  const gold = 0xd4af37;
  for (const sx of [-1.01, 1.01]) {
    const strip = box(0.06, 0.09, 4.0, gold);
    strip.position.set(sx, 0.66, 0);
    group.add(strip);
  }
  const grille = box(1.5, 0.2, 0.08, gold);
  grille.position.set(0, 0.5, 2.21);
  group.add(grille);
  const rearTrim = box(1.9, 0.1, 0.07, gold);
  rearTrim.position.set(0, 0.5, -2.21);
  group.add(rearTrim);
  // roda
  const wheels = [
    makeWheel(-0.95, 1.45, group),
    makeWheel(0.95, 1.45, group),
    makeWheel(-0.95, -1.45, group),
    makeWheel(0.95, -1.45, group),
  ];
  addLights(group, true);
  addLights(group, false);
  group.position.set(x, 0, z);
  group.rotation.y = Math.PI; // menghadap utara (-z), masuk kota
  scene.add(group);
  return { group, heading: Math.PI, speed: 0, maxSpeed: 42, accel: 22, isHero: true, wheels, lastCrashAt: -100 };
}

export function createTrafficCar(scene, x, z, color) {
  const group = new THREE.Group();
  const body = box(1.9, 0.55, 4.0, color);
  body.position.y = 0.55;
  group.add(body);
  const cabin = box(1.6, 0.45, 1.9, 0x22303c);
  cabin.position.set(0, 1.02, -0.15);
  group.add(cabin);
  const wheels = [
    makeWheel(-0.9, 1.35, group),
    makeWheel(0.9, 1.35, group),
    makeWheel(-0.9, -1.35, group),
    makeWheel(0.9, -1.35, group),
  ];
  addLights(group, true);
  addLights(group, false);
  group.position.set(x, 0, z);
  scene.add(group);
  return { group, heading: 0, speed: 0, color, wheels };
}

export function createTraffic(scene, city, count = 10) {
  function headingFor(seg, dir) {
    const h = Math.atan2(seg.x2 - seg.x1, seg.z2 - seg.z1);
    return dir === 1 ? h : h + Math.PI;
  }

  // Posisi mobil di atas segmen: s = jarak dari ujung masuk, offset lajur kanan 2.2.
  function positionOn(car) {
    const seg = car.seg;
    const t = car.dir === 1 ? car.s / 60 : 1 - car.s / 60;
    const bx = seg.x1 + (seg.x2 - seg.x1) * t;
    const bz = seg.z1 + (seg.z2 - seg.z1) * t;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = -fz;
    const rz = fx;
    car.group.position.set(bx + rx * 2.2, 0, bz + rz * 2.2);
  }

  const cars = [];
  for (let i = 0; i < count; i++) {
    const seg = city.roads[Math.floor(Math.random() * city.roads.length)];
    const color = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
    const car = createTrafficCar(scene, 0, 0, color);
    car.seg = seg;
    car.dir = Math.random() < 0.5 ? 1 : -1;
    car.s = randRange(5, 55);
    car.baseSpeed = randRange(8, 12);
    car.speed = car.baseSpeed;
    car.heading = headingFor(seg, car.dir);
    car.rotY = car.heading;
    car.lastHitAt = -100;
    positionOn(car);
    cars.push(car);
  }

  function update(dt, game) {
    const inCar = !!(game && game.state && game.state.inCar);
    const px = game && game.playerPos ? game.playerPos.x : 0;
    const pz = game && game.playerPos ? game.playerPos.z : 0;
    const tNow = now(game);
    for (const car of cars) {
      // pelan saat dekat pemain
      const dxp = car.group.position.x - px;
      const dzp = car.group.position.z - pz;
      const distP = Math.sqrt(dxp * dxp + dzp * dzp);
      const target = distP < 14 ? 3.5 : car.baseSpeed;
      car.speed = damp(car.speed, target, 2, dt);
      car.s += car.speed * dt;
      if (car.s >= 60) {
        // sampai ujung segmen: pilih segmen tersambung (bukan segmen yang sama)
        const endX = car.dir === 1 ? car.seg.x2 : car.seg.x1;
        const endZ = car.dir === 1 ? car.seg.z2 : car.seg.z1;
        const next = [];
        for (const r of city.roads) {
          if (r === car.seg) continue;
          if (r.x1 === endX && r.z1 === endZ) next.push({ seg: r, dir: 1 });
          else if (r.x2 === endX && r.z2 === endZ) next.push({ seg: r, dir: -1 });
        }
        if (next.length > 0) {
          const pickN = next[Math.floor(Math.random() * next.length)];
          car.seg = pickN.seg;
          car.dir = pickN.dir;
          car.s = 0;
          car.heading = headingFor(car.seg, car.dir);
        } else {
          car.dir *= -1;
          car.s = 60;
          car.heading = headingFor(car.seg, car.dir);
        }
      }
      positionOn(car);
      car.rotY = angleLerp(car.rotY, car.heading, 1 - Math.exp(-8 * dt));
      car.group.rotation.y = car.rotY;
      for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.38;
      // tabrakan dengan mobil pemain: pantul + wanted kalau keras
      if (inCar && game.heroCar) {
        const hx = game.heroCar.group.position.x;
        const hz = game.heroCar.group.position.z;
        const dx = car.group.position.x - hx;
        const dz = car.group.position.z - hz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 2.8 * 2.8) {
          const d = Math.sqrt(d2) || 1;
          const ax = dx / d;
          const az = dz / d;
          const impact = Math.abs(game.heroCar.speed);
          game.heroCar.group.position.x += ax * 1.2;
          game.heroCar.group.position.z += az * 1.2;
          game.heroCar.speed *= -0.3;
          car.speed *= 0.4;
          if (impact > 12 && tNow - car.lastHitAt > 1.5 && game && typeof game.onCrime === 'function') {
            car.lastHitAt = tNow;
            game.onCrime(1);
          }
        }
      }
    }
  }

  return { cars, update };
}

export function updateHeroCar(car, input, dt, city, game) {
  const tNow = now(game);
  if (input.up) {
    car.speed += car.accel * dt;
  } else if (input.down) {
    if (car.speed > 0.5) car.speed -= car.accel * 1.6 * dt; // rem
    else car.speed -= car.accel * 0.7 * dt; // mundur
  } else {
    car.speed = damp(car.speed, 0, 1.0, dt);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  car.speed = clamp(car.speed, -14, car.maxSpeed);
  if (input.handbrake) {
    car.speed = damp(car.speed, 0, 4, dt);
  }
  // belok: sensitif kecepatan, terbalik saat mundur, lebih tajam saat handbrake
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const grip = clamp(Math.abs(car.speed) / 12, 0, 1);
  const turnRate = 2.1 * (input.handbrake ? 1.5 : 1);
  car.heading += steer * turnRate * grip * Math.sign(car.speed || 1) * dt;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let nx = car.group.position.x + fx * car.speed * dt;
  let nz = car.group.position.z + fz * car.speed * dt;
  // tabrakan gedung
  const fixed = resolveAABB({ x: nx, z: nz }, 1.4, 1.4, city.colliders);
  const hitWall = fixed.x !== nx || fixed.z !== nz;
  nx = fixed.x;
  nz = fixed.z;
  // batas dunia
  const hitBound = nx < -238 || nx > 238 || nz < -238 || nz > 238;
  nx = clamp(nx, -238, 238);
  nz = clamp(nz, -238, 238);
  if (hitWall) {
    if (Math.abs(car.speed) > 12 && tNow - car.lastCrashAt > 1.5 && game && typeof game.onCrime === 'function') {
      car.lastCrashAt = tNow;
      game.onCrime(1);
    }
    car.speed *= 0.45;
  }
  if (hitBound) car.speed *= 0.6;
  car.group.position.x = nx;
  car.group.position.z = nz;
  car.group.rotation.y = car.heading;
  for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.38;
}
