// utils.js — helper matematika dan factory mesh untuk SOLHAVEN.
// Ditulis dari nol oleh Builder A. Satu-satunya dependensi: three.
import * as THREE from 'three';

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Interpolasi sudut lewat jalur terpendek (bungkus -PI..PI).
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function randRange(a, b) {
  return a + Math.random() * (b - a);
}

// Pendekatan eksponensial menuju target (independen frame-rate).
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

// Mesh kotak Lambert (murah, low-poly). Bayangan aktif.
export function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Mesh silinder Lambert.
export function cyl(rt, rb, h, color, segments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, segments),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Apakah kotak (x, z) setengah ukuran (hw, hd) menyentuh salah satu AABB?
export function aabbsCollide(x, z, hw, hd, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (x + hw > c.minX && x - hw < c.maxX && z + hd > c.minZ && z - hd < c.maxZ) {
      return true;
    }
  }
  return false;
}

// Geser posisi keluar dari AABB yang bertabrakan, lewat sumbu penetrasi terkecil.
// pos: { x, z }. Kembalikan { x, z } baru (pos asli tidak diubah).
export function resolveAABB(pos, hw, hd, colliders) {
  let x = pos.x;
  let z = pos.z;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x + hw > c.minX && x - hw < c.maxX && z + hd > c.minZ && z - hd < c.maxZ) {
        const pushLeft = (x + hw) - c.minX;
        const pushRight = c.maxX - (x - hw);
        const pushUp = (z + hd) - c.minZ;
        const pushDown = c.maxZ - (z - hd);
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) x = c.minX - hw;
        else if (m === pushRight) x = c.maxX + hw;
        else if (m === pushUp) z = c.minZ - hd;
        else z = c.maxZ + hd;
      }
    }
  }
  return { x, z };
}
