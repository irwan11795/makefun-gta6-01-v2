// boot.js — entry point SOLHAVEN: renderer, lampu, input, state machine, loop, debug hooks.
// Ditulis dari nol oleh Builder A. Modul police/missions/hud/audio/save ditulis Builder B;
// boot hanya memanggilnya lewat kontrak nama fungsi di bawah (namespace import + guard),
// tanpa pernah membaca file-file itu.
import * as THREE from 'three';
import { createCity } from './city.js';
import { createHeroCar, createTraffic, updateHeroCar } from './car.js';
import { createPlayer, updatePlayer } from './player.js';
import { clamp } from './utils.js';
import * as PoliceMod from './police.js';
import * as MissionsMod from './missions.js';
import * as HudMod from './hud.js';
import * as AudioMod from './audio.js';
import * as SaveMod from './save.js';

const params = new URLSearchParams(window.location.search);

// ---------- renderer / scene / camera / lampu ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '0';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec9e8);
scene.fog = new THREE.Fog(0xcfe8f5, 220, 700);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 10, 150);

const sun = new THREE.DirectionalLight(0xfff2d9, 1.35);
sun.position.set(140, 190, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 600;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.75));

// ---------- dunia ----------
const city = createCity(scene);
const player = createPlayer(scene, city.spawn.player.x, city.spawn.player.z);
const heroCar = createHeroCar(scene, city.spawn.heroCar.x, city.spawn.heroCar.z);
const traffic = createTraffic(scene, city, 10);

// ---------- objek game ----------
const game = {
  scene, camera, renderer, city, player, heroCar, traffic,
  police: null, missions: null, hud: null, audio: null,
  state: { mode: 'menu', wanted: 0, missionIndex: 0, speed: 0, inCar: false, time: 0, muted: false },
  playerPos: new THREE.Vector3(city.spawn.player.x, 0, city.spawn.player.z),
  lastCrimeAt: -100,
  shotCity: false,
};

// ---------- pemanggil modul B yang aman (tidak pernah melempar ke loop) ----------
function hudCall(name, ...args) {
  try {
    if (game.hud && typeof game.hud[name] === 'function') game.hud[name](...args);
  } catch (e) { console.warn('[solhaven] hud.' + name, e); }
}
function snd(name, ...args) {
  try {
    if (game.audio && typeof game.audio[name] === 'function') game.audio[name](...args);
  } catch (e) { console.warn('[solhaven] audio.' + name, e); }
}
function safeCall(mod, name, ...args) {
  try {
    if (mod && typeof mod[name] === 'function') return mod[name](...args);
  } catch (e) { console.warn('[solhaven] ' + name, e); }
  return undefined;
}

// ---------- wanted / kejahatan ----------
game.setWanted = function (n) {
  game.state.wanted = clamp(n, 0, 5);
  hudCall('setWanted', game.state.wanted);
};
game.addWanted = function (n) {
  game.setWanted(game.state.wanted + n);
};
game.onCrime = function (n) {
  if (game.state.mode !== 'playing') return;
  game.state.wanted = clamp(game.state.wanted + n, 0, 5);
  game.lastCrimeAt = game.state.time;
  hudCall('setWanted', game.state.wanted);
  snd('playCrash');
};

// ---------- alur game ----------
function hideOverlays() {
  const menu = document.getElementById('menu');
  const end = document.getElementById('end');
  const pause = document.getElementById('pause');
  if (menu) menu.style.display = 'none';
  if (end) end.style.display = 'none';
  if (pause) pause.style.display = 'none';
}

function resetGame() {
  game.setWanted(0);
  game.state.missionIndex = 0;
  game.state.time = 0;
  game.state.inCar = false;
  game.state.speed = 0;
  game.lastCrimeAt = -100;
  player.group.visible = true;
  player.group.position.set(city.spawn.player.x, 0, city.spawn.player.z);
  player.heading = Math.PI;
  player.group.rotation.y = Math.PI;
  heroCar.group.position.set(city.spawn.heroCar.x, 0, city.spawn.heroCar.z);
  heroCar.heading = Math.PI;
  heroCar.speed = 0;
  heroCar.group.rotation.y = Math.PI;
  game.playerPos.set(city.spawn.player.x, 0, city.spawn.player.z);
  safeCall(game.police, 'clear');
  safeCall(game.missions, 'reset');
  hideOverlays();
}

game.startGame = function () {
  if (game.state.mode === 'playing') return;
  if (game.state.mode === 'won' || game.state.mode === 'lost') resetGame();
  hideOverlays();
  game.state.mode = 'playing';
  hudCall('setMenu', 'playing');
  snd('resume');
  safeCall(game.missions, 'start');
  snd('playClick');
};

// Continue from a saved mission (HUD Continue button): jump the mission
// chain to the saved index after the game has started.
game.loadSave = function (saved) {
  const idx = saved && typeof saved.missionIndex === 'number' ? saved.missionIndex : 0;
  safeCall(game.missions, 'jumpTo', idx);
};

game.win = function () {
  if (game.state.mode !== 'playing') return;
  game.state.mode = 'won';
  const t = document.getElementById('endTitle');
  const x = document.getElementById('endText');
  const end = document.getElementById('end');
  if (t) t.textContent = 'MENANG! SOLHAVEN milikmu.';
  if (x) x.textContent = 'Semua 6 misi selesai. Kota pantai ini sekarang jadi taman bermainmu.';
  if (end) end.style.display = 'flex';
  snd('playWin');
  safeCall(SaveMod, 'saveGame', game);
};

game.lose = function (reason) {
  if (game.state.mode !== 'playing') return;
  game.state.mode = 'lost';
  const t = document.getElementById('endTitle');
  const x = document.getElementById('endText');
  const end = document.getElementById('end');
  if (t) t.textContent = 'TERTANGKAP!';
  if (x) x.textContent = reason || 'Polisi berhasil menangkapmu.';
  if (end) end.style.display = 'flex';
  snd('playLose');
  safeCall(SaveMod, 'saveGame', game);
};

// ---------- modul Builder B (guarded; kalau belum ada, pakai stub aman) ----------
const audioStub = {
  setMuted() {}, toggleMute() {}, playCrash() {}, playSiren() {},
  playWin() {}, playLose() {}, playClick() {}, startMusic() {}, stopMusic() {},
};
const policeStub = { update() {}, reset() {}, spawnNearPlayer() {} };
const missionsStub = {
  start() {}, update() {}, reset() {},
  completeCurrentObjective() { throw new Error('missions belum tersedia'); },
};

function createFallbackHUD(g) {
  const el = document.getElementById('hud');
  let last = '';
  return {
    update() {
      if (!el) return;
      const st = g.state;
      const text = 'WANTED ' + '★'.repeat(st.wanted) + '☆'.repeat(5 - st.wanted)
        + '   |   ' + Math.round(st.speed * 3.6) + ' km/h'
        + '   |   Misi ' + (st.missionIndex + 1) + '/6';
      if (text !== last) { el.textContent = text; last = text; }
    },
    setWanted() {},
  };
}

try {
  game.police = typeof PoliceMod.createPolice === 'function' ? PoliceMod.createPolice(scene, city, game) : null;
} catch (e) { console.warn('[solhaven] createPolice', e); game.police = null; }
if (!game.police) game.police = policeStub;

try {
  game.missions = typeof MissionsMod.createMissions === 'function' ? MissionsMod.createMissions(game) : null;
} catch (e) { console.warn('[solhaven] createMissions', e); game.missions = null; }
if (!game.missions) game.missions = missionsStub;

try {
  game.hud = typeof HudMod.createHUD === 'function' ? HudMod.createHUD(game) : null;
} catch (e) { console.warn('[solhaven] createHUD', e); game.hud = null; }
if (!game.hud) game.hud = createFallbackHUD(game);

try {
  game.audio = typeof AudioMod.createAudio === 'function' ? AudioMod.createAudio(game) : null;
} catch (e) { console.warn('[solhaven] createAudio', e); game.audio = null; }
if (!game.audio) game.audio = audioStub;

// Start on the menu: hide the in-game HUD until play begins.
hudCall('setMenu', 'menu');

safeCall(SaveMod, 'loadSave', game);

// ---------- input ----------
const keys = new Set();
const input = { up: false, down: false, left: false, right: false, handbrake: false };
function refreshInput() {
  input.up = keys.has('KeyW') || keys.has('ArrowUp');
  input.down = keys.has('KeyS') || keys.has('ArrowDown');
  input.left = keys.has('KeyA') || keys.has('ArrowLeft');
  input.right = keys.has('KeyD') || keys.has('ArrowRight');
  input.handbrake = keys.has('Space');
}

function toggleCar() {
  if (game.state.mode !== 'playing') return;
  if (!game.state.inCar) {
    const dx = heroCar.group.position.x - player.group.position.x;
    const dz = heroCar.group.position.z - player.group.position.z;
    if (dx * dx + dz * dz < 16) {
      game.state.inCar = true;
      player.group.visible = false;
      game.playerPos.copy(heroCar.group.position);
      snd('playClick');
    }
  } else {
    game.state.inCar = false;
    const h = heroCar.heading;
    const rx = -Math.cos(h);
    const rz = Math.sin(h);
    player.group.position.set(
      heroCar.group.position.x + rx * 2.6,
      0,
      heroCar.group.position.z + rz * 2.6
    );
    player.heading = h;
    player.group.rotation.y = h;
    player.group.visible = true;
    game.playerPos.copy(player.group.position);
    snd('playClick');
  }
}

function togglePause() {
  if (game.state.mode === 'playing') {
    game.state.mode = 'paused';
    const p = document.getElementById('pause');
    if (p) p.style.display = 'flex';
  } else if (game.state.mode === 'paused') {
    game.state.mode = 'playing';
    const p = document.getElementById('pause');
    if (p) p.style.display = 'none';
  }
}

function toggleMute() {
  game.state.muted = !game.state.muted;
  if (game.audio && typeof game.audio.setMuted === 'function') snd('setMuted', game.state.muted);
  else snd('toggleMute');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  refreshInput();
  if (e.code === 'KeyE') toggleCar();
  else if (e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'Enter' && game.state.mode === 'menu') game.startGame();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  refreshInput();
});
const startBtn = document.getElementById('startBtn');
if (startBtn) startBtn.addEventListener('click', () => game.startGame());
const restartBtn = document.getElementById('restartBtn');
if (restartBtn) restartBtn.addEventListener('click', () => game.startGame());

// ---------- kamera ----------
const camLook = new THREE.Vector3(0, 1, 120);
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
function updateCamera(dt) {
  const st = game.state;
  if (game.shotCity) {
    desiredPos.set(0, 300, 330);
    desiredLook.set(0, 0, 0);
  } else if (st.mode === 'menu') {
    const a = st.time * 0.06;
    desiredPos.set(Math.sin(a) * 190, 95, Math.cos(a) * 190);
    desiredLook.set(0, 0, 20);
  } else if (st.inCar) {
    const h = heroCar.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const p = heroCar.group.position;
    desiredPos.set(p.x - fx * 11, 5.2, p.z - fz * 11);
    desiredLook.set(p.x + fx * 8, 1.6, p.z + fz * 8);
  } else {
    const h = player.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const p = player.group.position;
    desiredPos.set(p.x - fx * 7.5, 4.2, p.z - fz * 7.5);
    desiredLook.set(p.x + fx * 4, 1.4, p.z + fz * 4);
  }
  camera.position.lerp(desiredPos, 1 - Math.exp(-4 * dt));
  camLook.lerp(desiredLook, 1 - Math.exp(-6 * dt));
  camera.lookAt(camLook);
}

// ---------- game loop ----------
const clock = new THREE.Clock();
function safeModuleUpdate(mod, label, dt) {
  if (!mod || typeof mod.update !== 'function') return;
  try {
    mod.update(dt, game);
  } catch (e) {
    console.warn('[solhaven] ' + label + '.update error, dimatikan:', e);
    mod.update = function () {};
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const st = game.state;
  if (st.mode === 'playing') {
    st.time += dt;
    // wanted decay: -0.02/detik setelah 5 detik tanpa kejahatan
    if (st.time - game.lastCrimeAt > 5 && st.wanted > 0) {
      game.setWanted(st.wanted - 0.02 * dt);
    }
    if (st.inCar) {
      updateHeroCar(heroCar, input, dt, city, game);
      game.playerPos.copy(heroCar.group.position);
      st.speed = Math.abs(heroCar.speed);
    } else {
      const camHeading = Math.atan2(
        game.playerPos.x - camera.position.x,
        game.playerPos.z - camera.position.z
      );
      updatePlayer(player, input, dt, city, camHeading);
      game.playerPos.copy(player.group.position);
      st.speed = player.speed;
    }
    safeModuleUpdate(traffic, 'traffic', dt);
    safeModuleUpdate(city, 'city', dt);
    safeModuleUpdate(game.police, 'police', dt);
    safeModuleUpdate(game.missions, 'missions', dt);
    safeModuleUpdate(game.hud, 'hud', dt);
    // Engine hum follows speed; siren sounds while wanted.
    snd('engine', st.inCar ? Math.min(1, st.speed / 42) : 0);
    snd('siren', st.wanted >= 1);
  } else if (st.mode === 'menu') {
    st.time += dt;
    safeModuleUpdate(traffic, 'traffic', dt);
    safeModuleUpdate(city, 'city', dt);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- debug hooks (query params) ----------
const shot = params.get('shot');
if (params.get('autostart') === '1' || params.get('selftest') === '1' || shot === 'chase' || shot === 'city' || shot === 'mission') {
  game.startGame();
}
if (shot === 'chase') {
  game.setWanted(3);
  // Grace period so decay does not drop wanted below 3 at once.
  game.lastCrimeAt = game.state.time;
}
if (shot === 'city') {
  game.shotCity = true;
}
if (params.get('selftest') === '1') {
  runSelfTest();
}

async function runSelfTest() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (!game.missions || typeof game.missions.completeCurrentObjective !== 'function') {
      throw new Error('missions.completeCurrentObjective tidak tersedia');
    }
    for (let i = 0; i < 6; i++) {
      await sleep(400);
      await game.missions.completeCurrentObjective();
      await sleep(200);
      if (game.state.mode === 'won') break;
    }
    await sleep(500);
    if (game.state.mode === 'won' || game.state.missionIndex >= 6) {
      document.title = 'SELFTEST WIN';
      console.log('SELFTEST WIN');
    } else {
      throw new Error('misi tidak selesai (mode=' + game.state.mode + ', missionIndex=' + game.state.missionIndex + ')');
    }
  } catch (err) {
    document.title = 'SELFTEST FAIL: ' + (err && err.message ? err.message : String(err));
    console.log('SELFTEST FAIL: ' + (err && err.message ? err.message : String(err)));
  }
}

window.__solhaven = game;
