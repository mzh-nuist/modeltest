"""Collect six everyday conversations with the existing SSE transports. Plan is always offline."""
import argparse
import copy
import datetime as dt
import json
import math
import os
from pathlib import Path
import sys
from . import core
from .checkup import SUITE, load_bank, template, validate_bank, validate_report, read, trimmed
from .challenge_scoring import guard


def make_plan(config, bank):
    validate_bank(bank); guard(config)
    allowed = {'title','suiteId','simulation','region','concurrency','repeats','maxRetries','timeoutSeconds','budgetUsd','models','includeVisual'}
    if not isinstance(config, dict) or set(config) - allowed: raise core.ConfigError('Use the dedicated daily-checkup configuration')
    if config.get('suiteId', SUITE) != SUITE or config.get('repeats', 1) != 1 or config.get('maxRetries', 0) != 0:
        raise core.ConfigError('Six-check collection uses this suite, one pass and no retries')
    if type(config.get('includeVisual', False)) is not bool: raise core.ConfigError('includeVisual must be boolean')
    models = config.get('models')
    if not isinstance(models, list) or len(models) != 1: raise core.ConfigError('Use one model per saved everyday record')
    budget = config.get('budgetUsd')
    if not core.nonnegative(budget): raise core.ConfigError('An explicit nonnegative budget is required')
    model = models[0]
    tasks = [t for t in bank['tasks'] if not t['optional'] or config.get('includeVisual', False)]
    projected = []
    for task in tasks:
        for step, prompt in enumerate(task['prompts']):
            projected.append({'id':task['id']+'-'+str(step+1),'title':task['title'],'category':'instruction','difficulty':'easy',
                              'prompt':prompt,'maxOutputTokens':model.get('maxOutputTokens'),'grader':{'type':'manual'}})
    normalized = copy.deepcopy(config)
    normalized.pop('includeVisual', None)
    # Reuse established transport/config validation. Zero budget remains zero in the actual plan and execute guard.
    normalized['budgetUsd'] = budget if budget > 0 else 1
    plan = core.make_plan(normalized, projected)
    plan.update(suiteId=SUITE, budgetUsd=budget, fitsBudget=plan['reservedUpperBoundUsd'] <= budget,
                includeVisual=config.get('includeVisual', False), taskIds=[t['id'] for t in tasks],
                assumption='Reserve every full conversation request; unknown usage never releases reservation. Planning sends no requests.')
    return plan


def validate_commandcode_free(config, plan):
    """Narrow zero-budget exception, used only after the dedicated live terms check."""
    model = config['models'][0]
    if (config.get('simulation', False) or config['budgetUsd'] != 0
            or model.get('endpoint') != 'https://api.commandcode.ai/provider/v1/chat/completions'
            or model.get('apiModel') not in ('reflection/beam:free','poolside/laguna-s-2.1-free','stealth/glyph-cluster:free')
            or model.get('adapter') != 'openai-compatible'
            or any(model.get(k) != 0 for k in ('inputPrice','outputPrice','cachedInputPrice'))
            or plan['reservedUpperBoundUsd'] != 0 or plan['plannedRequests'] > 11):
        raise core.ConfigError('Free collection requires an exact verified CommandCode free route and zero prices/budget')


def collect(config, bank, destination, allow_paid=False, commandcode_free=False, budget_guard=None):
    plan = make_plan(config, bank)
    simulation = config.get('simulation', False)
    if commandcode_free: validate_commandcode_free(config, plan)
    if not simulation and not commandcode_free and (not allow_paid or config['budgetUsd'] <= 0):
        raise core.ConfigError('Real model calls require a positive approved budget and --execute --allow-paid')
    if not plan['fitsBudget']: raise core.ConfigError('Worst-case full-conversation reservations exceed budget; no requests sent')
    model = config['models'][0]
    secret = '' if simulation else os.environ.get(model['apiKeyEnv'], '')
    if not simulation and not secret: raise core.ConfigError('The configured credential environment variable is unset')
    destination = Path(destination)
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise core.ConfigError('Use a new output directory; existing evidence is never overwritten')
    destination.mkdir(parents=True, exist_ok=True)
    report = template(bank, model.get('name', model['id']))
    report.update(kind='demo' if simulation else 'imported', checkedAt=dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),
                  conditions=f"入口{model['endpoint']}；模型{model['apiModel']}；温度{model.get('temperature')}；推理{model.get('reasoningEffort')}；输出上限{model['maxOutputTokens']}；地区{config.get('region','未填')}")
    journal = []
    reserved = 0.0; halted = None
    reserve = (model['maxInputTokens'] * model['inputPrice'] + model['maxOutputTokens'] * model['outputPrice']) / 1000000
    allowed = set(plan['taskIds'])
    core.write_json(destination/'plan.json', plan)
    def save():
        validate_report(report, bank)
        core.write_json(destination/'public.json', core.clean(report, [secret]))
        core.write_json(destination/'raw/conversations.json', core.clean({'suiteId':SUITE,'kind':'demo' if simulation else 'measured','attempts':journal}, [secret]))
        known = math.fsum(a['metrics']['cost'] for a in journal if a['metrics']['cost'] is not None)
        unknown = sum(a['metrics']['cost'] is None for a in journal)
        summary = {'suiteId':SUITE,'kind':'demo' if simulation else 'measured','modelApiCalls':0 if simulation else len(journal),
                   'loopbackRequests':len(journal) if simulation else 0,'reservedUsd':reserved,'knownEstimatedCostUsd':known,
                   'unknownCostAttempts':unknown,'totalEstimatedCostUsd':None if unknown else known,'halted':halted,
                   'note':'本机模拟接口，不是真实模型测试。' if simulation else '本机客户端采集；标价估算不是服务商实际账单。'}
        core.write_json(destination/'summary.json', summary)
        return summary
    save()
    for task, row in zip(bank['tasks'], report['runs']):
        if task['id'] not in allowed:
            row['note'] = '可选画图未启用。'; continue
        if halted:
            row['note'] = '前面的请求触发停止条件，尚未发送这一项。'; continue
        history = []
        for step, prompt in enumerate(task['prompts']):
            history.append({'role':'user','content':prompt})
            # UTF-8 bytes plus framing allowance is a conservative budget bound, not a tokenizer claim.
            if len(json.dumps(history, ensure_ascii=False).encode('utf-8')) + 1024 > model['maxInputTokens']:
                row['status'] = 'incomplete' if step else 'not_run'; row['note'] = '完整对话超出输入预留，停止本项，未裁剪历史。'; break
            if reserved + reserve > config['budgetUsd'] + 1e-12:
                halted = 'budget_reservation_exhausted'; row['note'] = '额度预留不足，未发送后续请求。';
                if step: row['status'] = 'incomplete'
                break
            if budget_guard:
                halted = budget_guard('before', reserve)
                if halted:
                    if step: row['status']='incomplete'
                    row['note']='账户额度核查触发停止条件，未发送这一轮。'; save(); break
            reserved += reserve
            try:
                result = core.request_once(model, {'prompt':prompt}, {'simulation':simulation,'timeoutSeconds':config.get('timeoutSeconds',60)}, model['maxOutputTokens'], secret, messages=history)
            except KeyboardInterrupt:
                halted = 'request_interrupted'; row['status']='incomplete';row['note']='采集被中断。';save();return report,save()
            output = core.clean(result['output'], [secret])
            if trimmed(output): row['outputs'][step] = output[:100000]
            metrics = result['metrics']
            journal.append({'taskId':task['id'],'step':step+1,'status':result['status'],'error':result['error'],
                            'metrics':metrics,'reservedUsd':reserve,'raw':result.get('_raw',{})})
            if budget_guard: halted = budget_guard('after', reserve)
            billable = metrics['outputTokens']
            if billable is not None and model.get('usageSemantics') == 'visible_only':
                billable += metrics['reasoningTokens'] or 0
            if ((metrics['cost'] is not None and metrics['cost'] > reserve + 1e-12)
                    or (metrics['inputTokens'] is not None and metrics['inputTokens'] > model['maxInputTokens'])
                    or (billable is not None and billable > model['maxOutputTokens'])):
                halted='provider_usage_exceeds_reservation'
            if result.get('error') == 'request_interrupted': halted='request_interrupted'
            if commandcode_free and (result['status'] != 'success' or not trimmed(output) or len(output)>100000):
                halted = halted or 'free_request_failed'
            if result['status'] != 'success' or len(output)>100000 or not trimmed(output) or halted:
                row['status']='incomplete'
                row['note']='第'+str(step+1)+'轮未完成（'+('output_too_long' if len(output)>100000 else halted or result['error'] or 'empty_answer')+'）；未重试，后续轮次未补写。'
                save(); break
            history.append({'role':'assistant','content':output})
            row['status']='complete' if step==len(task['prompts'])-1 else 'incomplete'
            row['note']='' if row['status']=='complete' else '正在依次采集本项对话。'
            save()
    return report, save()


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    for command in ['plan','run']:
        c=sub.add_parser(command);c.add_argument('--config',required=True);c.add_argument('--out',required=True)
        if command=='run':c.add_argument('--execute',action='store_true');c.add_argument('--allow-paid',action='store_true')
    a=p.parse_args(argv)
    try:
        config=read(a.config);bank=load_bank()
        if a.command=='run' and a.execute:
            _,summary=collect(config,bank,a.out,a.allow_paid);print(json.dumps(summary,ensure_ascii=False))
        else:
            plan=make_plan(config,bank)
            from .checkup import write_new
            write_new(a.out,plan);print(json.dumps({'state':'planned','requests':plan['plannedRequests'],'fitsBudget':plan['fitsBudget'],'networkCalls':0},ensure_ascii=False))
        return 0
    except (ValueError,OSError,TypeError,KeyError) as exc:
        print('没有执行采集：'+(str(exc) if isinstance(exc,core.ConfigError) else '请检查配置、文件及输出路径。'),file=sys.stderr);return 2


if __name__=='__main__':raise SystemExit(main())
