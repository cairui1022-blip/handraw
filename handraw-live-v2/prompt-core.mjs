const ASSET_ID=/\b(?:SC|IG|SB|IP|EC|FA|FB|FC|FD|FE|FF|FG|FH|FI)-\d{3}\b|\bC-\d{2}\b|#\d+/;
const TYPES=['视线锚点跨界续绘','撕纸裂变第二世界','越界破框','微缩浮岛','记忆图谱平铺','经典悬浮落地','正负形咬合'];
const RATIOS=['','1:1','3:4','4:5','2:3','9:16','16:9','4:3','3:2','5:2','21:9','2.35:1'];
const KINDS=['social-card','infographic','comic-storyboard','ip-character','ecommerce','pure-image'];
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function removeAssetIds(text){return text.replace(/\((?:SC|IG|SB|IP|EC)-\d{3}\)/g,'').replace(/\b(?:SC|IG|SB|IP|EC|FA|FB|FC|FD|FE|FF|FG|FH|FI)-\d{3}\b/g,'所选参考').replace(/\bC-\d{2}\b/g,'所选配色').replace(/#\d+/g,'');}
function resolveSplit(template,type,ratio){
 const selected=TYPES[Number(type)-1];
 const [w,h]=(ratio||'9:16').split(':').map(Number);
 const orientation=w===h?'square':w<h?'vertical':'horizontal';
 const lines=template.split('\n').filter(line=>{
  if(line.startsWith('- 【类型 ')&&!line.startsWith('- 【类型 '+type))return false;
  if(line.startsWith('1. 竖版画幅')&&orientation!=='vertical')return false;
  if(line.startsWith('2. 横版画幅')&&orientation!=='horizontal')return false;
  if(line.startsWith('3. 方版画幅')&&orientation!=='square')return false;
  return true;
 }).map(line=>line.replace('当前已采用【类型 01 · 视线锚点跨界续绘型】','当前已采用【类型 '+type+' · '+selected+'型】'));
 const division=orientation==='vertical'?'上下1:1':orientation==='horizontal'?'左右1:1':'按主体动势自适应切分';
 return lines.join('\n')+'\n\n当前画幅：'+(ratio||'9:16')+'。当前切分：'+division+'。只执行类型 '+type+' · '+selected+'。';
}
export function compilePrompt(state,catalog){
 if(!catalog||!Array.isArray(catalog.layouts)||!Array.isArray(catalog.styles)||!Array.isArray(catalog.colors))fail('catalog','目录尚未就绪，请重试。');
 if(!state||!KINDS.includes(state.kind))fail('kind','请选择可用的任务类型。');
 const layout=state.kind==='pure-image'?null:catalog.layouts.find(item=>item.id===state.layout);
 if(state.kind!=='pure-image'&&(!layout||layout.category!==state.kind))fail('layout','请选择当前任务下存在的图型。');
 const style=catalog.styles.find(item=>item.number===state.style);
 if(!style)fail('style','请选择目录中存在的画风。');
 const ids=state.colors||[];
 if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length)fail('colors','最多选择三种不同配色。');
 const colors=ids.map(id=>catalog.colors.find(item=>item.id===id));
 if(colors.some(item=>!item))fail('colors','配色不存在，请重新选择。');
 const ratio=state.ratio||'';
 if(!RATIOS.includes(ratio))fail('ratio','画幅比例不受支持。');
 if(layout?.id==='SC-022'&&ratio&&ratio!=='9:16')fail('ratio','姓名签名卡固定为9:16。');
 if(layout?.id==='SC-023'&&ratio&&ratio!=='4:5')fail('ratio','知识封面卡固定为4:5。');
 const isSignature=layout?.id==='SC-022';
 let topic=state.topic||'';
 if(isSignature){
  if(typeof state.name!=='string'||!/^[\p{Script=Han}]{2,8}$/u.test(state.name))fail('name','请输入2–8个汉字姓名。');
  if(typeof state.pinyin!=='string'||!/^[A-Za-z][A-Za-z '\-]{1,59}$/.test(state.pinyin.trim()))fail('pinyin','请填写姓名的大写或小写英文拼音。');
  topic=state.name;
 }else{
  if(typeof topic!=='string'||Array.from(topic.trim()).length<2||Array.from(topic).length>2000)fail('topic','请输入2–2000个字符，不会自动截断原文。');
 }
 if(ASSET_ID.test(topic))fail('identifier','内容包含资产编号，请改用名称描述；原文不会被自动删改。');
 let template=layout?.template||'';
 if(layout?.id==='SC-021'){
  const type=state.splitType||'01';
  if(!/^(0[1-7])$/.test(type))fail('splitType','请选择一种双拼玩法。');
  template=resolveSplit(template,type,ratio);
 }
 if(isSignature){
  template=template.replaceAll('{例如：唐伯虎}',state.name).replaceAll('{例如：TANG BOHU}',state.pinyin.trim().toUpperCase()).replaceAll('{例如：深钴蓝}',colors[0]?.name_zh||'深钴蓝');
 }
 template=template.replaceAll('{这里是主题描述}',topic).replace(/\{([^{}]+)\}/g,'（执行规则：$1；依据下方用户资料，缺少依据时不要编造）');
 template=removeAssetIds(template);
 const positive=(style.traits||'').split(/[；;]/).filter(part=>!/[避免不要不准禁止]/.test(part.slice(0,2))&&!['避免','不要','不准','禁止'].some(word=>part.includes(word))).join('；');
 const styleText='风格名称：'+style.generation_name+'。参考作者与风格名称：'+style.reference+'。'+(positive?'核心风格特征：'+positive+'。':'');
 const colorText=colors.map((color,i)=>(i===0?'主题色：':'点缀色：')+color.name_zh+'（'+color.name_en+'）。').join('\n');
 const parts=[];
 if(state.kind==='pure-image'){
  parts.push('请根据下方主题设计一张纯图画面，不生成文字、字母、标语或Logo。');
 }else parts.push(template);
 if(!isSignature)parts.push('主题 / 用户资料（原文保留）：\n'+topic);
 if(state.kind==='ecommerce')parts.push('场景与周边元素参考画风：'+style.reference+'（'+style.generation_name+'）。'+(positive?'视觉特征：'+positive+'。':'')+'商品主体必须保持写实；无资料不得虚构参数、评价、认证或承诺。');
 else parts.push(styleText);
 if(colorText)parts.push(colorText);
 if(ratio&&!['SC-021','SC-022','SC-023'].includes(layout?.id))parts.push('用户指定画幅比例：'+ratio+'。如原模板含示例比例，以此明确指定比例为准，保留构图机制。');
 if(!['pure-image','ecommerce'].includes(state.kind)&&!['SC-022','SC-023'].includes(layout?.id))parts.push('【根据主题设计画面隐喻；原文是用户意图，文案与画面相互支撑，文字参与构图，图文一体。保留姓名、数据与事实，不虚构来源、收益或背书。】');
 if(isSignature)parts.push('所选画风仅用于纸感与笔触，不改变顶部普通字体、四款签名骨架或固定布局。');
 const output=parts.filter(Boolean).join('\n\n');
 if(ASSET_ID.test(output))fail('output','组合结果包含未解析的资产编号，已阻止输出。');
 return output;
}
