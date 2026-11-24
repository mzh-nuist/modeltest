const labels = new Map([
  ['minimal','Minimal'], ['low','Low'], ['medium','Medium'], ['high','High'],
  ['xhigh','XHigh'], ['max','Max'], ['default','默认档'], ['none','关闭'],
]);

export function answerEffort(item) {
  const measurement = item?.measurement;
  if (measurement?.status === 'not_run') return null;
  if (item?.effort) return item.effort;
  if (measurement || item?.score != null) return measurement?.effort;
  return null;
}

export function effortText(...values) {
  const labelsUsed = new Set(values.filter(value => value !== null)
    .map(value => labels.get(value) ?? '未记录'));
  return '思考强度 '+([...labelsUsed].join(' / ') || '未实测');
}

export const effortBadge = (...values) => `<small class="effort-label">${effortText(...values)}</small>`;
