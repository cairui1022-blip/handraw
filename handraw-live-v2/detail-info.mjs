export function buildDetailInfo(slot, item) {
  if (slot === 'layout') {
    return {
      title: `${item.id} · ${item.name}`,
      desc: `${item.name_en}\n${item.template}\n关键词：${item.keywords.join('、')}`
    };
  }
  if (slot === 'style') {
    return {
      title: `${item.number} · ${item.reference}`,
      desc: `${item.generation_name}\n${item.group}\n${item.traits}`
    };
  }
  if (slot === 'color') {
    return {
      title: `${item.id} · ${item.name_zh}`,
      desc: `${item.name_en} · ${item.category_zh}\n${item.quote_zh}\n${item.prompt_zh}`
    };
  }
  throw new Error('unknown detail slot: ' + slot);
}
