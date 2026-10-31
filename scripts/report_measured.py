"""Generate a factual, local Markdown summary from the curated public dataset."""
from collections import Counter
import json
from pathlib import Path
from statistics import median
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner.core import validate_document

ROOT=Path(__file__).resolve().parents[1]


def cell(value):
    return str(value).replace('|',' / ').replace('\n',' ')


def summary(data):
    errors=validate_document(data)
    if errors:raise ValueError('; '.join(errors))
    if data['meta']['kind']!='measured':raise ValueError('Only real measured records are permitted')
    all_runs=data['runs'];runs=[r for r in all_runs if r['status']!='skipped'];grades=Counter(r['grading']['status'] for r in runs)
    known=sum(r['metrics']['cost'] for r in runs if r['metrics']['cost'] is not None)
    unknown=sum(r['metrics']['cost'] is None for r in runs)
    lines=['# 首批真实采集：事实摘要','',f"数据时间：{data['meta']['updatedAt']}。来源为本项目实际调用的服务商端点；上游身份未独立验证。",'',
           f"共{len(runs)}次请求、{len(data['batches'])}个批次、{len(data['models'])}个配置、{len(data['tasks'])}道题目，另{len(all_runs)-len(runs)}条计划跳过。完整返回{sum(r['status']=='success' for r in runs)}次；规则已评{grades['passed']+grades['failed']}次，其中通过{grades['passed']}、不通过{grades['failed']}；开放题待评{grades['pending']}次。",'',
           f"已知名义费用合计${known:.8f}；另{unknown}条费用未知。"+('全部尝试总费用未知，不能把已知部分当完整账单。' if unknown else '这仍是报价估算，不是实际账单回读。'),'',
           '## 批次','', '| 批次 | 请求 | 完整返回 | 重复次数 | 错误/超时 |', '| --- | ---: | ---: | ---: | ---: |']
    for batch in data['batches']:
        selected=[r for r in runs if r['batchId']==batch['id']]
        ok=sum(r['status']=='success' for r in selected)
        lines.append(f"| {cell(batch['title'])} | {len(selected)} | {ok} | {batch['config']['repeats']} | {len(selected)-ok} |")
    lines+=['','## 配置摘要','', '各配置的任务覆盖不同，下表不是排名。通过率按运行计数，重复会改变题目权重。TPS只汇总合格成功样本；同题重复不增加独立题目数。','',
            '| 配置 | 尝试 | 独立题目 | 规则通过/已评 | 待评 | 未完整返回 | TPS中位数/样本数 | 已知费用/未知次数 |',
            '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |']
    for model in data['models']:
        selected=[r for r in runs if r['modelId']==model['id']]
        grade=Counter(r['grading']['status'] for r in selected)
        rates=[r['metrics']['outputTps'] for r in selected if r['status']=='success' and r['metrics']['outputTps'] is not None]
        rate=f'{median(rates):.3f}' if rates else '不可测'
        cost=sum(r['metrics']['cost'] for r in selected if r['metrics']['cost'] is not None)
        missing=sum(r['metrics']['cost'] is None for r in selected)
        lines.append(f"| {cell(model['name'])} | {len(selected)} | {len({r['taskId'] for r in selected})} | {grade['passed']}/{grade['passed']+grade['failed']} | {grade['pending']} | {sum(r['status']!='success' for r in selected)} | {rate} / {len(rates)} | ${cost:.8f} / {missing} |")
    lines+=['','## 解释边界','',
            '- 严格输出题检查格式。额外解释、围栏或未复现段落标记可能导致不通过，即使其中包含正确数值。',
            '- 错误包括HTTP限流、超时、流异常、输出截断。它们不能都解释成模型知识错误。',
            '- TPS是客户端SSE边界估计，不是内部逐token计时。v2采样阈值见运行器文档；字符速率与TPS不可混用。',
            '- 计价模型和免费模型分不同批次采集；服务商默认推理、缓存未知、单客户端串行，不支持并发吞吐或长期稳定性结论。',
            '- 原始事件和凭据只留本地；此摘要由公开白名单数据生成。没有人工评审的开放题始终待评。','']
    return '\n'.join(lines)


if __name__=='__main__':
    data=json.loads((ROOT/'dist/data/measured.json').read_text(encoding='utf-8'))
    (ROOT/'docs/REAL-RUNS.md').write_text(summary(data),encoding='utf-8')
    print('Wrote docs/REAL-RUNS.md from validated public measured data.')
