export const KINDS = ['social-card', 'infographic', 'comic-storyboard', 'ip-character', 'ecommerce', 'pure-image'];
export const SOCIAL_FORMS = ['standard', 'signature', 'photo-split', 'knowledge-cover'];
export const STAGES = ['purpose', 'content', 'visual', 'result'];
export const RATIOS = ['', '1:1', '3:4', '4:5', '2:3', '9:16', '16:9', '4:3', '3:2', '5:2', '21:9', '2.35:1'];
export const DEFAULT_LAYOUT = {'social-card': 'SC-016', 'infographic': 'IG-001', 'comic-storyboard': 'SB-002', 'ip-character': 'IP-001', 'ecommerce': 'EC-001'};
const SPECIAL_LAYOUT = {signature: 'SC-022', 'photo-split': 'SC-021', 'knowledge-cover': 'SC-023'};
const ASSET_ID = /\b(?:SC|IG|SB|IP|EC|FA|FB|FC|FD|FE|FF|FG|FH|FI)-\d{3}\b|\bC-\d{2}\b|#\d+/;
const PANEL_KEYS = ['purposeForms', 'layout', 'style', 'color', 'advanced', 'colorReference', 'help', 'useGuide', 'stepNav'];
const EDIT_FIELDS = ['topic', 'name', 'pinyin', 'layout', 'style', 'colors', 'requestedRatio', 'splitType'];

export function createForm() {
  return {kind: '', socialForm: 'standard', topic: '', name: '', pinyin: '', layout: '', style: 'FA-003', colors: ['C-26', '', ''], requestedRatio: '', splitType: '01'};
}
export function createWorkflow() {
  const panels = {};
  for (const key of PANEL_KEYS) panels[key] = false;
  return {stage: 'purpose', form: createForm(), catalogStatus: 'loading', resultStatus: 'empty', inputRevision: 0, generatedRevision: null, output: '', copyStatus: 'idle', copyRevision: null, panels, error: null};
}
const isSignature = form => form.kind === 'social-card' && form.socialForm === 'signature';
export function effectiveInput(form) {
  const layout = form.kind === 'pure-image' ? '' : form.layout;
  const signature = isSignature(form);
  return {
    kind: form.kind,
    layout,
    style: form.style,
    colors: form.colors.filter(Boolean),
    topic: signature ? '' : form.topic,
    ratio: layout === 'SC-022' ? '9:16' : layout === 'SC-023' ? '4:5' : form.requestedRatio,
    name: signature ? form.name : '',
    pinyin: signature ? form.pinyin : '',
    splitType: layout === 'SC-021' ? form.splitType : ''
  };
}
export function validateCurrentContent(form) {
  if (!KINDS.includes(form.kind)) return {ok: false, code: 'kind', field: 'kind'};
  if (isSignature(form)) {
    if (typeof form.name !== 'string' || !/^[\p{Script=Han}]{2,8}$/u.test(form.name)) return {ok: false, code: 'name', field: 'name'};
    if (typeof form.pinyin !== 'string' || !/^[A-Za-z][A-Za-z '\-]{1,59}$/.test(form.pinyin.trim())) return {ok: false, code: 'pinyin', field: 'pinyin'};
    return {ok: true, code: null, field: null};
  }
  const topic = form.topic;
  if (typeof topic !== 'string' || Array.from(topic.trim()).length < 2 || Array.from(topic).length > 2000) return {ok: false, code: 'topic', field: 'topic'};
  if (ASSET_ID.test(topic)) return {ok: false, code: 'identifier', field: 'topic'};
  return {ok: true, code: null, field: null};
}
export function canVisit(w, stage) {
  if (stage === 'purpose') return true;
  if (!KINDS.includes(w.form.kind)) return false;
  if (stage === 'content') return true;
  if (stage === 'visual') return w.catalogStatus === 'ready' && validateCurrentContent(w.form).ok;
  if (stage === 'result') return w.generatedRevision !== null;
  return false;
}
function clone(w) {
  return {...w, form: {...w.form, colors: [...w.form.colors]}, panels: {...w.panels}};
}
function bumpIfEffectiveChanged(before, next) {
  if (JSON.stringify(effectiveInput(before.form)) === JSON.stringify(effectiveInput(next.form))) return next;
  next.inputRevision += 1;
  next.copyStatus = 'idle';
  next.copyRevision = null;
  if (next.generatedRevision !== null) next.resultStatus = 'dirty';
  return next;
}
const FIELD_STAGE = {topic: 'content', name: 'content', pinyin: 'content', identifier: 'content', kind: 'purpose', layout: 'visual', style: 'visual', colors: 'visual', ratio: 'visual', splitType: 'visual', catalog: 'content'};

export function transition(w, action) {
  const next = clone(w);
  switch (action.type) {
    case 'SELECT_KIND': {
      if (!KINDS.includes(action.kind)) return w;
      next.form.kind = action.kind;
      next.form.socialForm = 'standard';
      next.form.layout = action.kind === 'pure-image' ? '' : DEFAULT_LAYOUT[action.kind];
      next.error = null;
      return bumpIfEffectiveChanged(w, next);
    }
    case 'SELECT_SOCIAL_FORM': {
      if (next.form.kind !== 'social-card' || !SOCIAL_FORMS.includes(action.socialForm)) return w;
      next.form.socialForm = action.socialForm;
      next.form.layout = action.socialForm === 'standard' ? DEFAULT_LAYOUT['social-card'] : SPECIAL_LAYOUT[action.socialForm];
      next.error = null;
      return bumpIfEffectiveChanged(w, next);
    }
    case 'EDIT': {
      if (!EDIT_FIELDS.includes(action.field)) return w;
      next.form[action.field] = action.field === 'colors' ? [...action.value] : action.value;
      next.error = null;
      return bumpIfEffectiveChanged(w, next);
    }
    case 'SET_CATALOG': {
      if (!['loading', 'ready', 'error'].includes(action.status)) return w;
      next.catalogStatus = action.status;
      if (action.status === 'ready' && next.error?.code === 'catalog') next.error = null;
      return next;
    }
    case 'CONTINUE': {
      if (next.stage === 'purpose') {
        if (!KINDS.includes(next.form.kind)) { next.error = {code: 'kind', field: 'kind'}; return next; }
        next.stage = 'content'; next.error = null; return next;
      }
      if (next.stage === 'content') {
        const valid = validateCurrentContent(next.form);
        if (!valid.ok) { next.error = {code: valid.code, field: valid.field}; return next; }
        if (next.catalogStatus !== 'ready') { next.error = {code: 'catalog', field: null}; return next; }
        next.stage = 'visual'; next.error = null; return next;
      }
      return w;
    }
    case 'NAVIGATE': {
      if (!STAGES.includes(action.stage) || !canVisit(next, action.stage)) return w;
      next.stage = action.stage; next.error = null; return next;
    }
    case 'TOGGLE': {
      if (!PANEL_KEYS.includes(action.panel)) return w;
      next.panels[action.panel] = !next.panels[action.panel];
      return next;
    }
    case 'GENERATED': {
      if (action.revision !== next.inputRevision) return w;
      next.output = action.text;
      next.generatedRevision = action.revision;
      next.resultStatus = 'ready';
      next.copyStatus = 'idle';
      next.copyRevision = null;
      next.stage = 'result';
      next.error = null;
      return next;
    }
    case 'GENERATION_FAILED': {
      const field = {topic: 'topic', name: 'name', pinyin: 'pinyin', identifier: 'topic', colors: 'color-primary', layout: 'layout', style: 'style', ratio: 'ratio', splitType: 'split-type', kind: 'kind', catalog: null}[action.code] ?? null;
      next.error = {code: action.code, field};
      next.stage = FIELD_STAGE[action.code] || 'content';
      next.resultStatus = next.generatedRevision !== null ? 'dirty' : 'empty';
      next.copyStatus = 'idle';
      next.copyRevision = null;
      return next;
    }
    case 'COPY_START': {
      if (next.resultStatus !== 'ready' || action.revision !== next.inputRevision || action.revision !== next.generatedRevision) return w;
      next.copyStatus = 'copying';
      next.copyRevision = action.revision;
      return next;
    }
    case 'COPY_RESULT': {
      if (next.copyStatus !== 'copying' || action.revision !== next.copyRevision || action.revision !== next.inputRevision || next.resultStatus !== 'ready') return w;
      next.copyStatus = action.status === 'success' ? 'success' : 'manual';
      if (action.status === 'success') next.panels.useGuide = true;
      return next;
    }
    case 'RESET_ADVANCED': {
      next.form.colors = [next.form.colors[0] || 'C-26', '', ''];
      next.form.requestedRatio = '';
      next.form.splitType = '01';
      return bumpIfEffectiveChanged(w, next);
    }
    case 'RESET': {
      const fresh = createWorkflow();
      fresh.catalogStatus = next.catalogStatus;
      return fresh;
    }
    default:
      return w;
  }
}
