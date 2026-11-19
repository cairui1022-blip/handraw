const DEFAULT_IDS = new Set(['SC-016', 'FA-003', 'C-26']);
const SLOTS = ['layout', 'style', 'color'];
const itemId = item => item ? (item.id || item.number || null) : null;
const fileFor = item => {
  const id = itemId(item);
  if (DEFAULT_IDS.has(id)) return 'references/defaults.json';
  return item?.reference_file || null;
};

export function createReferenceLoader({fetchImpl = fetch, onUpdate = () => {}, loadingHintMs = 3000, timeoutMs = 15000} = {}) {
  let disposed = false;
  const batches = new Map();
  const slots = {};
  for (const slot of SLOTS) slots[slot] = {item: null, id: null, visible: false, requestId: 0, status: 'idle', slowTimer: null, timeoutTimer: null};

  function emit(slot, status, src = null, slow = false) {
    if (disposed) return;
    onUpdate({slot, id: slots[slot].id, status, src, slow});
  }
  function clearTimers(state) {
    clearTimeout(state.slowTimer);
    clearTimeout(state.timeoutTimer);
    state.slowTimer = null;
    state.timeoutTimer = null;
  }
  function batch(file, force = false) {
    const existing = batches.get(file);
    if (existing && !force) return existing.promise;
    const generation = existing ? existing.generation + 1 : 1;
    const controller = new AbortController();
    const promise = (async () => {
      const response = await fetchImpl(file, {signal: controller.signal});
      if (!response || response.ok !== true) throw new Error('reference unavailable');
      const data = await response.json();
      const current = batches.get(file);
      if (current && current.generation === generation) {
        current.data = data;
        current.promise = Promise.resolve(data);
        current.controller = null;
      }
      return data;
    })().catch(error => {
      const current = batches.get(file);
      if (current && current.generation === generation) batches.delete(file);
      throw error;
    });
    batches.set(file, {generation, promise, controller, data: null});
    return promise;
  }
  function load(slot) {
    const state = slots[slot];
    clearTimers(state);
    if (disposed || !state.visible || !state.item) {
      state.status = 'idle';
      emit(slot, 'idle');
      return;
    }
    const id = itemId(state.item);
    const file = fileFor(state.item);
    if (!id || !file) {
      state.status = 'idle';
      emit(slot, 'idle');
      return;
    }
    const requestId = ++state.requestId;
    state.status = 'loading';
    emit(slot, 'loading', null, false);
    state.slowTimer = setTimeout(() => {
      if (!disposed && state.requestId === requestId && state.visible && state.status === 'loading') emit(slot, 'loading', null, true);
    }, loadingHintMs);
    state.timeoutTimer = setTimeout(() => {
      if (!disposed && state.requestId === requestId && state.visible && state.status === 'loading') {
        clearTimers(state);
        state.status = 'error';
        emit(slot, 'error');
      }
    }, timeoutMs);
    batch(file).then(data => {
      if (disposed || state.requestId !== requestId) return;
      const entry = data?.[id];
      if (!entry || typeof entry.src !== 'string' || !entry.src.startsWith('data:image/webp;base64,')) throw new Error('missing reference');
      if (!state.visible || state.status !== 'loading') return;
      clearTimers(state);
      state.status = 'ready';
      emit(slot, 'ready', entry.src, false);
    }).catch(() => {
      if (disposed || state.requestId !== requestId) return;
      if (!state.visible || state.status !== 'loading') return;
      clearTimers(state);
      state.status = 'error';
      emit(slot, 'error');
    });
  }
  function setSelection(slot, item) {
    const state = slots[slot];
    if (!state) return;
    const id = itemId(item);
    if (state.item && id && state.id === id && (state.status === 'ready' || state.status === 'loading')) {
      state.item = item;
      return;
    }
    state.item = item || null;
    state.id = id;
    state.requestId += 1;
    clearTimers(state);
    if (!state.visible || !state.item) {
      state.status = 'idle';
      emit(slot, 'idle');
      return;
    }
    load(slot);
  }
  function setVisible(slot, visible) {
    const state = slots[slot];
    if (!state) return;
    state.visible = Boolean(visible);
    state.requestId += 1;
    clearTimers(state);
    if (!state.visible) {
      state.status = 'idle';
      emit(slot, 'idle');
      return;
    }
    if (state.item) load(slot);
    else {
      state.status = 'idle';
      emit(slot, 'idle');
    }
  }
  function retry(slot) {
    const state = slots[slot];
    if (!state || !state.visible || !state.item) return;
    state.requestId += 1;
    clearTimers(state);
    state.status = 'idle';
    batch(fileFor(state.item), true);
    load(slot);
  }
  function dispose() {
    disposed = true;
    for (const slot of SLOTS) clearTimers(slots[slot]);
    for (const entry of batches.values()) entry.controller?.abort();
    batches.clear();
  }
  return {setSelection, setVisible, retry, dispose};
}
