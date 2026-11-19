# Handraw 手绘提示词工作台 · 渐进式亮色版（V2）实际使用与验收

> 定位：把「用途 → 内容 → 视觉 → 结果」逐步披露的提示词组合工作台。默认只生成文字提示词与上游参考图下载；在「模型配置」页填入生图模型 API Key 后，可在结果步直接点击生成图片。Key 仅存本浏览器 localStorage，不上传；无账号、无埋点、不自动保存输入。

## 一、怎么实际使用

1. 必须通过 HTTP 服务打开（ES module 与 fetch 不支持 `file://` 双击）。在本目录执行：
   ```sh
   python3 -m http.server 8080
   ```
   然后浏览器访问 `http://localhost:8080/handraw-live-v2/start-creating.html`。
2. 第 1 步选用途（社媒图文／信息图／故事分镜／角色 IP／电商／纯画面）；社媒可展开更多形式（姓名签名／照片双拼／知识封面）。
3. 第 2 步填内容：主题 2–2000 字符保留原文；姓名签名填 2–8 汉字姓名与英文拼音；可点「填入示例内容」查看演示示例（确认后覆盖当前填写，不会自动生成）。
4. 第 3 步选视觉：默认版式／画风／主色已选好，可直接生成。三组小图网格每批 12 张缩略图，**点小图打开大图＋中文说明弹窗**（版式含模板描述与关键词、画风含特征描述、配色含中文名与色系），在弹窗里点「选用此项」才改变选择，直接关闭不丢当前选择；「上一批／下一批」翻页浏览全部 170 图型／370 画风／36 配色；批次栏显示「x / y 批 · 共 n 项」。画风搜索框常显，搜索同时过滤小图网格与文字列表；「文字列表」按钮展开传统下拉目录作为辅助；「展开全部视觉设置」一次展开四组；「更多设置」含点缀色、比例、双拼玩法。参考大图按需加载，可先生成文字。
5. 第 4 步得提示词：复制完整提示词或下载 TXT；「下一步怎么用」查看三步指引并按需下载版式／画风／配色参考（WebP，上游快照，非本次成图）。
6. 可选直接生图：顶栏「模型配置」或结果步「配置模型 Key」进入配置页，选择模型服务（TY AI 中转／OpenAI／智谱 CogView／SiliconFlow／百炼 Qwen／自定义 OpenAI 兼容地址），填 Key、模型名、服务地址，「测试当前连接」通过后「保存配置」。回到结果步点「生成图片」，成功后可下载；生图由浏览器直连模型服务（需对方允许 CORS），失败时自动诊断并显示具体原因（见下节）。不配置 Key 时一切照旧：复制提示词去你自己的生图工具。修改任何有效输入后旧提示词与旧图片立即失效，需重新生成。

### 中转站与 Qwen（百炼）怎么用

- **TY AI 中转（GPT Image 2/2.5/2.6）**：配置页选「TY AI 中转」，服务地址默认 `https://tyaiapi.com/v1`，填 Key 即可；模型名按中转站文档填，例如 `gpt-image-2-1k`（快）、`gpt-image-2.5-sunburst-4k-max`（4K，可选 low/medium/high/xhigh/max 五档质量）、`gpt-image-2-4k-high`（自动 quality=high）。尺寸可选 1K/2K/4K（方形、竖版、横版）；4K 方图为 2880×2880。中转高清常需 1–5 分钟，前端超时已放宽到 10 分钟；超时后请勿连续重试，避免重复扣费。返回的是远程链接（部分仅 1 小时有效），生成后请尽快点「下载图片」保存。
- **Qwen（阿里云百炼）**：百炼生图使用原生接口，**不支持 OpenAI 兼容模式**，因此不能像 OpenAI 那样由浏览器直连；本站提供一个本地转发服务（`dashscope-relay.mjs` + `dashscope-relay-server.mjs`），由它代你调用百炼并自动处理同步/异步两种协议。使用步骤：
  1. 在本目录执行 `node dashscope-relay-server.mjs`（默认 `http://127.0.0.1:8787`）。若提示「端口已被占用」，换一个端口再启动，例如 `node dashscope-relay-server.mjs --port 8900`，并把配置页的服务地址改成对应端口。启动成功后终端会打印 `工作台已启动：http://127.0.0.1:端口/start-creating.html`。
  2. 浏览器打开它打印的地址 `http://127.0.0.1:8787/start-creating.html`（**不要用 GitHub Pages 打开**：https 页面直连本机 http 会被浏览器按混合内容拦截）。
  3. 配置页选「百炼 · Qwen-Image / Wanx（本地转发）」，填百炼 API Key，模型名填 `qwen-image-2.0-pro`（推荐，同步出图）或 `qwen-image`、`wanx2.1-t2i-turbo`（异步任务，转发服务自动轮询），保存后回结果步生图。
  4. `qwen-image-2.0` 系列一次请求即返回；`qwen-image`／`wanx` 系列先建任务再轮询，通常 1–2 分钟，前端 10 分钟超时。百炼返回的图片链接 24 小时有效，请及时下载。
- **「测试当前连接」在百炼下的含义**：它只探测本地转发服务是否可达，**不校验百炼 Key**（避免额外产生一次计费调用）；Key 是否有效会在第一次生成图片时以百炼原文报错呈现。
- 若只需文字提示词，不配置任何 Key 也完全可用。

### 配置 Key 后生图失败怎么办（自动诊断）

部分服务（实测 OpenAI）对鉴权失败的响应不带 CORS 头，浏览器只能抛出笼统的「Failed to fetch」。本站失败后会自动补发一次带 Key 的 `GET /models`（该端点错误响应可读）与一次不带 Key 的可达性探测，把真实原因显示在错误框（多行完整展示）：

- **401/403＋英文原文**：Key 无效、被撤销或无权限。OpenAI 的 `gpt-image-1` 需完成组织验证（platform.openai.com → Settings → Organization → Verify），未验证可把模型名改为 `dall-e-3`。
- **429＋quota 字样**：额度不足或限流。到 platform.openai.com 检查 Billing／额度，稍后重试或换模型。
- **「模型服务可达，但浏览器拦截了错误响应」**：服务能连上但错误被 CORS 掩盖，常见仍是 Key／额度／模型权限问题，按上两条排查；或改用支持浏览器调用的中转地址。
- **「无法连接模型服务（网络不可达、超时或地址错误）」**：中国大陆网络无法直连 api.openai.com，需开启代理，或在模型配置「自定义」里填支持浏览器调用的 https 中转 Base URL（OpenAI 兼容 `/images/generations` 协议）；也可选「TY AI 中转」预置。用百炼时请确认本机转发服务已启动、且页面是从 `http://127.0.0.1:8787` 打开的。
- **「Key 校验通过，但生图请求不足 5 秒即失败…」**：Key 有效（`GET /models` 成功），但生图被快速拒绝且错误响应被 CORS 掩盖。多为模型权限或参数问题：`gpt-image-1` 需组织验证（通过后约 15 分钟生效），也可能触发限流。错误框下方会出现**「改用 dall-e-3 重试」**按钮：一键把 OpenAI 模型改为 `dall-e-3`、尺寸重置为模型默认并立即重试（`dall-e-3` 无需组织验证；提示词超过 4000 字符会被拒绝，可精简内容）。
- **「Key 校验通过，但生图连接在约 X 秒后被中断…」**：长连接被提前切断。`gpt-image-1` 生成常需 1–3 分钟，代理、网关或中转的空闲超时（常见 60/100 秒）可能提前断连。请重试；持续失败同样可一键改用 `dall-e-3`（通常更快）、更换更稳定的网络/代理，或改用支持长连接的中转地址。本站无法替你修复代理或组织验证，这两项需在你的网络环境或 OpenAI 后台完成。
- 诊断期间「取消生成」仍可用；「测试当前连接」走同一诊断逻辑。

## 二、在线入口与部署记录

- 公开入口（GitHub Pages，免费）：`https://cairui1022-blip.github.io/handraw/`，根页面自动跳转到 `handraw-live-v2/start-creating.html`。
- 发布仓库：`cairui1022-blip/handraw`（main 分支，仅公开白名单资产：V2 应用＋只读 V3 效果库＋LICENSE；不含 PRD、测试、报告、凭据）。
- 页面级 CSP 已内嵌（GitHub Pages 不支持自定义响应头，`frame-ancestors` 无法经 meta 设置，点击劫持防护弱于带响应头的托管；页面零外域脚本、零内联脚本）。
- 回退：旧 Netlify 站 `https://handraw-workbench-20261116-d7060d.netlify.app` 仍指向 V1，未改动； Pages 回退可用 `git revert` 后推送。本地 `handraw-live-v1/`、原型目录与 V1/V3 ZIP 均未覆盖。
- Netlify 短名站 `handraw-app` 已创建但未部署：账户提示「Account credit usage exceeded - new deploys are blocked until credits are added」，需账户持有人补充额度后才能启用 `handraw-app.netlify.app`；Cloudflare 凭据已失效、Vercel 未登录，故本轮采用 GitHub Pages。

## 三、实际测试结果（2026-11-19，内置 Node v22.23.2 ＋ 本机 Chrome CDP）

- 本轮新增：默认文字快选移除；小图点击改为「大图＋中文描述」弹窗、弹窗内选用（关闭不丢选择）；模型配置页（保存／校验／测试连接／显示 Key／清除）；结果步直接生图（成功下载字节一致、尺寸透传、stale  gating、401 中文错误、挂起取消）。生图链路浏览器验收使用 fetch 桩（200/b64、401、hang），未消耗真实额度。
- 续轮修复（OpenAI Key 失败被掩盖）：真浏览器＋curl 实证 OpenAI 对 `POST /images/generations` 的 401 响应不带 CORS 头（预检通过、响应被浏览器拦截），旧版把真实 Key 错误显示成「网络/CORS」笼统文案。修复为失败自动诊断（带 Key `GET /models` 读真实 401/403/429＋API 原文；no-cors 探测区分可达但被拦/真不可达），错误与状态框升级多行只读 textarea，配置页帮助文案补直连前提。公网真网络假 Key 探针验收：用户可见文案由「无法连接模型服务…」变为「Key 无效或无权限（401/403）：Incorrect API key provided…」。
- 续轮修复 D（Key 有效但生图被拦/断连）：key-ok 诊断按耗时分流——不足 5 秒＝快速被拒（指向组织验证/限流/参数），≥5 秒＝「约 X 秒后连接被中断」（指向代理/网关空闲超时切断长连接，gpt-image-1 常需 1–3 分钟）；两种情形均提供「改用 dall-e-3 重试」一键按钮（持久化模型、尺寸重置为默认、立即重试；仅 OpenAI＋gpt-image* 模型时出现）。提示词长度实测：默认社媒 556 字符、2000 字主题下绝大多数版式 <3000，仅 IP-001 极端 4573 会触发 dall-e-3 的 4000 上限（可读 400 报错）。
- 移动图片性能：参考图按条目独立 WebP（576 个，中位 <100KB、平均约 58KB），运行时不再请求分类批量 JSON；缩略图懒加载，隐藏项不发起请求、不残留 src；字节与上游快照逐一对齐（SHA1 一致）。
- 本轮修复 E（中转与 Qwen）：新增 TY AI 中转预置（`https://tyaiapi.com/v1`），支持 2K/4K 尺寸与五档质量（4K 旧模型自动 high，4K-max 模型可手动选 max）；生图超时由 120 秒放宽到 10 分钟并在超时文案中提示勿重复提交以免重复扣费；远程图片链接显示「可能过期，请尽快下载」提示，下载改为新标签页打开；SiliconFlow 改用其原生协议（`image_size`／`batch_size`，响应 `images[]`）；新增百炼本地转发服务，qwen-image-2.0 系列走同步 `multimodal-generation`，qwen-image／wanx 系列走异步 `text2image`＋任务轮询，并对外保持 OpenAI 兼容响应形状。真实 HTTP 链路（浏览器→本地 relay→假上游）验证同步、异步轮询、401 三条路径。
- Node 单元／契约：`node --test handraw-live-v2/tests/*.test.mjs` → 120/120 通过（新增 dashscope-relay 17 项，含「直接运行脚本必须真正启动」的子进程用例：协议构造、同步取图、任务状态映射、轮询、错误透传、预检、静态托管与路径穿越防护；image-gen 新增中转质量/尺寸、百炼预置与探测文案 10 项）。
- 浏览器本地全量：`browser-check.mjs --suite all` → 62/62 通过（gen 27 项，其中新增 TY AI 4K 质量档与透传、1K 模型不下发质量、SiliconFlow 协议与 401 原文、远程链接提示与下载新标签、百炼 relay 同步/401；另设 relay 套件 4 项验证浏览器→本地服务→上游的真实 HTTP 同步/异步轮询/401）。
- 公开 HTTPS 全量：同一 all 套件对 GitHub Pages 入口 → 62/62（含剪贴板真实读回、TXT 落盘 UTF-8 字节一致、参考 WebP 下载字节一致、生图桩链路）。
- 交付包独立验证：ZIP 解压后独立 HTTP 服务跑同一 all 套件 → 62/62。
- 公开资源核对：应用／目录／参考／效果库全部 200；tests 与 README 路径 404（未发布）；无平台脚本注入、无外域可执行脚本。
- 交付包：`Handraw-可用工作台-V2.zip`（V2 应用＋配置页＋576 张按条目参考图＋README＋测试＋只读 V3 效果库），逐文件 SHA256 与 CRC 校验通过，见 `docs/verification/handraw-progressive-light/delivery-zip-report.json`。
- 验证截图与报告：`docs/verification/handraw-progressive-light/`（local/public/zip，含 detail-dialog、settings-page、gen-ready 截图）。

## 四、未验证项（待人工，不以模拟代替）

- 真实有效 API Key 的端到端生图（浏览器验收用 fetch 桩模拟 200/b64、401、挂起取消与三类诊断路径；另以假 Key 对公网真网络验证了 401 诊断文案；未消耗真实额度）。
- 各模型服务对浏览器直连的 CORS 实际支持（OpenAI 实测：预检与成功路径允许跨域，鉴权失败响应不带 CORS 头→本站自动诊断兜底；TY AI 中转实测 OPTIONS 204 且 `Access-Control-Allow-Origin: *`、假 Key 401 亦带 ACAO，浏览器可直连；SiliconFlow 同样 OPTIONS 204 / 401 带 ACAO。以上为 curl 预检与假 Key 实测，真实出图仍以「测试当前连接」与首次生成为准）。
- 真实百炼 Key 的端到端出图（本地转发链路已用假上游验证同步 `qwen-image-2.0`、异步任务轮询、401 透传三条路径；另以假 Key 对真实百炼服务器实测，同步/异步均在 0.1–0.3 秒内回传上游原文 `Invalid API-key provided.` 并 401 透传到 UI，未消耗额度）。
- 真实 TY AI 中转 Key 的 4K 出图耗时与真实出图质量。
- 真机软键盘（iOS/Android）输入与底栏遮挡、Safari、微信内置浏览器。
- 5 名首次用户 UAT（90 秒完成率 ≥4/5、5/5 理解外部生图或配置生图）尚未招募执行。
- 公网弱网／断网真机体验（CDP 阻断模拟已通过；单图请求已降为 KB 级、移除 MB 级批量 JSON 根因，但真实弱网未测）。
- 真实读屏器无障碍走查。
- 独立代码审查服务无有效返回（429），本轮为作者自查（self-review），弱于独立审查。

## 五、边界与隐私

- 固定上游快照 `ab848ebfd478cdcd29b69ee2ee5090b4bb7b9d89`；170 图型／370 画风／36 配色字节不变。
- 输入只存在于当前页面内存；刷新或关闭即丢失，不写 localStorage/sessionStorage。**唯一例外**：模型配置（Key／模型名／地址）经用户主动保存后写入本浏览器 localStorage（`handraw.modelSettings.v1`），不上传到任何服务器；「清除本浏览器全部配置」或清除浏览器数据可删除。
- 网络请求仅三类：同源静态资产；用户配置后浏览器直连其填写的 https 模型服务地址（生图与连接测试）；失败自动诊断时对同一地址补发带 Key 的 `GET /models` 与不带 Key 的可达性探测（no-cors）。Key 只随带 Authorization 头的请求发送，不上传到任何第三方。
- 照片双拼不在本站上传照片；电商无资料不编造事实；纯画面不生成文字。
