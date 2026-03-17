/* ═══════════════════════════════════════════════════════════════════════════════
   OpenCroc Studio 3D — State Manager
   Simple reactive state management
   ═══════════════════════════════════════════════════════════════════════════════ */

export class StateManager {
  constructor() {
    this._state = {};
    this._listeners = new Map();
  }

  /** Set one or more state properties */
  set(partial) {
    Object.assign(this._state, partial);
    for (const key of Object.keys(partial)) {
      const cbs = this._listeners.get(key);
      if (cbs) cbs.forEach(cb => cb(partial[key], this._state));
    }
  }

  /** Get a single state property */
  get(key) {
    return this._state[key];
  }

  /** Get full state snapshot */
  getAll() {
    return this._state;
  }

  /** Subscribe to changes on a specific key */
  on(key, cb) {
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());
    this._listeners.get(key).add(cb);
    return () => this._listeners.get(key)?.delete(cb);
  }
}
