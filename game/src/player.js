// player.js — karakter pejalan kaki pemain SOLHAVEN.
// Ditulis dari nol oleh Builder A. Dependensi: three + utils.
import * as THREE from 'three';
import { box, clamp, angleLerp, resolveAABB } from './utils.js';

export function createPlayer(scene, x, z) {
  const group = new THREE.Group();
  const shirt = 0x2f7fc4;
  const body = box(0.62, 0.85, 0.34, shirt);
  body.position.y = 1.0;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a })
  );
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  // topi emas
  const cap = box(0.5, 0.12, 0.5, 0xd4af37);
  cap.position.y = 1.9;
  group.add(cap);
  const legL = box(0.22, 0.55, 0.24, 0x2c3240);
  legL.position.set(-0.16, 0.3, 0);
  group.add(legL);
  const legR = box(0.22, 0.55, 0.24, 0x2c3240);
  legR.position.set(0.16, 0.3, 0);
  group.add(legR);
  const armL = box(0.16, 0.6, 0.18, shirt);
  armL.position.set(-0.42, 1.0, 0);
  group.add(armL);
  const armR = box(0.16, 0.6, 0.18, shirt);
  armR.position.set(0.42, 1.0, 0);
  group.add(armR);
  group.position.set(x, 0, z);
  group.rotation.y = Math.PI;
  scene.add(group);
  return { group, heading: Math.PI, speed: 0, onFoot: true, legs: [legL, legR], arms: [armL, armR], walkPhase: 0 };
}

export function updatePlayer(player, input, dt, city, camHeading) {
  // Gerak relatif kamera: W = menjauhi kamera, S = mendekati kamera.
  const fx = Math.sin(camHeading);
  const fz = Math.cos(camHeading);
  const rx = -fz;
  const rz = fx;
  const f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let mx = fx * f + rx * r;
  let mz = fz * f + rz * r;
  const len = Math.hypot(mx, mz);
  const WALK = 6.5;
  if (len > 0.01) {
    mx /= len;
    mz /= len;
    const targetHeading = Math.atan2(mx, mz);
    player.heading = angleLerp(player.heading, targetHeading, 1 - Math.exp(-10 * dt));
    player.speed = WALK;
    const nx = player.group.position.x + mx * WALK * dt;
    const nz = player.group.position.z + mz * WALK * dt;
    const fixed = resolveAABB({ x: nx, z: nz }, 0.45, 0.45, city.colliders);
    player.group.position.x = clamp(fixed.x, -238, 238);
    player.group.position.z = clamp(fixed.z, -238, 238);
    // animasi jalan: ayun kaki/tangan + bob
    player.walkPhase += dt * 10;
    const s = Math.sin(player.walkPhase);
    player.legs[0].rotation.x = s * 0.55;
    player.legs[1].rotation.x = -s * 0.55;
    player.arms[0].rotation.x = -s * 0.4;
    player.arms[1].rotation.x = s * 0.4;
    player.group.position.y = Math.abs(Math.cos(player.walkPhase)) * 0.05;
  } else {
    player.speed = 0;
    player.legs[0].rotation.x *= 0.8;
    player.legs[1].rotation.x *= 0.8;
    player.arms[0].rotation.x *= 0.8;
    player.arms[1].rotation.x *= 0.8;
    player.group.position.y *= 0.8;
  }
  player.group.rotation.y = player.heading;
}
