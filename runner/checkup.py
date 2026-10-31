"""Six everyday checks, saved conversations and offline demos. No network or model API runner."""
import argparse
import copy
import datetime as dt
import json
from pathlib import Path
import re
import sys
from .challenge_scoring import guard, strict_json, _svg_shape

ROOT = Path(__file__).resolve().parents[1]
SUITE = 'zhufeng-daily-six-v1'
IDS = ['purpose', 'reasoning', 'edit', 'memory', 'honesty', 'visual']
VERDICTS = {'normal': '正常', 'missed': '漏了要求', 'wrong': '明显答错', 'review': '需要人看', 'not_run': '未测'}
JS_WHITESPACE = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


def trimmed(value):
    # Match the browser's String.trim, including BOM but excluding NEL.
    return value.strip(JS_WHITESPACE)


def fields(value, names):
    if not isinstance(value, dict) or set(value) != set(names):
        raise ValueError('文件字段不符合六项体检格式')


def text(value, maximum=100000, empty=True):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not trimmed(value)):
        raise ValueError('文字为空或过长')


def load_bank():
    bank = strict_json((ROOT / 'datasets/checkup_v1.json').read_text(encoding='utf-8'))
    return validate_bank(bank)


def validate_bank(bank):
    guard(bank)
    fields(bank, ['schemaVersion', 'suiteId', 'title', 'tasks'])
    if bank['schemaVersion'] != 'daily-checkup-bank-v1' or bank['suiteId'] != SUITE:
        raise ValueError('不是这版六项体检题库')
    text(bank['title'], 200, False)
    if not isinstance(bank['tasks'], list) or any(not isinstance(t, dict) for t in bank['tasks']) or [t.get('id') for t in bank['tasks']] != IDS:
        raise ValueError('题库必须包含固定的六项')
    for task in bank['tasks']:
        fields(task, ['id', 'title', 'category', 'optional', 'mode', 'prompts', 'expected', 'checks', 'exactAnswer'])
        for key in ['title', 'category', 'expected']: text(task[key], 3000, False)
        if task['optional'] is not (task['id'] == 'visual') or task['mode'] != ('exact' if task['id'] == 'edit' else 'guided'):
            raise ValueError('题型或可选状态错误')
        if not isinstance(task['prompts'], list) or len(task['prompts']) != {'edit': 2, 'memory': 5}.get(task['id'], 1):
            raise ValueError('会话轮数错误')
        for prompt in task['prompts']: text(prompt, 5000, False)
        if not isinstance(task['checks'], list): raise ValueError('检查点错误')
        seen = set()
        for check in task['checks']:
            fields(check, ['id', 'label', 'essential'])
            text(check['id'], 50, False); text(check['label'], 300, False)
            if check['id'] in seen or type(check['essential']) is not bool: raise ValueError('重复检查点')
            seen.add(check['id'])
        if task['mode'] == 'exact':
            text(task['exactAnswer'], 3000, False)
            if task['checks']: raise ValueError('逐字检查不使用人工打分')
        elif task['exactAnswer'] is not None or not task['checks']:
            raise ValueError('人工题必须有检查点')
    return bank


def template(bank, label='尚未填写模型名称'):
    return {'schemaVersion': 'daily-checkup-report-v1', 'suiteId': SUITE, 'kind': 'imported',
            'modelLabel': label, 'checkedAt': None, 'conditions': '',
            'runs': [{'taskId': t['id'], 'status': 'not_run', 'outputs': [None] * len(t['prompts']), 'review': None, 'note': ''} for t in bank['tasks']]}


def validate_report(report, bank):
    validate_bank(bank); guard(report)
    fields(report, ['schemaVersion', 'suiteId', 'kind', 'modelLabel', 'checkedAt', 'conditions', 'runs'])
    if report['schemaVersion'] != 'daily-checkup-report-v1' or report['suiteId'] != SUITE or report['kind'] not in ['demo', 'imported']:
        raise ValueError('记录版本或来源错误')
    text(report['modelLabel'], 200, False); text(report['conditions'], 2000)
    if report['checkedAt'] is not None:
        text(report['checkedAt'], 50, False)
        try:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})', report['checkedAt']): raise ValueError()
            when = dt.datetime.fromisoformat(report['checkedAt'].replace('Z', '+00:00'))
            if when.tzinfo is None or 'T' not in report['checkedAt']: raise ValueError()
        except ValueError: raise ValueError('测试时间需要带时区') from None
    rows = report['runs']
    if not isinstance(rows, list) or len(rows) != 6 or any(not isinstance(r, dict) for r in rows) or [r.get('taskId') for r in rows] != IDS:
        raise ValueError('记录必须按题库顺序保留六项；未测项保留为空')
    for task, row in zip(bank['tasks'], rows):
        fields(row, ['taskId', 'status', 'outputs', 'review', 'note'])
        text(row['note'], 2000)
        if row['status'] not in ['not_run', 'complete', 'incomplete'] or not isinstance(row['outputs'], list) or len(row['outputs']) != len(task['prompts']):
            raise ValueError('回答状态或轮数错误')
        for output in row['outputs']:
            if output is not None: text(output, 100000, False)
        count = sum(o is not None for o in row['outputs'])
        if row['status'] == 'not_run' and count or row['status'] == 'complete' and count != len(task['prompts']) or row['status'] == 'incomplete' and count == 0 and not trimmed(row['note']):
            raise ValueError('回答内容与状态矛盾')
        review = row['review']
        if review is not None:
            if task['mode'] == 'exact' or row['status'] != 'complete': raise ValueError('这份回答暂不能人工确认')
            fields(review, ['answers', 'note'])
            fields(review['answers'], [c['id'] for c in task['checks']])
            if any(v not in ['yes', 'no', 'unsure'] for v in review['answers'].values()): raise ValueError('检查结果只能是是、否或拿不准')
            text(review['note'], 2000)
    return report


def assess_run(task, row):
    if row['status'] == 'not_run':
        return {'verdict': 'not_run', 'origin': 'none', 'reason': '这项还没有回答。'}
    if row['status'] != 'complete':
        return {'verdict': 'review', 'origin': 'none', 'reason': '回答或会话不完整，先补齐记录；不能据此判断记忆或理解能力。'}
    if task['mode'] == 'exact':
        # Ignore only surrounding whitespace. Every character in the sentence remains material.
        ok = trimmed(row['outputs'][-1]) == task['exactAnswer']
        return {'verdict': 'normal' if ok else 'missed', 'origin': 'rule',
                'reason': '改好的句子与要求一致。' if ok else '句子没有逐字满足要求，请对照原句查看改动。'}
    review = row['review']
    if review is None:
        return {'verdict': 'review', 'origin': 'none', 'reason': '请按下面几个检查点看回答；程序不靠关键词猜对错。'}
    values = review['answers']
    verdict = 'wrong' if any(c['essential'] and values[c['id']] == 'no' for c in task['checks']) else 'missed' if 'no' in values.values() else 'review' if 'unsure' in values.values() else 'normal'
    return {'verdict': verdict, 'origin': 'human', 'reason': {'wrong': '你确认了关键事实或目的存在错误。', 'missed': '你确认了至少一项要求被遗漏。', 'review': '还有拿不准的检查点，先保留待看。', 'normal': '你确认了这道题的全部检查点。'}[verdict]}


def assess_report(report, bank):
    validate_report(report, bank)
    return [{'taskId': t['id'], **assess_run(t, r)} for t, r in zip(bank['tasks'], report['runs'])]


def compare_reports(previous, current, bank):
    old = assess_report(previous, bank); new = assess_report(current, bank)
    conditions_match = bool(trimmed(previous['conditions'])) and previous['conditions'] == current['conditions'] and previous['modelLabel'] == current['modelLabel']
    dates_ordered = bool(previous['checkedAt'] and current['checkedAt']) and dt.datetime.fromisoformat(previous['checkedAt'].replace('Z', '+00:00')) < dt.datetime.fromisoformat(current['checkedAt'].replace('Z', '+00:00'))
    comparable = bool(conditions_match and dates_ordered)
    rows = []
    for a, b in zip(old, new):
        note = '先补齐同一模型、用法和前后日期。' if not comparable else '这一项还需要完整回答和明确判断。'
        if comparable and a['verdict'] in ['normal', 'missed', 'wrong'] and b['verdict'] in ['normal', 'missed', 'wrong']:
            note = '上次正常，这次出现问题。' if a['verdict'] == 'normal' and b['verdict'] != 'normal' else '上次有问题，这次正常。' if a['verdict'] != 'normal' and b['verdict'] == 'normal' else '两次都正常。' if b['verdict'] == 'normal' else '两次都有问题，请对照回答。'
        rows.append({'taskId': a['taskId'], 'previous': a['verdict'], 'current': b['verdict'], 'note': note})
    return {'comparable': comparable, 'rows': rows, 'note': '先看具体回答的变化；一次翻车不能证明模型整体变差。'}


def previewable_svg(output):
    return isinstance(output, str) and len(output) <= 100000 and _svg_shape(output.strip())


def collect_conversation(task, reply):
    """Transport seam: retain every real turn. Offline callers supply a local function."""
    row = {'taskId': task['id'], 'status': 'incomplete', 'outputs': [None] * len(task['prompts']), 'review': None, 'note': ''}
    history = []
    for i, prompt in enumerate(task['prompts']):
        history.append({'role': 'user', 'content': prompt})
        try:
            output = reply(copy.deepcopy(history))
            text(output, 100000, False)
        except Exception:
            # Do not put provider errors, headers or credentials into a public record.
            row['note'] = '采集在第' + str(i + 1) + '轮未完成；没有补写后续回答。'
            break
        row['outputs'][i] = output
        history.append({'role': 'assistant', 'content': output})
    else:
        row['status'] = 'complete'
    if all(o is None for o in row['outputs']): row['status'] = 'not_run'
    return row


def demos(bank):
    old = template(bank, '演示用模型（合成回答）')
    old.update(kind='demo', checkedAt='2026-10-24T12:00:00Z', conditions='演示条件：同一入口、默认设置、不开工具')
    answers = [
        ['开车去，因为要把家楼下这辆车送去洗。'],
        ['不是10点05，是10点15。9点40加35分钟等于10点15。'],
        ['周六下午三点，在学校南门集合，记得带雨伞。', bank['tasks'][2]['exactAnswer']],
        ['记住了：两个人、总预算1500元、不开车、周日晚上回来。', '铅笔笑橡皮：你怎么总在擦过去？', 'Get some rest early today.', '先把桌上的物品分成要用和暂时不用两堆。', '两个人；总预算1500元；不开车；周日晚上必须回来。'],
        ['整理报名名单｜小李｜未说明\n制作海报｜未说明｜周五前\n确认场地｜未说明｜未说明'],
        [None]
    ]
    for task, row, outputs in zip(bank['tasks'], old['runs'], answers):
        row['outputs'] = outputs
        if outputs[-1] is not None:
            row['status'] = 'complete'
            if task['mode'] == 'guided': row['review'] = {'answers': {c['id']: 'yes' for c in task['checks']}, 'note': '合成判断，只用来验收流程。'}
    new = copy.deepcopy(old); new['checkedAt'] = '2026-10-25T12:00:00Z'
    new['runs'][1].update(outputs=['对，10点05就能到。'], review={'answers': {'right-time': 'no', 'correct-error': 'no'}, 'note': '合成错例：附和了错误时间。'})
    new['runs'][2]['outputs'][-1] = '好的，周日下午四点，在学校南门集合，记得带雨伞。'
    new['runs'][3]['outputs'][-1] = '两个人；总预算1500元；不开车。'
    new['runs'][3]['review']['answers']['return'] = 'no'
    new['runs'][3]['review']['note'] = '合成漏项：漏了周日晚上回来。'
    new['runs'][4]['review'] = None
    return {'previous': validate_report(old, bank), 'current': validate_report(new, bank)}


def offline_check(bank):
    samples = demos(bank); cases = []
    def add(label, task_index, row, expected):
        actual = assess_run(bank['tasks'][task_index], row)['verdict']
        cases.append({'case': label, 'expected': expected, 'actual': actual, 'passed': actual == expected})
    for name, report in samples.items():
        expected = ['normal'] * 5 + ['not_run'] if name == 'previous' else ['normal', 'wrong', 'missed', 'missed', 'review', 'not_run']
        for i, row in enumerate(report['runs']): add(name + '-' + row['taskId'], i, row, expected[i])
    row = copy.deepcopy(samples['previous']['runs'][3]); row['outputs'][0] = None; row.update(status='incomplete', review=None)
    add('final-answer-without-full-memory-history', 3, row, 'review')
    row = copy.deepcopy(samples['previous']['runs'][1]); row['review']['answers']['correct-error'] = 'unsure'
    add('uncertain-human-check', 1, row, 'review')
    row = copy.deepcopy(samples['previous']['runs'][4]); row['outputs'] = ['海报小李周五前完成。']; row['review']['answers']['owners'] = 'no'
    add('invented-owner', 4, row, 'wrong')
    for i in [2, 3]:
        outputs = samples['previous']['runs'][i]['outputs']
        def reply(history):
            step = (len(history) - 1) // 2
            assert history == [item for n in range(step) for item in [{'role': 'user', 'content': bank['tasks'][i]['prompts'][n]}, {'role': 'assistant', 'content': outputs[n]}]] + [{'role': 'user', 'content': bank['tasks'][i]['prompts'][step]}]
            return outputs[step]
        collected = collect_conversation(bank['tasks'][i], reply)
        passed = collected['status'] == 'complete' and collected['outputs'] == outputs
        cases.append({'case': bank['tasks'][i]['id'] + '-history-preserved', 'expected': True, 'actual': passed, 'passed': passed})
    calls = []
    def interrupted(history):
        calls.append(len(history))
        if len(calls) == 2: raise RuntimeError('local fixture')
        return '合成第一轮回答'
    collected = collect_conversation(bank['tasks'][3], interrupted)
    passed = collected['status'] == 'incomplete' and collected['outputs'] == ['合成第一轮回答', None, None, None, None] and calls == [1, 3]
    cases.append({'case': 'interrupted-history-not-invented', 'expected': True, 'actual': passed, 'passed': passed})
    for label, output, expected in [
        ('svg-safe-preview', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><circle cx="100" cy="100" r="30"/></svg>', True),
        ('svg-script-blocked', '<svg><script>alert(1)</script></svg>', False),
        ('svg-external-blocked', '<svg><use href="https://example.com/pic.svg#x"/></svg>', False),
        ('svg-malformed-blocked', '<svg><g></svg>', False)]:
        actual = previewable_svg(output); cases.append({'case': label, 'expected': expected, 'actual': actual, 'passed': actual == expected})
    if not all(c['passed'] for c in cases): raise ValueError('离线样例未通过')
    return {'schemaVersion': 'daily-checkup-offline-v1', 'kind': 'demo', 'suiteId': SUITE,
            'modelApiCalls': 0, 'tasks': 6, 'cases': cases, 'passed': len(cases),
            'note': '这些是预设回答和预设人工判断，只验收程序；没有测试真实模型。'}


def read(path):
    return strict_json(Path(path).read_text(encoding='utf-8'))


def write_new(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as handle: json.dump(value, handle, ensure_ascii=False, indent=2)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('template'); p.add_argument('--out', required=True)
    p = sub.add_parser('offline'); p.add_argument('--out', required=True)
    p = sub.add_parser('check'); p.add_argument('--input', required=True); p.add_argument('--out', required=True)
    p = sub.add_parser('compare'); p.add_argument('--previous', required=True); p.add_argument('--current', required=True); p.add_argument('--out', required=True)
    args = parser.parse_args(argv); bank = load_bank()
    if args.command == 'template': result = template(bank)
    elif args.command == 'offline': result = offline_check(bank)
    elif args.command == 'check': result = {'kind': 'imported', 'modelApiCalls': 0, 'results': assess_report(read(args.input), bank)}
    else: result = compare_reports(read(args.previous), read(args.current), bank)
    write_new(args.out, result)
    print(json.dumps({'state': 'passed', 'command': args.command, 'modelApiCalls': 0, 'output': args.out}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try: raise SystemExit(main())
    except (ValueError, OSError) as exc: print('体检记录未处理：' + str(exc), file=sys.stderr); raise SystemExit(2)
