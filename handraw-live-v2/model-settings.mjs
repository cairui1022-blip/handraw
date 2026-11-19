import {PROVIDERS, defaultSettings, loadSettings, saveSettings, clearSettings, testConnectionRequest, explainFetchFailure} from './image-gen.mjs';

const $ = id => document.getElementById(id);

function readForm() {
  const active = document.querySelector('input[name="active-provider"]:checked')?.value || 'openai';
  const providers = {};
  for (const p of PROVIDERS) providers[p.id] = {apiKey: $('key-' + p.id).value, model: $('model-' + p.id).value, baseUrl: $('baseurl-' + p.id).value};
  return {active, providers};
}
function fillForm(settings) {
  for (const radio of document.querySelectorAll('input[name="active-provider"]')) radio.checked = radio.value === settings.active;
  for (const p of PROVIDERS) {
    $('key-' + p.id).value = settings.providers[p.id].apiKey;
    $('model-' + p.id).value = settings.providers[p.id].model;
    $('baseurl-' + p.id).value = settings.providers[p.id].baseUrl;
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
  const baseUrl = conf.baseUrl.trim().replace(/\/+$/, '');
  if (!apiKey) return {error: '请先填写当前模型服务的 API Key。'};
  if (!model) return {error: '请填写模型名。'};
  if (!/^https:\/\//.test(baseUrl)) return {error: '服务地址必须以 https:// 开头。'};
  const preset = PROVIDERS.find(p => p.id === settings.active);
  return {settings, resolved: {id: preset.id, label: preset.label, baseUrl, model, apiKey}};
}

$('save-settings').addEventListener('click', () => {
  const check = currentResolved();
  if (check.error) { setStatus(check.error); return; }
  saveSettings(localStorage, check.settings);
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
    if (response.ok) setStatus('连接成功（' + response.status + '）。可返回工作台生成图片。');
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

fillForm(loadSettings(localStorage));
setStatus('');
document.body.dataset.settingsReady = 'ready';
