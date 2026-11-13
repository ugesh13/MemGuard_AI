// In-memory application state. NOTHING here is written to localStorage, sessionStorage,
// cookies or IndexedDB. Refreshing the page clears it, by design.
const listeners = new Set();

export const state = {
  config: null,            // public runtime config from /api/config
  session: null,           // { token, user: {id,email}, role, provider, guest, expiresAt }
  runs: {},                // runId -> analyzed audit result (in memory only)
  runOrder: [],            // run ids, newest first
  activeRunId: null,
  garak: null,             // parsed garak report summary (aggregates only)
  shield: null,            // in-memory Shield index (hashes only)
  shieldLog: [],           // { action, reasons, at } counts for this session
  online: navigator.onLine,
};

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function addRun(result) {
  state.runs[result.id] = result;
  state.runOrder = [result.id, ...state.runOrder.filter((x) => x !== result.id)];
  state.activeRunId = result.id;
  setState({});
}

export function activeRun() {
  return state.activeRunId ? state.runs[state.activeRunId] : null;
}

// Wipe every piece of audit content held in this tab.
export function clearSessionData() {
  const counts = { runs: state.runOrder.length, shield: state.shield ? 1 : 0, garak: state.garak ? 1 : 0 };
  state.runs = {};
  state.runOrder = [];
  state.activeRunId = null;
  state.garak = null;
  state.shield = null;
  state.shieldLog = [];
  setState({});
  return counts;
}
