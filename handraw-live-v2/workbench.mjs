import {compilePrompt} from './prompt-core.mjs';
import {createWorkflow, transition, validateCurrentContent, effectiveInput, canVisit} from './workflow-state.mjs';
import {createReferenceLoader} from './reference-loader.mjs';

const $ = id => document.getElementById(id);
const SPECIAL_LAYOUTS = ['SC-021', 'SC-022', 'SC-023'];
const PANEL_FOR_FIELD = {layout: 'layout', style: 'style', 'color-primary': 'color', 'color-accent-1': 'advanced', 'color-accent-2': 'advanced', ratio: 'advanced', 'split-type': 'advanced'};
let catalog = null;
let workflow = createWorkflow();
const refState = {
  layout: {id: null, status: 'idle', src: null, slow: false},
  style: {id: null, status: 'idle', src: null, slow: false},
  color: {id: null, status: 'idle', src: null, slow: false}
};
const refVisible = {layout: false, style: false, color: false};
const loader = createReferenceLoader({
  fetchImpl: (file, options) => fetch(new URL(file, import.meta.url), options),
  onUpdate: update => {
    refState[update.slot] = {id: update.id, status: update.status, src: update.src, slow: update.slow};
    renderReference(update.slot);
    updateGuideDownloads();
  }
});

let blobUrl = null;
let lastExportRevision = null;

function setValue(id, value) {
  const el = $(id);
  if (el && document.activeElement !== el) el.value = value;
}
function setAlwaysValue(id, value) {
  const el = $(id);
  if (el) el.value = value;
}
function setRadios(name, value) {
  for (const radio of document.querySelectorAll(`input[name="${name}"]`)) radio.checked = radio.value === value;
}
function linkEnabled(link, enabled) {
  if (!link) return;
  link.setAttribute('aria-disabled', String(!enabled));
  if (!enabled) link.removeAttribute('href');
}
function setPanel(buttonId, panelId, open) {
  const panel = $(panelId);
  const button = $(buttonId);
  if (panel) panel.hidden = !open;
  if (button) button.setAttribute('aria-expanded', String(open));
}
function isSignature(form) {
  return form.kind === 'social-card' && form.socialForm === 'signature';
}
function isFixedRatio(form) {
  return form.layout === 'SC-022' || form.layout === 'SC-023';
}
function layoutAvailable(form, option) {
  if (form.kind === 'pure-image') return false;
  if (form.kind === 'social-card') {
    if (form.socialForm === 'standard') return option.dataset.category === 'social-card' && !SPECIAL_LAYOUTS.includes(option.value);
    return option.value === form.layout;
  }
  return option.dataset.category === form.kind;
}
function renderLayoutOptions(form) {
  const select = $('layout');
  for (const option of select.options) {
    const available = layoutAvailable(form, option);
    option.hidden = !available;
    option.disabled = !available;
  }
  for (const group of select.querySelectorAll('optgroup')) group.hidden = ![...group.children].some(option => !option.hidden);
}
function renderErrors(w) {
  for (const node of document.querySelectorAll('[data-error]')) node.hidden = !(w.error && node.id === 'error-' + w.error.code);
}
function renderWorkflow(w) {
  const form = w.form;
  const eff = effectiveInput(form);
  const signature = isSignature(form);
  const fixed = isFixedRatio(form);
  const pure = form.kind === 'pure-image';
  const layoutLocked = pure || (form.kind === 'social-card' && form.socialForm !== 'standard');
  document.body.dataset.catalogStatus = w.catalogStatus;
  $('catalog-loading').hidden = w.catalogStatus !== 'loading';
  $('catalog-error').hidden = w.catalogStatus !== 'error';
  renderErrors(w);

  for (const stage of ['purpose', 'content', 'visual', 'result']) $(stage + '-panel').hidden = w.stage !== stage;
  for (const button of document.querySelectorAll('.step')) {
    const stage = button.dataset.stage;
    button.disabled = !canVisit(w, stage);
    button.classList.toggle('active', w.stage === stage);
    if (w.stage === stage) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }

  setRadios('kind', form.kind);
  $('purpose-forms-toggle').hidden = form.kind !== 'social-card';
  setPanel('purpose-forms-toggle', 'social-form', form.kind === 'social-card' && w.panels.purposeForms);
  setRadios('social-form', form.socialForm);

  $('topic-fields').hidden = signature;
  $('signature-fields').hidden = !signature;
  $('photo-split-note').hidden = !(form.kind === 'social-card' && form.socialForm === 'photo-split');
  $('ecommerce-note').hidden = form.kind !== 'ecommerce';
  $('pure-image-note').hidden = !pure;
  setValue('topic', form.topic);
  setValue('name', form.name);
  setValue('pinyin', form.pinyin);
  $('continue-content').disabled = w.catalogStatus !== 'ready';

  renderLayoutOptions(form);
  $('layout-card').hidden = pure;
  $('change-layout').disabled = layoutLocked;
  setValue('layout', form.layout);
  setValue('style', form.style);
  setValue('color-primary', form.colors[0] || 'C-26');
  setValue('color-accent-1', form.colors[1] || '');
  setValue('color-accent-2', form.colors[2] || '');
  setValue('ratio', eff.ratio);
  $('ratio').disabled = fixed;
  $('fixed-ratio-help').hidden = !fixed;
  $('split-fields').hidden = form.layout !== 'SC-021';
  setValue('split-type', form.splitType);

  const layoutItem = catalog?.layouts.find(item => item.id === form.layout);
  const styleItem = catalog?.styles.find(item => item.number === form.style);
  const colorItem = catalog?.colors.find(item => item.id === form.colors[0]);
  setAlwaysValue('summary-layout', pure ? '无版式（纯画面）' : layoutItem ? `${layoutItem.id} · ${layoutItem.name}` : form.layout);
  setAlwaysValue('summary-style', styleItem ? `${styleItem.number} · ${styleItem.reference}` : form.style);
  setAlwaysValue('summary-color', colorItem ? `${colorItem.id} · ${colorItem.name_zh}` : form.colors[0]);
  const accentCount = form.colors.slice(1).filter(Boolean).length;
  const ratioText = eff.ratio ? `${fixed ? '固定' : '指定'} ${eff.ratio}` : '模板默认';
  const splitText = form.layout === 'SC-021' ? ` · 玩法 ${form.splitType}` : '';
  setAlwaysValue('advanced-summary', `点缀色 ${accentCount} 个 · 比例 ${ratioText}${splitText}`);

  setPanel('change-layout', 'layout-panel', w.panels.layout && !layoutLocked);
  setPanel('change-style', 'style-panel', w.panels.style);
  setPanel('change-color', 'color-panel', w.panels.color);
  setPanel('advanced-toggle', 'advanced-panel', w.panels.advanced);
  setPanel('color-reference-toggle', 'color-reference', w.panels.colorReference);
  setPanel('help-toggle', 'help-panel', w.panels.help);
  setPanel('use-guide-toggle', 'use-guide', w.panels.useGuide);
  $('generate').disabled = w.catalogStatus !== 'ready' || !validateCurrentContent(form).ok;

  $('result-dirty').hidden = w.resultStatus !== 'dirty';
  $('result-ready').hidden = w.resultStatus !== 'ready';
  setAlwaysValue('output', w.output);
  $('copy').disabled = w.resultStatus !== 'ready' || w.copyStatus === 'copying';
  updateExportLinks(w);
  $('copying').hidden = w.copyStatus !== 'copying';
  $('copy-ok').hidden = w.copyStatus !== 'success';
  $('copy-manual').hidden = w.copyStatus !== 'manual';
  $('guide-photo-note').hidden = form.layout !== 'SC-021';
  syncReferences();
  updateGuideDownloads();
}
function currentSlotId(slot) {
  const form = workflow.form;
  if (slot === 'layout') return form.kind === 'pure-image' ? null : form.layout;
  if (slot === 'style') return form.style;
  return form.colors[0] || 'C-26';
}
function slotItem(slot) {
  if (!catalog) return null;
  const id = currentSlotId(slot);
  if (!id) return null;
  if (slot === 'layout') return catalog.layouts.find(item => item.id === id) || null;
  if (slot === 'style') return catalog.styles.find(item => item.number === id) || null;
  return catalog.colors.find(item => item.id === id) || null;
}
function syncReferences() {
  const stage = workflow.stage;
  const pure = workflow.form.kind === 'pure-image';
  const guideOpen = stage === 'result' && workflow.panels.useGuide;
  const desired = {
    layout: (stage === 'visual' || guideOpen) && !pure,
    style: stage === 'visual' || guideOpen,
    color: (stage === 'visual' && workflow.panels.colorReference) || guideOpen
  };
  for (const slot of ['layout', 'style', 'color']) {
    loader.setSelection(slot, slotItem(slot));
    if (refVisible[slot] !== desired[slot]) {
      refVisible[slot] = desired[slot];
      loader.setVisible(slot, desired[slot]);
    }
    renderReference(slot);
  }
}
function renderReference(slot) {
  const state = refState[slot];
  const id = currentSlotId(slot);
  const img = $(slot + '-preview');
  const loading = $(slot + '-image-loading');
  const error = $(slot + '-image-error');
  const retry = $('retry-' + slot);
  const download = $('download-' + slot);
  const ready = state.status === 'ready' && state.src && state.id === id;
  if (ready) {
    img.src = state.src;
    img.alt = `${state.id} · 上游参考，非本次成图`;
    img.dataset.referenceId = state.id;
    img.hidden = false;
    loading.hidden = true;
    error.hidden = true;
    retry.hidden = true;
    download.href = state.src;
    download.setAttribute('download', state.id + '.webp');
    download.setAttribute('aria-disabled', 'false');
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    delete img.dataset.referenceId;
    loading.hidden = state.status !== 'loading';
    error.hidden = state.status !== 'error';
    retry.hidden = state.status !== 'error';
    download.removeAttribute('href');
    download.setAttribute('aria-disabled', 'true');
  }
}
function updateGuideDownloads() {
  for (const slot of ['layout', 'style', 'color']) {
    const link = $('guide-download-' + slot);
    link.hidden = slot === 'layout' && workflow.form.kind === 'pure-image';
    const state = refState[slot];
    const id = currentSlotId(slot);
    const enabled = workflow.resultStatus === 'ready' && state.status === 'ready' && state.src && state.id === id && (slot !== 'layout' || workflow.form.kind !== 'pure-image');
    if (enabled) {
      link.href = state.src;
      link.setAttribute('download', id + '.webp');
      link.setAttribute('aria-disabled', 'false');
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
    }
  }
}
function filterStyles() {
  const query = $('style-search').value.trim().toLowerCase();
  let matches = 0;
  const select = $('style');
  for (const option of select.options) {
    const match = (option.dataset.search || '').toLowerCase().includes(query);
    option.hidden = !match;
    option.disabled = !match;
    if (match) matches += 1;
  }
  for (const group of select.querySelectorAll('optgroup')) group.hidden = [...group.children].every(option => option.hidden);
  $('search-empty').hidden = matches > 0;
}
function updateExportLinks(w) {
  const link = $('download-prompt');
  const ready = w.resultStatus === 'ready';
  if (ready) {
    if (w.generatedRevision !== lastExportRevision || !blobUrl) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(new Blob([w.output], {type: 'text/plain;charset=utf-8'}));
      lastExportRevision = w.generatedRevision;
    }
    link.href = blobUrl;
    link.setAttribute('download', '手绘提示词.txt');
    link.setAttribute('aria-disabled', 'false');
  } else {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
    lastExportRevision = null;
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
  }
  updateGuideDownloads();
}
function generateCurrent() {
  if (!catalog || workflow.catalogStatus !== 'ready') {
    dispatch({type: 'GENERATION_FAILED', code: 'catalog'});
    return;
  }
  const revision = workflow.inputRevision;
  try {
    const text = compilePrompt(effectiveInput(workflow.form), catalog);
    dispatch({type: 'GENERATED', text, revision});
  } catch (error) {
    dispatch({type: 'GENERATION_FAILED', code: error.code || 'generic'});
  }
}
async function copyCurrent() {
  if (workflow.resultStatus !== 'ready' || workflow.copyStatus === 'copying') return;
  const revision = workflow.inputRevision;
  const text = workflow.output;
  dispatch({type: 'COPY_START', revision});
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    dispatch({type: 'COPY_RESULT', status: 'success', revision});
  } catch {
    dispatch({type: 'COPY_RESULT', status: 'manual', revision});
    if (workflow.resultStatus === 'ready' && workflow.inputRevision === revision) {
      const output = $('output');
      output.focus();
      output.select();
    }
  }
}
function focusError(error) {
  if (!error || !error.field) return;
  if (error.field === 'kind') {
    const first = document.querySelector('input[name="kind"]');
    if (first) first.focus();
    return;
  }
  const panel = PANEL_FOR_FIELD[error.field];
  if (panel && !workflow.panels[panel]) dispatch({type: 'TOGGLE', panel});
  const el = $(error.field);
  if (el && !el.closest('[hidden]')) el.focus();
}
function dispatch(action) {
  const prev = workflow;
  workflow = transition(workflow, action);
  renderWorkflow(workflow);
  if (workflow.stage !== prev.stage) {
    const title = $(workflow.stage + '-title');
    if (title) title.focus();
  }
  if (workflow.error && (!prev.error || workflow.error.code !== prev.error.code || workflow.error.field !== prev.error.field)) focusError(workflow.error);
}
export async function loadCatalog() {
  dispatch({type: 'SET_CATALOG', status: 'loading'});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(new URL('./catalog.json', import.meta.url), {signal: controller.signal});
    if (!response.ok) throw new Error('catalog unavailable');
    const data = await response.json();
    if (data.layouts?.length !== 170 || data.styles?.length !== 370 || data.colors?.length !== 36) throw new Error('catalog incomplete');
    catalog = data;
    dispatch({type: 'SET_CATALOG', status: 'ready'});
    return data;
  } catch {
    catalog = null;
    dispatch({type: 'SET_CATALOG', status: 'error'});
    return null;
  } finally {
    clearTimeout(timer);
  }
}

for (const radio of document.querySelectorAll('input[name="kind"]')) radio.addEventListener('change', () => { if (radio.checked) dispatch({type: 'SELECT_KIND', kind: radio.value}); });
for (const radio of document.querySelectorAll('input[name="social-form"]')) radio.addEventListener('change', () => { if (radio.checked) dispatch({type: 'SELECT_SOCIAL_FORM', socialForm: radio.value}); });
for (const id of ['topic', 'name', 'pinyin']) $(id).addEventListener('input', event => dispatch({type: 'EDIT', field: id, value: event.target.value}));
$('layout').addEventListener('change', event => dispatch({type: 'EDIT', field: 'layout', value: event.target.value}));
$('style').addEventListener('change', event => dispatch({type: 'EDIT', field: 'style', value: event.target.value}));
for (const id of ['color-primary', 'color-accent-1', 'color-accent-2']) $(id).addEventListener('change', () => dispatch({type: 'EDIT', field: 'colors', value: [$('color-primary').value, $('color-accent-1').value, $('color-accent-2').value]}));
$('ratio').addEventListener('change', event => dispatch({type: 'EDIT', field: 'requestedRatio', value: event.target.value}));
$('split-type').addEventListener('change', event => dispatch({type: 'EDIT', field: 'splitType', value: event.target.value}));
$('style-search').addEventListener('input', filterStyles);
$('restore-advanced').addEventListener('click', () => dispatch({type: 'RESET_ADVANCED'}));
for (const slot of ['layout', 'style', 'color']) $('retry-' + slot).addEventListener('click', () => loader.retry(slot));
$('generate').addEventListener('click', generateCurrent);
$('copy').addEventListener('click', () => { copyCurrent(); });
$('continue-purpose').addEventListener('click', () => dispatch({type: 'CONTINUE'}));
$('continue-content').addEventListener('click', () => dispatch({type: 'CONTINUE'}));
for (const button of document.querySelectorAll('.step')) button.addEventListener('click', () => dispatch({type: 'NAVIGATE', stage: button.dataset.stage}));
for (const button of document.querySelectorAll('[data-panel]')) button.addEventListener('click', () => { if (!button.disabled) dispatch({type: 'TOGGLE', panel: button.dataset.panel}); });
$('retry-catalog').addEventListener('click', () => { loadCatalog(); });
$('reset').addEventListener('click', () => {
  const dialog = $('reset-dialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
});
$('reset-cancel').addEventListener('click', () => {
  const dialog = $('reset-dialog');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
});
$('reset-confirm').addEventListener('click', () => {
  const dialog = $('reset-dialog');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  dispatch({type: 'RESET'});
});
for (const link of document.querySelectorAll('a[aria-disabled]')) link.addEventListener('click', event => { if (link.getAttribute('aria-disabled') === 'true') event.preventDefault(); });

renderWorkflow(workflow);
loadCatalog();
