// SOLHAVEN save — localStorage, key 'solhaven-save-v1', JSON.
// Any failure (no storage, bad JSON, private mode) fails silently:
// saveProgress returns false, loadProgress returns null.

export const SAVE_KEY = 'solhaven-save-v1';

export function saveProgress(progress) {
  try {
    if (typeof localStorage === 'undefined') return false;
    const data = {
      missionIndex: progress?.missionIndex ?? 0,
      wins: progress?.wins ?? 0,
      bestTime: progress?.bestTime ?? null,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadProgress() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      wins: typeof data.wins === 'number' ? data.wins : 0,
      bestTime: typeof data.bestTime === 'number' ? data.bestTime : null,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : null,
    };
  } catch (e) {
    return null;
  }
}

// Write a save from the live game object (called by boot on win/lose).
export function saveGame(game) {
  try {
    const st = game?.state || {};
    const prev = loadProgress();
    const wins = (prev?.wins ?? 0) + (st.mode === 'won' ? 1 : 0);
    const bestTime = st.mode === 'won'
      ? (prev?.bestTime == null ? st.time : Math.min(prev.bestTime, st.time))
      : (prev?.bestTime ?? null);
    return saveProgress({
      missionIndex: st.missionIndex ?? 0,
      wins,
      bestTime,
    });
  } catch (e) {
    return false;
  }
}

// Read a save into the live game object (called by boot's game.loadSave
// through the HUD Continue button, after the game has started).
export function loadSave(game, saved) {
  const data = saved || loadProgress();
  if (!data) return false;
  if (game?.missions && typeof game.missions.jumpTo === 'function') {
    game.missions.jumpTo(data.missionIndex ?? 0);
    return true;
  }
  return false;
}
