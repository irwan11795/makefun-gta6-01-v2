// SOLHAVEN HUD — DOM overlay + minimap.
// Builds its elements with document.createElement inside the existing
// #hud / #menu / #end containers from index.html (created as a fallback
// if a container is missing, so the HUD never crashes the game).
// update(dt) reads game.state / game objects every frame; the minimap
// redraws at ~10 fps.

import { loadProgress } from './save.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

function fmtTime(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function createHUD(game) {
  const hudRoot = document.getElementById('hud') || (() => {
    const d = el('div', 'hud');
    d.id = 'hud';
    document.body.appendChild(d);
    return d;
  })();
  const menuRoot = document.getElementById('menu') || (() => {
    const d = el('div', 'menu');
    d.id = 'menu';
    document.body.appendChild(d);
    return d;
  })();
  const endRoot = document.getElementById('end') || (() => {
    const d = el('div', 'end');
    d.id = 'end';
    document.body.appendChild(d);
    return d;
  })();

  // ---------- HUD layout ----------
  hudRoot.style.position = 'absolute';
  hudRoot.style.inset = '0';
  hudRoot.style.pointerEvents = 'none';
  hudRoot.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  hudRoot.style.color = '#fff';
  hudRoot.style.zIndex = '10';

  // Top-left: wanted stars.
  const wantedBox = el('div', 'hud-wanted');
  wantedBox.style.cssText = 'position:absolute;top:14px;left:16px;font-size:26px;letter-spacing:4px;text-shadow:0 2px 6px rgba(0,0,0,.7);';
  const wantedStars = el('span', 'hud-stars', '☆☆☆☆☆');
  wantedBox.appendChild(wantedStars);
  hudRoot.appendChild(wantedBox);

  // Top-right: speed + mode.
  const speedBox = el('div', 'hud-speed');
  speedBox.style.cssText = 'position:absolute;top:14px;right:16px;text-align:right;text-shadow:0 2px 6px rgba(0,0,0,.7);';
  const speedNum = el('div', 'hud-speed-num', '0');
  speedNum.style.cssText = 'font-size:34px;font-weight:800;line-height:1;';
  const speedUnit = el('div', 'hud-speed-unit', 'km/h · On foot');
  speedUnit.style.cssText = 'font-size:13px;opacity:.9;';
  speedBox.appendChild(speedNum);
  speedBox.appendChild(speedUnit);
  hudRoot.appendChild(speedBox);

  // Mission panel (left, below wanted).
  const missionBox = el('div', 'hud-mission');
  missionBox.style.cssText = 'position:absolute;top:64px;left:16px;max-width:320px;background:rgba(0,0,0,.45);border-left:4px solid #39ff88;border-radius:6px;padding:10px 12px;text-shadow:0 1px 3px rgba(0,0,0,.8);';
  const missionName = el('div', 'hud-mission-name', 'SOLHAVEN');
  missionName.style.cssText = 'font-size:15px;font-weight:700;color:#7dffb0;';
  const missionObj = el('div', 'hud-mission-objective', '');
  missionObj.style.cssText = 'font-size:13px;line-height:1.4;margin-top:2px;';
  const missionMeta = el('div', 'hud-mission-meta', '');
  missionMeta.style.cssText = 'font-size:12px;opacity:.9;margin-top:6px;';
  missionBox.appendChild(missionName);
  missionBox.appendChild(missionObj);
  missionBox.appendChild(missionMeta);
  hudRoot.appendChild(missionBox);

  // Minimap (bottom-right), 180x180 canvas.
  const mapWrap = el('div', 'hud-minimap-wrap');
  mapWrap.style.cssText = 'position:absolute;right:16px;bottom:16px;width:180px;height:180px;border:2px solid rgba(255,255,255,.55);border-radius:50%;overflow:hidden;background:rgba(2,20,32,.75);box-shadow:0 4px 16px rgba(0,0,0,.5);';
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = 180;
  mapCanvas.height = 180;
  mapCanvas.style.cssText = 'display:block;width:180px;height:180px;';
  mapWrap.appendChild(mapCanvas);
  hudRoot.appendChild(mapWrap);

  // Message feed (bottom-center).
  const feed = el('div', 'hud-feed');
  feed.style.cssText = 'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;max-width:70%;';
  hudRoot.appendChild(feed);

  const ctx = mapCanvas.getContext('2d');
  let mapTimer = 0;
  let pulseT = 0;

  function drawMinimap(now) {
    if (!ctx) return;
    const W = 180; const H = 180;
    const city = game.city || {};
    const bounds = city.bounds || { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxZ - bounds.minZ);
    const scale = Math.min(W / bw, H / bh) * 0.92;
    const ox = W / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
    const oz = H / 2 - ((bounds.minZ + bounds.maxZ) / 2) * scale;
    const X = (x) => ox + x * scale;
    const Z = (z) => oz + z * scale;

    ctx.clearRect(0, 0, W, H);
    // Sea / ground.
    ctx.fillStyle = '#0b2f3f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#123f2a';
    ctx.fillRect(X(bounds.minX), Z(bounds.minZ), bw * scale, bh * scale);
    // Roads.
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = 4;
    for (const r of (city.roads || [])) {
      ctx.beginPath();
      ctx.moveTo(X(r.x1), Z(r.z1));
      ctx.lineTo(X(r.x2), Z(r.z2));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    for (const r of (city.roads || [])) {
      ctx.beginPath();
      ctx.moveTo(X(r.x1), Z(r.z1));
      ctx.lineTo(X(r.x2), Z(r.z2));
      ctx.stroke();
    }

    const marker = game.missions && game.missions.currentMarker;
    if (marker) {
      const pr = 5 + Math.sin(now * 5) * 2;
      ctx.fillStyle = '#39ff88';
      ctx.beginPath();
      ctx.arc(X(marker.x), Z(marker.z), pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(57,255,136,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(marker.x), Z(marker.z), pr + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hero car (gold dot).
    const hero = game.heroCar && game.heroCar.group && game.heroCar.group.position;
    if (hero) {
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(X(hero.x), Z(hero.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police (blue/red dots).
    const police = game.police;
    if (police && police.units) {
      for (let i = 0; i < police.units.length; i++) {
        const u = police.units[i];
        const p = u.group ? u.group.position : u.position;
        if (!p) continue;
        ctx.fillStyle = i % 2 === 0 ? '#3388ff' : '#ff4444';
        ctx.beginPath();
        ctx.arc(X(p.x), Z(p.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player arrow (yellow).
    const pp = game.playerPos || (game.player && game.player.group && game.player.group.position);
    if (pp) {
      const heading = (game.player && game.player.heading) || 0;
      ctx.save();
      ctx.translate(X(pp.x), Z(pp.z));
      // Heading 0 faces +z (down on the map); tip (0,-7) rotated by
      // PI - heading points along (sin h, cos h) on the canvas.
      ctx.rotate(Math.PI - heading);
      ctx.fillStyle = '#ffe14d';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- Messages ----------
  function showMessage(text, dur = 4) {
    if (!text) return;
    const n = el('div', 'hud-message', text);
    n.style.cssText = 'background:rgba(0,0,0,.6);border-radius:6px;padding:8px 14px;font-size:14px;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.8);max-width:640px;';
    feed.appendChild(n);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    const ms = Math.max(1000, (dur || 4) * 1000);
    window.setTimeout(() => {
      if (n.parentNode === feed) feed.removeChild(n);
    }, ms);
  }

  function showObjective(text) {
    if (text !== undefined && text !== null) missionObj.textContent = text;
  }

  // ---------- Menu ----------
  function buildMenu() {
    menuRoot.innerHTML = '';
    menuRoot.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;z-index:20;background:linear-gradient(180deg,rgba(4,24,38,.82),rgba(4,24,38,.55));font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';
    const title = el('h1', 'menu-title', 'SOLHAVEN');
    title.style.cssText = 'font-size:64px;letter-spacing:10px;margin:0;color:#ffe14d;text-shadow:0 4px 24px rgba(0,0,0,.8);';
    const sub = el('p', 'menu-blurb', 'Kota pantai low-poly yang cerah, satu pengemudi baru, dan bos yang hanya menyebut dirinya Madame Sol. Ambil job-nya, hindari kejaran polisi, dan selesaikan skor terakhir.');
    sub.style.cssText = 'max-width:520px;font-size:16px;line-height:1.5;margin:12px 0 20px;opacity:.95;';
    const controls = el('div', 'menu-controls');
    controls.style.cssText = 'font-size:14px;line-height:1.9;background:rgba(0,0,0,.4);border-radius:8px;padding:12px 22px;margin-bottom:22px;';
    controls.innerHTML = 'WASD / Panah — nyetir &amp; jalan<br>E — masuk / keluar mobil &nbsp;·&nbsp; Space — handbrake<br>P — pause &nbsp;·&nbsp; M — mute';
    const startBtn = el('button', 'menu-start', 'MULAI');
    startBtn.style.cssText = 'pointer-events:auto;cursor:pointer;font-size:20px;font-weight:700;padding:12px 44px;border:none;border-radius:8px;background:#ffe14d;color:#10202e;box-shadow:0 4px 18px rgba(0,0,0,.5);';
    startBtn.addEventListener('click', () => {
      try { if (game.audio && game.audio.resume) game.audio.resume(); } catch (e) { /* ignore */ }
      try { if (game.audio && game.audio.click) game.audio.click(); } catch (e) { /* ignore */ }
      if (typeof game.startGame === 'function') game.startGame();
    });
    menuRoot.appendChild(title);
    menuRoot.appendChild(sub);
    menuRoot.appendChild(controls);
    menuRoot.appendChild(startBtn);
    // Continue button only when a save exists.
    let saved = null;
    try { saved = loadProgress(); } catch (e) { saved = null; }
    if (saved) {
      const contBtn = el('button', 'menu-continue', `Lanjut — Misi ${(saved.missionIndex ?? 0) + 1}`);
      contBtn.style.cssText = 'pointer-events:auto;cursor:pointer;font-size:16px;font-weight:600;padding:10px 30px;border:1px solid rgba(255,255,255,.6);border-radius:8px;background:transparent;color:#fff;margin-top:12px;';
      contBtn.addEventListener('click', () => {
        try { if (game.audio && game.audio.resume) game.audio.resume(); } catch (e) { /* ignore */ }
        // Start first (it resets the chain to mission 0), then jump to the
        // saved mission — the reverse order would be wiped by startGame().
        if (typeof game.startGame === 'function') game.startGame();
        if (game.loadSave) {
          try { game.loadSave(saved); } catch (e) { /* ignore */ }
        }
      });
      menuRoot.appendChild(contBtn);
    }
  }

  function setMenu(mode) {
    // mode: 'menu' shows the start screen; anything else hides it and
    // shows the in-game HUD.
    if (mode === 'menu' || mode === 'show' || mode === true) {
      buildMenu();
      menuRoot.style.display = 'flex';
      hudRoot.style.display = 'none';
      endRoot.style.display = 'none';
    } else {
      menuRoot.style.display = 'none';
      hudRoot.style.display = 'block';
      endRoot.style.display = 'none';
    }
  }

  // ---------- End screen ----------
  function setEnd(kind, stats) {
    const s = stats || {};
    endRoot.innerHTML = '';
    endRoot.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;z-index:20;background:rgba(4,24,38,.82);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';
    const isWin = kind === 'win' || kind === 'won' || kind === 'complete';
    let titleText = 'SOLHAVEN COMPLETE';
    if (!isWin) {
      const reason = String(s.reason || kind || '').toLowerCase();
      titleText = reason.includes('bust') ? 'BUSTED' : 'WASTED';
    }
    const title = el('h1', 'end-title', titleText);
    title.style.cssText = `font-size:56px;letter-spacing:8px;margin:0;color:${isWin ? '#7dffb0' : '#ff5a5a'};text-shadow:0 4px 24px rgba(0,0,0,.8);`;
    const lines = [];
    if (s.time !== undefined && s.time !== null) lines.push(`Time: ${fmtTime(s.time)}`);
    else if (s.bestTime !== undefined) lines.push(`Best time: ${fmtTime(s.bestTime)}`);
    const missionsDone = s.missions ?? s.missionIndex ?? (game.missions ? game.missions.current : null);
    if (missionsDone !== undefined && missionsDone !== null) lines.push(`Missions: ${missionsDone} / 6`);
    if (!isWin && (s.reason || kind)) lines.push(`Reason: ${s.reason || kind}`);
    if (!isWin && s.reason) { /* reason already listed above */ }
    const detail = el('p', 'end-stats', lines.join('  ·  ') || (isWin ? 'Every job done. Madame Sol is pleased.' : 'Solhaven was faster this time.'));
    detail.style.cssText = 'font-size:16px;margin:16px 0 24px;opacity:.95;';
    const againBtn = el('button', 'end-again', 'Main Lagi');
    againBtn.style.cssText = 'pointer-events:auto;cursor:pointer;font-size:20px;font-weight:700;padding:12px 44px;border:none;border-radius:8px;background:#ffe14d;color:#10202e;box-shadow:0 4px 18px rgba(0,0,0,.5);';
    againBtn.addEventListener('click', () => {
      try { if (game.audio && game.audio.click) game.audio.click(); } catch (e) { /* ignore */ }
      endRoot.style.display = 'none';
      if (typeof game.startGame === 'function') game.startGame();
    });
    endRoot.appendChild(title);
    endRoot.appendChild(detail);
    endRoot.appendChild(againBtn);
    endRoot.style.display = 'flex';
    hudRoot.style.display = 'none';
    menuRoot.style.display = 'none';
  }

  // ---------- Per-frame update ----------
  function update(dt) {
    if (!game.state) return;
    if (dt <= 0) dt = 0.016;
    pulseT += dt;
    const st = game.state;

    // Wanted stars.
    const wanted = Math.max(0, Math.min(5, st.wanted || 0));
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '☆';
    wantedStars.textContent = stars;
    wantedStars.style.color = wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,.55)';

    // Speed + mode.
    const speedMs = Math.abs(st.speed || 0);
    speedNum.textContent = String(Math.round(speedMs * 3.6));
    speedUnit.textContent = `km/h · ${st.inCar ? 'Driving' : 'On foot'}`;

    // Mission panel.
    const missions = game.missions;
    if (missions && missions.list && missions.list[missions.current]) {
      const m = missions.list[missions.current];
      missionName.textContent = `${missions.current + 1}. ${m.name}`;
      missionObj.textContent = m.objective || '';
      const parts = [];
      const marker = missions.currentMarker;
      const pp = game.playerPos || (game.player && game.player.group && game.player.group.position);
      if (marker && pp) {
        parts.push(`${Math.round(Math.hypot(marker.x - pp.x, marker.z - pp.z))} m`);
      }
      const tl = missions.timeLeft ?? m.timeLeft;
      if (m.timeLimit && tl !== null && tl !== undefined) parts.push(`⏱ ${fmtTime(tl)}`);
      missionMeta.textContent = parts.join('  ·  ');
      missionBox.style.display = 'block';
    } else {
      missionBox.style.display = 'none';
    }

    // Minimap at ~10 fps.
    mapTimer += dt;
    if (mapTimer >= 0.1) {
      mapTimer = 0;
      try { drawMinimap(pulseT); } catch (e) { /* minimap must never break the HUD */ }
    }
  }

  // Start on the menu; boot calls setMenu / startGame to switch.
  buildMenu();

  return {
    root: hudRoot,
    update,
    showMessage,
    showObjective,
    setMenu,
    setEnd,
  };
}
