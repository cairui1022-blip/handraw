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
  if (entry?.b64_json) return {src: 'data:image/png;base64,' + entry.b64_json, remote: false};
  if (typeof entry?.url === 'string' && /^https:\/\//.test(entry.url)) return {src: entry.url, remote: true};
  throw new Error('响应中没有图片，请稍后重试或更换模型。');
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
  if (status === 401 || status === 403) return 'Key 无效或无权限（401/403）。请到模型配置检查 Key。';
  if (status === 429) return '额度不足或触发限流（429）。稍后重试或更换模型。';
  if (status === 400) return '请求被拒绝（400）：' + (body?.error?.message || '请检查模型名与尺寸。');
  if (status >= 500) return '模型服务暂时不可用（5xx），稍后重试。';
  if (status > 0) return '请求失败（' + status + '），稍后重试。';
  return '无法连接模型服务：可能是网络、CORS 或地址问题。可在模型配置改用支持浏览器调用的兼容地址。';
}
