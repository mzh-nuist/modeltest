import {gradeShort} from './short-challenge-grading.js?v=20261101-short1';

const modelId = model => model.id.replace('gpt-6.2-', 'gpt62-');
const collectionLabel = 'Codex High';
const conditions = batch => 'Codex Standard · High · 客户端 ' + batch.clientVersion
  + '。每题独立会话，客户端未设总时限和输出上限，服务端输出上限未知。';

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
    const condition = conditions(batch);
    const items = main.map((item, index) => {
      const answer = item.answers[i];
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
          checkedAt: batch.date, condition, apiModel: model.id, provider: 'OpenAI',
          collectionLabel,
        },
      };
    });
    rows.push({modelId: id, selectionFinal: true, items});
    models.push({
      id, name: model.name, apiModel: model.id, provider: 'OpenAI', family: 'GPT',
      highOnly: true, selectedEffort: 'high', checkedAt: batch.date, collectionLabel, condition,
      report: {
        runs: items.slice(0, bank.tasks.length).map(item => ({
          taskId: item.taskId, status: 'complete', outputs: item.measurement.outputs,
        })),
      },
    });
  }
  const codexRequests = main.reduce((sum, item) => sum + item.prompts.length, 0) * models.length;
  return {
    data: {...data, models: [...data.models, ...models], codexRequests, codexDate: batch.date},
    book: {...book, models: [...book.models, ...rows]},
  };
}

export function publishCodexShort(results, batch, bank) {
  const records = bank.tasks.flatMap(task => task.cases.flatMap(example => {
    const item = batch.cases.find(row => row.suite === 'short' && row.id === example.id);
    if (item?.prompts[0] !== example.prompt) throw new Error('Codex 短题与站点版本不一致');
    return batch.models.map((model, i) => {
      const answer = item.answers[i];
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
        modelId: id, name: model.name, apiModel: model.id, provider: 'OpenAI',
        collectionLabel, condition: conditions(batch), checkedAt: batch.date,
        taskId: task.id, caseId: example.id, status, output, grade,
      };
    });
  }));
  return {...results, records: [...results.records, ...records], codexCalls: records.length};
}
