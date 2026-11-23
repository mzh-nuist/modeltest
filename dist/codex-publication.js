import {gradeShort} from './short-challenge-grading.js?v=20261101-short1';

const modelId = model => model.id === 'xai/grok-4.7' ? 'grok47'
  : model.id.replace(/^gpt-(\d+)\.(\d+)-/, 'gpt$1$2-');
function collection(batch, model) {
  const codex = batch.route === 'Codex app-server';
  return {
    apiModel: model.id, checkedAt: batch.date, collectionFile: batch.file,
    collectionLabel: codex ? 'Codex High' : 'API High',
    provider: codex ? 'OpenAI' : 'CommandCode',
    condition: codex
      ? 'Codex Standard · High · 客户端 ' + batch.clientVersion
        + '。每题独立会话，客户端未设总时限和输出上限，服务端输出上限未知。'
      : 'CommandCode API · 请求 High · 发送的 max_completion_tokens 为 ' + batch.maxOutputTokens.toLocaleString('zh-CN')
        + ' token。每题独立会话，无客户端总时限，无自动重试。型号与推理档以请求配置为准。'
        + (batch.deliveryNote || ''),
  };
}

function answerCollection(metadata, answer) {
  const followup = answer.followup;
  if (!followup) return metadata;
  return {
    ...metadata,
    apiModel: 'grok-4.7',
    provider: 'Grok',
    checkedAt: followup.date,
    collectionLabel: 'Grok 订阅 High',
    condition: 'Grok 订阅 · Responses · High · 请求参数 max_output_tokens = '
      + followup.maxVisibleOutputTokens.toLocaleString('zh-CN') + '。该参数与接口回报的实际用量分别记录。',
    followup: true,
  };
}

export function publishCodexMain({data, book}, batch, bank) {
  const main = batch.cases.filter(item => item.suite === 'main');
  const samePrompts = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (main.length !== book.tasks.length || book.tasks.some((task, i) => {
    const item = main[i];
    return task.id !== item.id || task.weight !== item.maxPoints || !samePrompts(task.prompts, item.prompts)
      || (bank.tasks[i] && !samePrompts(bank.tasks[i].prompts, item.prompts));
  })) throw new Error('Codex 主试题与站点版本不一致');

  const models = [];
  const rows = [];
  for (const [i, model] of batch.models.entries()) {
    const id = modelId(model);
    if (data.models.some(other => other.id === id)) throw new Error('Codex 模型标识重复');
    const metadata = collection(batch, model);
    const items = main.map((item, index) => {
      const answer = item.answers[i];
      if (answer.score === null) return {
        taskId: item.id, score: null, reason: answer.reason, reviewer: 'assistant',
        measurement: {...metadata, status: answer.status === 'not_run' ? 'not_run' : 'incomplete',
          outputs: item.prompts.map(() => null)},
      };
      const criteria = book.tasks[index].criteria;
      const criteriaScores = answer.criteria?.map(awarded => ({awarded, reason: ''}));
      if (criteriaScores && (criteriaScores.length !== criteria?.length
          || criteriaScores.some(({awarded}, j) => !Number.isFinite(awarded) || awarded < 0 || awarded > criteria[j].max)
          || criteriaScores.reduce((sum, {awarded}) => sum + awarded, 0) !== answer.score)) {
        throw new Error('Codex 分项得分与评分标准不符');
      }
      return {
        taskId: item.id, score: answer.score * 2 / item.maxPoints, reason: answer.reason,
        reviewer: 'assistant', criteriaScores,
        measurement: {
          status: 'success', output: answer.turns.at(-1), outputs: answer.turns,
          ...answerCollection(metadata, answer),
        },
      };
    });
    const pending = items.filter(item => item.score === null).map(item => book.tasks.find(task => task.id === item.taskId).name);
    const mixed = items.some(item => item.measurement.followup);
    rows.push({modelId: id, selectionFinal: pending.length === 0, items});
    models.push({
      id, name: model.name, family: id === 'grok47' ? 'Grok' : 'GPT',
      highOnly: true, selectedEffort: 'high', ...metadata,
      ...(mixed ? {collectionLabel: 'High · 含补测',
        condition: metadata.condition + ' 鹈鹕题由 Grok 订阅 Responses 补测，其余七题沿用原入口。'} : {}),
      pendingReason: pending.length ? pending.join('、') + '缺少完整答卷。总分待评。' : null,
      report: {
        runs: items.slice(0, bank.tasks.length).map(item => ({
          taskId: item.taskId, status: item.measurement.status === 'success' ? 'complete' : item.measurement.status,
          outputs: item.measurement.outputs,
        })),
      },
    });
  }
  const requests = main.reduce((sum, item) => sum + item.answers.reduce(
    (total, answer) => total + (answer.attempted ?? item.prompts.length)
      + (answer.followup && item.id === 'visual' ? 1 : 0), 0), 0);
  const successes = main.reduce((sum, item) => sum + item.answers.filter(answer => answer.score !== null).length * item.prompts.length, 0);
  const counts = batch.route === 'Codex app-server'
    ? {codexRequests: (data.codexRequests || 0) + requests}
    : {totalRequests: data.totalRequests + requests, successfulRequests: data.successfulRequests + successes};
  return {
    data: {...data, ...counts, models: [...data.models, ...models], codexDate: batch.date},
    book: {...book, models: [...book.models, ...rows]},
  };
}

export function publishCodexShort(results, batch, bank) {
  const records = bank.tasks.flatMap(task => task.cases.flatMap(example => {
    const item = batch.cases.find(row => row.suite === 'short' && row.id === example.id);
    if (item?.prompts[0] !== example.prompt) throw new Error('Codex 短题与站点版本不一致');
    return batch.models.flatMap((model, i) => {
      const answer = item.answers[i];
      if (answer.score === null) return [];
      const output = answer.turns[0];
      const status = 'success';
      const grade = gradeShort(task, example, output, status);
      if (grade.total !== answer.score || grade.content !== answer.content
          || grade.format !== answer.format || grade.delivery !== answer.delivery) {
        throw new Error('Codex 短题分数与答卷不符');
      }
      const id = modelId(model);
      if (results.records.some(row => row.modelId === id && row.caseId === example.id)) {
        throw new Error('Codex 短题答卷重复');
      }
      return {
        modelId: id, name: model.name, ...answerCollection(collection(batch, model), answer),
        taskId: task.id, caseId: example.id, status, output, grade,
      };
    });
  }));
  const counts = batch.route === 'Codex app-server'
    ? {codexCalls: (results.codexCalls || 0) + records.length}
    : {modelCalls: results.modelCalls + records.length, successfulRequests: results.successfulRequests + records.length};
  return {...results, ...counts, records: [...results.records, ...records]};
}
