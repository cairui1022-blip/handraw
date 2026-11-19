import {PROVIDERS, defaultSettings, loadSettings, saveSettings, clearSettings, testConnectionRequest, testConnectionSuccessText, explainFetchFailure, isAllowedBaseUrl, relayBaseFor, persistableBaseUrl, presetFromQuery} from './image-gen.mjs';

const $ = id => document.getElementById(id);

function readForm() {
  const active = document.querySelector('input[name="active-provider"]:checked')?.value || 'openai';
  const providers = {};
  for (const p of PROVIDERS) providers[p.id] = {apiKey: $('key-' + p.id).value, model: $('model-' + p.id).value, baseUrl: $('baseurl-' + p.id).value};
  return {active, providers};
}
function persistable(settings) {
  const out = {active: settings.active, providers: {}};
  for (const p of PROVIDERS) {
    const conf = settings.providers[p.id];
    out.providers[p.id] = {...conf, baseUrl: persistableBaseUrl(p.id, conf.baseUrl, location)};
  }
  return out;
}
function fillForm(settings) {
  for (const radio of document.querySelectorAll('input[name="active-provider"]')) radio.checked = radio.value === settings.active;
  for (const p of PROVIDERS) {
    $('key-' + p.id).value = settings.providers[p.id].apiKey;
    $('model-' + p.id).value = settings.providers[p.id].model;
    $('baseurl-' + p.id).value = relayBaseFor(p.id, settings.providers[p.id].baseUrl, location);
  }
}
function setStatus(text) {
  $('settings-status').value = text;
}
function currentResolved() {
  const settings = readForm();
  const conf = settings.providers[settings.active];
  const apiKey = conf.apiKey.trim();
  const model = conf.model.trim();
  const baseUrl = relayBaseFor(settings.active, conf.baseUrl, location);
  if (!apiKey) return {error: '请先填写当前模型服务的 API Key。'};
  if (!model) return {error: '请填写模型名。'};
  if (!isAllowedBaseUrl(baseUrl)) return {error: '服务地址需以 https:// 开头；百炼本地转发可用 http://127.0.0.1:端口。'};
  const preset = PROVIDERS.find(p => p.id === settings.active);
  return {settings, resolved: {id: preset.id, label: preset.label, baseUrl, model, apiKey}};
}

$('save-settings').addEventListener('click', () => {
  const check = currentResolved();
  if (check.error) { setStatus(check.error); return; }
  saveSettings(localStorage, persistable(check.settings));
  setStatus('已保存，仅存本浏览器。返回工作台即可生成图片。');
});

let testing = false;
let testRun = 0;
$('test-connection').addEventListener('click', async () => {
  if (testing) return;
  const check = currentResolved();
  if (check.error) { setStatus(check.error); return; }
  testing = true;
  const run = ++testRun;
  $('test-connection').disabled = true;
  setStatus('正在测试连接…');
  try {
    const {url, init} = testConnectionRequest(check.resolved);
    const response = await fetch(url, init);
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (run !== testRun) return;
    if (response.ok) setStatus(testConnectionSuccessText(check.resolved.id, response.status));
    else {
      const text = await explainFetchFailure({baseUrl: check.resolved.baseUrl, apiKey: check.resolved.apiKey, status: response.status, body});
      if (run === testRun) setStatus(text);
    }
  } catch {
    const text = await explainFetchFailure({baseUrl: check.resolved.baseUrl, apiKey: check.resolved.apiKey});
    if (run === testRun) setStatus(text);
  } finally {
    if (run === testRun) { testing = false; $('test-connection').disabled = false; }
  }
});

$('clear-settings').addEventListener('click', () => {
  testRun++;
  testing = false;
  $('test-connection').disabled = false;
  clearSettings(localStorage);
  fillForm(defaultSettings());
  $('show-keys').checked = false;
  for (const p of PROVIDERS) $('key-' + p.id).type = 'password';
  setStatus('已清除本浏览器全部配置。');
});

$('show-keys').addEventListener('change', () => {
  for (const p of PROVIDERS) $('key-' + p.id).type = $('show-keys').checked ? 'text' : 'password';
});

const initial = loadSettings(localStorage);
const wanted = presetFromQuery(location.search);
if (wanted) initial.active = wanted;
fillForm(initial);
setStatus('');
document.body.dataset.settingsReady = 'ready';
