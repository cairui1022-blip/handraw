const SLOTS = ['layout', 'style', 'color'];
const itemId = item => item ? (item.id || item.number || null) : null;
const fileFor = item => {
  const id = itemId(item);
  return id ? `references/img/${id}.webp` : null;
};
const isWebp = bytes => bytes.length >= 12
  && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

export function createReferenceLoader({fetchImpl = fetch, onUpdate = () => {}, loadingHintMs = 3000, timeoutMs = 15000} = {}) {
  let disposed = false;
  const files = new Map();
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
  function acquire(file, force = false) {
    const existing = files.get(file);
    if (existing && !force) return existing.promise;
    const generation = existing ? existing.generation + 1 : 1;
    const previousUrl = existing ? existing.url : null;
    const controller = new AbortController();
    const entry = {generation, promise: null, controller, url: previousUrl};
    const promise = (async () => {
      const response = await fetchImpl(file, {signal: controller.signal});
      if (!response || response.ok !== true) throw new Error('reference unavailable');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!isWebp(bytes)) throw new Error('invalid reference image');
      const url = URL.createObjectURL(new Blob([bytes], {type: 'image/webp'}));
      const current = files.get(file);
      if (current && current.generation === generation) {
        current.url = url;
        current.controller = null;
        current.promise = Promise.resolve(url);
        if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl);
      } else {
        URL.revokeObjectURL(url);
      }
      return url;
    })().catch(error => {
      const current = files.get(file);
      if (current && current.generation === generation) {
        if (current.url) URL.revokeObjectURL(current.url);
        files.delete(file);
      }
      throw error;
    });
    entry.promise = promise;
    files.set(file, entry);
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
    acquire(file).then(url => {
      if (disposed || state.requestId !== requestId) return;
      if (!state.visible || state.status !== 'loading') return;
      clearTimers(state);
      state.status = 'ready';
      emit(slot, 'ready', url, false);
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
    acquire(fileFor(state.item), true);
    load(slot);
  }
  function dispose() {
    disposed = true;
    for (const slot of SLOTS) clearTimers(slots[slot]);
    for (const entry of files.values()) {
      entry.controller?.abort();
      if (entry.url) URL.revokeObjectURL(entry.url);
    }
    files.clear();
  }
  return {setSelection, setVisible, retry, dispose};
}
