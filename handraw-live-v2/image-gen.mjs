export const PROVIDERS = [
  {id: 'openai', label: 'OpenAI · GPT Image / DALL·E', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1'},
  {id: 'zhipu', label: '智谱 · CogView', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'cogview-4'},
  {id: 'siliconflow', label: 'SiliconFlow · FLUX / Qwen-Image', baseUrl: 'https://api.siliconflow.cn/v1', model: 'black-forest-labs/FLUX.1-schnell'},
  {id: 'custom', label: '自定义 · OpenAI 兼容地址', baseUrl: '', model: ''}
];
export const STORAGE_KEY = 'handraw.modelSettings.v1';

export function defaultSettings() {
  const providers = {};
  for (const p of PROVIDERS) providers[p.id] = {apiKey: '', model: p.model, baseUrl: p.baseUrl};
  return {active: 'openai', providers};
}

export function loadSettings(storage) {
  const defaults = defaultSettings();
  let raw = null;
  try { raw = JSON.parse(storage.getItem(STORAGE_KEY) || 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return defaults;
  const active = PROVIDERS.some(p => p.id === raw.active) ? raw.active : defaults.active;
  const providers = {};
  for (const p of PROVIDERS) {
    const saved = raw.providers?.[p.id] || {};
    providers[p.id] = {
      apiKey: String(saved.apiKey ?? '').trim(),
      model: String(saved.model ?? defaults.providers[p.id].model).trim(),
      baseUrl: String(saved.baseUrl ?? defaults.providers[p.id].baseUrl).trim()
    };
  }
  return {active, providers};
}

export function saveSettings(storage, settings) {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearSettings(storage) {
  storage.removeItem(STORAGE_KEY);
}

export function resolveActive(settings) {
  const preset = PROVIDERS.find(p => p.id === settings.active);
  const conf = settings.providers?.[settings.active];
  if (!preset || !conf) return null;
  const apiKey = conf.apiKey.trim();
  const model = conf.model.trim();
  const baseUrl = conf.baseUrl.trim().replace(/\/+$/, '');
  if (!apiKey || !model || !/^https:\/\//.test(baseUrl)) return null;
  return {id: preset.id, label: preset.label, baseUrl, model, apiKey};
}

export function buildGenerationRequest({baseUrl, model, apiKey, prompt, size}) {
  return {
    url: baseUrl.replace(/\/+$/, '') + '/images/generations',
    init: {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey},
      body: JSON.stringify({model, prompt, n: 1, ...(size ? {size} : {})})
    }
  };
}

export function parseGenerationResponse(json) {
  if (json?.error) throw new Error(json.error.message || '模型服务返回错误。');
  const entry = json?.data?.[0];
  if (entry?.b64_json) return {src: 'data:' + b64Mime(entry.b64_json) + ';base64,' + entry.b64_json, remote: false};
  if (typeof entry?.url === 'string' && /^https:\/\//.test(entry.url)) return {src: entry.url, remote: true};
  throw new Error('响应中没有图片，请稍后重试或更换模型。');
}
function b64Mime(b64) {
  let head = '';
  try { head = atob(String(b64).slice(0, 16)); } catch { return 'image/png'; }
  const c = i => head.charCodeAt(i);
  if (c(0) === 0x89 && c(1) === 0x50 && c(2) === 0x4E && c(3) === 0x47) return 'image/png';
  if (c(0) === 0xFF && c(1) === 0xD8) return 'image/jpeg';
  if (head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return 'image/png';
}

export function testConnectionRequest({baseUrl, apiKey}) {
  return {
    url: baseUrl.replace(/\/+$/, '') + '/models',
    init: {method: 'GET', headers: {Authorization: 'Bearer ' + apiKey}}
  };
}

export function generationErrorText(err, status, body) {
  if (err === 'timeout' || err?.name === 'TimeoutError' || err?.message === 'timeout') return '生成超时（120 秒）。可重试、更换模型或改回默认尺寸。';
  if (err === 'cancel' || err?.name === 'AbortError') return '已取消本次生成。';
  if (status === 401 || status === 403) return 'Key 无效或无权限（401/403）：' + (apiMessage(body) || '请到模型配置检查 Key。');
  if (status === 429) return '额度不足或触发限流（429）：' + (apiMessage(body) || '稍后重试或更换模型。');
  if (status === 400) return '请求被拒绝（400）：' + (body?.error?.message || '请检查模型名与尺寸。');
  if (status >= 500) return '模型服务暂时不可用（5xx），稍后重试。';
  if (status > 0) return '请求失败（' + status + '），稍后重试。';
  if (err === 'reachable-blocked') return '模型服务可达，但浏览器拦截了错误响应（部分服务对鉴权失败的响应不带 CORS 头，无法读取具体原因）。常见原因：Key 无效、余额不足或模型无权限。请到 platform.openai.com 核对 Key 与额度；也可在模型配置改用支持浏览器调用的中转地址。';
  if (err === 'unreachable') return '无法连接模型服务（网络不可达、超时或地址错误）。中国大陆网络无法直连 api.openai.com：请开启代理，或在模型配置改用支持浏览器调用的 https 中转地址。';
  if (err === 'key-ok') return 'Key 校验通过，但本次生图请求被浏览器拦截或网络中断。请重试；若持续失败，请检查模型权限（gpt-image-1 需组织验证，可改用 dall-e-3）或更换中转地址。';
  return '无法连接模型服务：可能是网络、CORS 或地址问题。可在模型配置改用支持浏览器调用的兼容地址。';
}
function apiMessage(body) {
  const m = body?.error?.message;
  if (typeof m !== 'string' || !m.trim()) return '';
  const t = m.trim();
  return t.length > 160 ? t.slice(0, 160) + '…' : t;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs, signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const onAbort = () => controller.abort(signal.reason);
  if (signal) signal.addEventListener('abort', onAbort, {once: true});
  try { return await fetchImpl(url, {...init, signal: controller.signal}); }
  finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
}

export async function diagnoseFetchFailure({baseUrl, apiKey, fetchImpl = fetch, signal = null, timeoutMs = 8000}) {
  const root = baseUrl.replace(/\/+$/, '');
  if (signal?.aborted) return {kind: 'aborted'};
  try {
    const res = await fetchWithTimeout(fetchImpl, root + '/models', {method: 'GET', headers: {Authorization: 'Bearer ' + apiKey}}, timeoutMs, signal);
    if (res.ok) return {kind: 'key-ok'};
    if (res.status === 404 || res.status === 405) return {kind: 'reachable-blocked'};
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return {kind: 'http-error', status: res.status, body};
  } catch {
    if (signal?.aborted) return {kind: 'aborted'};
  }
  try {
    await fetchWithTimeout(fetchImpl, root + '/models', {method: 'GET', mode: 'no-cors', cache: 'no-store'}, timeoutMs, signal);
    return {kind: 'reachable-blocked'};
  } catch {
    return {kind: signal?.aborted ? 'aborted' : 'unreachable'};
  }
}

export async function explainFetchFailure({baseUrl, apiKey, status = 0, body = null, reason = null, fetchImpl = fetch, signal = null, timeoutMs = 8000}) {
  if (reason === 'timeout' || reason === 'cancel') return generationErrorText(reason, 0);
  if (status > 0) return generationErrorText(new Error('http'), status, body);
  const diag = await diagnoseFetchFailure({baseUrl, apiKey, fetchImpl, signal, timeoutMs});
  if (diag.kind === 'http-error') return generationErrorText(new Error('http'), diag.status, diag.body);
  if (diag.kind === 'aborted') return generationErrorText(signal?.reason === 'timeout' ? 'timeout' : 'cancel', 0);
  return generationErrorText(diag.kind, 0);
}
