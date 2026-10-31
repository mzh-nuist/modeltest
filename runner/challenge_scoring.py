"""Versioned local V2 scoring. No network, model calls or submitted-code execution."""
from collections import Counter
import copy
import datetime as dt
from fractions import Fraction
import json
import math
import re
import xml.etree.ElementTree as ET

PROTOCOL = 'challenge-rubric-v2'
MAX_TEXT = 2_000_000
STATES = {'scored', 'unscorable', 'pending', 'blocked', 'not_applicable'}
TRANSPORT_STATES = {'success', 'error', 'timeout', 'truncated', 'unsupported', 'skipped', 'infrastructure_error'}
FORBIDDEN_KEYS = {'authorization', 'apikey', 'xapikey', 'accesstoken', 'refreshtoken', 'password', 'secret', 'cookie', 'cookies', 'credentials', 'credential', 'proto', 'prototype', 'constructor'}


def guard(value, depth=0):
    if depth > 40:
        raise ValueError('JSON exceeds maximum nesting depth')
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('Nonfinite JSON number')
    if type(value) in (int, float) and value == int(value) and abs(value) > 9007199254740991:
        raise ValueError('Large exact JSON integers must use rational strings')
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError('JSON object keys must be strings')
            normalized = re.sub('[^a-z0-9]', '', key.lower())
            if normalized in FORBIDDEN_KEYS:
                raise ValueError('Credential or unsafe object field is not accepted')
            guard(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            guard(item, depth + 1)
    elif value is not None and not isinstance(value, (str, bool, int, float)):
        raise ValueError('Value is not JSON data')


def strict_json(text):
    if not isinstance(text, str) or len(text) > MAX_TEXT * 50:
        raise ValueError('Invalid JSON input or size')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    def constant(_):
        raise ValueError('Nonfinite JSON constant')
    try:
        value = json.loads(text, object_pairs_hook=pairs, parse_constant=constant)
        guard(value)
        return value
    except (RecursionError, OverflowError) as exc:
        raise ValueError('JSON exceeds safe parsing limits') from exc


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ValueError('Expected a finite number or rational string')
    if isinstance(value, str) and (len(value) > 200 or not re.fullmatch(r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?(?:/[-+]?\d+)?', value)):
        raise ValueError('Invalid numeric string')
    if isinstance(value, str):
        exponent = re.search(r'[eE]([-+]?\d+)', value)
        if exponent and abs(int(exponent.group(1))) > 1000:
            raise ValueError('Numeric exponent exceeds limits')
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('Nonfinite number')
    try:
        result = Fraction(str(value))
        if result.numerator.bit_length() > 4096 or result.denominator.bit_length() > 4096:
            raise ValueError('Number exceeds limits')
        return result
    except (ValueError, ZeroDivisionError, OverflowError) as exc:
        raise ValueError('Invalid number') from exc


def _finite(value, minimum=0, maximum=None):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value >= minimum
            and (maximum is None or value <= maximum))


def _string(value, label, maximum=10000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError('Invalid ' + label)


def _path(path):
    if not isinstance(path, list) or len(path) > 30 or any(isinstance(x, bool) or not isinstance(x, (str, int)) or isinstance(x, int) and x < 0 for x in path):
        raise ValueError('Invalid JSON path')


def _keys(value, allowed, required=()):
    if not isinstance(value, dict) or set(value) - set(allowed) or not set(required).issubset(value):
        raise ValueError('Unknown or missing fields in scoring contract')


def validate_grader(g):
    guard(g)
    _keys(g, {'version', 'kind', 'format', 'checks', 'constraints', 'criteria'}, {'version', 'kind', 'format', 'checks', 'constraints', 'criteria'})
    if g['version'] != PROTOCOL or g['kind'] not in {'json', 'manual', 'code'}:
        raise ValueError('Unsupported V2 grading version or kind')
    allowed = {'json': {'json_only'}, 'manual': {'text', 'json_only', 'svg_only'}, 'code': {'code_only'}}
    if g['format'] not in allowed[g['kind']]:
        raise ValueError('Format contradicts grader kind')
    for key in ('checks', 'constraints', 'criteria'):
        if not isinstance(g[key], list) or len(g[key]) > 100:
            raise ValueError('Invalid scoring item list')
        ids = []
        for item in g[key]:
            if not isinstance(item, dict):
                raise ValueError('Scoring item must be an object')
            _string(item.get('id'), 'scoring item id', 100)
            _string(item.get('label'), 'scoring item label')
            ids.append(item['id'])
        if len(ids) != len(set(ids)) or 'output-shape' in ids:
            raise ValueError('Duplicate or reserved scoring item id')
    if g['kind'] == 'json' and (not g['checks'] or g['criteria']):
        raise ValueError('JSON grader needs content checks and no manual criteria')
    if g['kind'] != 'json' and (g['checks'] or not g['criteria']):
        raise ValueError('Manual/code grader needs criteria and no automatic checks')
    for c in g['checks']:
        _keys(c, {'id', 'label', 'path', 'op', 'expected', 'points', 'critical', 'absTolerance', 'relTolerance'}, {'id', 'label', 'path', 'op', 'expected', 'points', 'critical'})
        _path(c['path'])
        if c['op'] not in {'equals', 'number', 'set'} or not _finite(c['points'], 0.000001, 100) or not isinstance(c['critical'], bool):
            raise ValueError('Invalid content check')
        for key in ('absTolerance', 'relTolerance'):
            if not _finite(c.get(key, 0)):
                raise ValueError('Invalid numeric tolerance')
        if c['op'] == 'number':
            _number(c['expected'])
        elif c.get('absTolerance', 0) or c.get('relTolerance', 0):
            raise ValueError('Tolerances require a numeric check')
        if c['op'] == 'set' and not isinstance(c['expected'], list):
            raise ValueError('Set expected value must be a list')
    for c in g['criteria']:
        _keys(c, {'id', 'label', 'points', 'anchors', 'criticalLevel'}, {'id', 'label', 'points', 'anchors', 'criticalLevel'})
        if not _finite(c['points'], 0.000001, 100) or not isinstance(c['anchors'], list) or len(c['anchors']) != 5:
            raise ValueError('Five weighted manual anchors required')
        for anchor in c['anchors']:
            _string(anchor, 'manual anchor')
        level = c['criticalLevel']
        if level is not None and (type(level) is not int or not 0 <= level <= 4):
            raise ValueError('Invalid critical manual level')
    weighted = g['checks'] if g['kind'] == 'json' else g['criteria']
    if abs(sum(c['points'] for c in weighted) - 100) > 1e-8:
        raise ValueError('Content weights must sum to 100')
    if g['kind'] == 'json' and not any(c['critical'] for c in weighted):
        raise ValueError('At least one core content check required')
    if g['kind'] != 'json' and not any(c['criticalLevel'] is not None and c['criticalLevel'] > 0 for c in weighted):
        raise ValueError('At least one core manual threshold required')
    for c in g['constraints']:
        kind = c.get('type')
        params = {'contains': {'text'}, 'forbidden': {'text'}, 'occurrences': {'text', 'count'},
                  'characters': {'min', 'max'}, 'paragraphs': {'min', 'max'}, 'lines': {'min', 'max'}, 'paragraph_characters': {'index', 'min', 'max'},
                  'no_fence': set(), 'json_keys': {'keys', 'exact', 'path'}, 'json_type': {'path', 'valueType'}, 'json_length': {'path', 'min', 'max'}}
        if kind not in params:
            raise ValueError('Unsupported output constraint')
        _keys(c, {'id', 'label', 'type', 'required'} | params[kind], {'id', 'label', 'type', 'required'})
        if not isinstance(c['required'], bool):
            raise ValueError('Constraint required flag must be boolean')
        if kind in {'contains', 'forbidden', 'occurrences'}:
            _string(c.get('text'), 'constraint text')
        if kind == 'occurrences' and (type(c.get('count')) is not int or c['count'] < 0):
            raise ValueError('Invalid occurrence count')
        if kind in {'characters', 'paragraphs', 'lines', 'json_length', 'paragraph_characters'} and (any(type(c.get(k)) is not int or c[k] < 0 for k in ('min', 'max')) or c['min'] > c['max']):
            raise ValueError('Invalid text length range')
        if kind == 'paragraph_characters' and (type(c.get('index')) is not int or c['index'] < 0):
            raise ValueError('Paragraph index must be a nonnegative integer')
        if kind in {'json_keys', 'json_type', 'json_length'}:
            if g['format'] != 'json_only':
                raise ValueError('JSON constraint requires JSON output')
            _path(c.get('path', []))
        if kind == 'json_keys':
            if not isinstance(c.get('keys'), list) or not all(isinstance(k, str) for k in c['keys']) or len(set(c['keys'])) != len(c['keys']) or not isinstance(c.get('exact'), bool):
                raise ValueError('Invalid object-key constraint')
        if kind == 'json_type' and c.get('valueType') not in {'object', 'array', 'string', 'number', 'integer', 'boolean', 'null'}:
            raise ValueError('Invalid JSON type constraint')
    return g


def same(actual, expected):
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return _number(actual) == _number(expected)
    if isinstance(expected, dict):
        return isinstance(actual, dict) and set(actual) == set(expected) and all(same(actual[k], v) for k, v in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(actual) == len(expected) and all(same(a, b) for a, b in zip(actual, expected))
    return type(actual) is type(expected) and actual == expected


def _at(value, path):
    for part in path:
        if isinstance(part, int) and not isinstance(value, list) or isinstance(part, str) and not isinstance(value, dict):
            raise KeyError(part)
        value = value[part]
    return value


def _matches(actual, c):
    try:
        if c['op'] == 'number':
            a, b = _number(actual), _number(c['expected'])
            return abs(a - b) <= max(_number(c.get('absTolerance', 0)), _number(c.get('relTolerance', 0)) * abs(b))
        if c['op'] == 'set':
            if not isinstance(actual, list) or len(actual) != len(c['expected']):
                return False
            remaining = list(c['expected'])
            for value in actual:
                match = next((i for i, item in enumerate(remaining) if same(value, item)), None)
                if match is None:
                    return False
                remaining.pop(match)
            return not remaining
        return same(actual, c['expected'])
    except (ValueError, ZeroDivisionError, OverflowError):
        return False


def _svg_shape(text):
    if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
        return False
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return False
    allowed = {'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc', 'use'}
    if root.tag not in {'svg', '{http://www.w3.org/2000/svg}svg'}:
        return False
    for element in root.iter():
        if element.tag.startswith('{') and not element.tag.startswith('{http://www.w3.org/2000/svg}'):
            return False
        if element.tag.split('}')[-1] not in allowed:
            return False
        for key, value in element.attrib.items():
            name = key.split('}')[-1].lower()
            if name.startswith('on') or name in {'src', 'style'}:
                return False
            if name == 'href' and not re.fullmatch(r'#[A-Za-z_][\w:.-]*', value, flags=re.ASCII):
                return False
            if 'url(' in value.lower() and not re.fullmatch(r'url\(#[A-Za-z_][\w:.-]*\)', value, flags=re.ASCII):
                return False
            if 'javascript:' in value.lower() or 'data:' in value.lower():
                return False
    return True


def _constraints(output, g):
    text = output.strip()
    raw, parsed = None, False
    try:
        raw = strict_json(text)
        parsed = True
    except (ValueError, TypeError):
        pass
    shape = {'json_only': lambda: parsed,
             'text': lambda: bool(text),
             'svg_only': lambda: bool(text) and _svg_shape(text),
             'code_only': lambda: bool(text) and '```' not in text}[g['format']]()
    result = [{'id': 'output-shape', 'label': {'json_only': '整份回答为严格 JSON', 'text': '非空正文', 'svg_only': '独立静态 SVG，无外部或活动内容', 'code_only': '仅代码正文，无 Markdown 围栏'}[g['format']], 'passed': shape, 'required': True}]
    for c in g['constraints']:
        kind = c['type']
        if kind == 'contains': ok = c['text'] in output
        elif kind == 'forbidden': ok = c['text'] not in output
        elif kind == 'occurrences': ok = output.count(c['text']) == c['count']
        elif kind == 'no_fence': ok = '```' not in output
        elif kind == 'paragraph_characters':
            paragraphs = re.split(r'\n\s*\n', text) if text else []
            n = len(paragraphs[c['index']].strip().replace('\r', '').replace('\n', '')) if c['index'] < len(paragraphs) else None
            ok = n is not None and c['min'] <= n <= c['max']
        elif kind in {'characters', 'paragraphs', 'lines'}:
            n = {'characters': lambda: len(output.replace('\r', '').replace('\n', '')),
                 'paragraphs': lambda: len(re.split(r'\n\s*\n', text)) if text else 0,
                 'lines': lambda: len(text.splitlines())}[kind]()
            ok = c['min'] <= n <= c['max']
        else:
            try:
                value = _at(raw, c.get('path', []))
                if not parsed: raise KeyError('unparsed')
                if kind == 'json_keys':
                    ok = isinstance(value, dict) and (set(value) == set(c['keys']) if c['exact'] else set(c['keys']).issubset(value))
                elif kind == 'json_length':
                    ok = isinstance(value, list) and c['min'] <= len(value) <= c['max']
                else:
                    ok = {'object': lambda: isinstance(value, dict), 'array': lambda: isinstance(value, list),
                          'string': lambda: isinstance(value, str), 'number': lambda: type(value) in (int, float),
                          'integer': lambda: type(value) is int, 'boolean': lambda: type(value) is bool,
                          'null': lambda: value is None}[c['valueType']]()
            except (KeyError, IndexError, TypeError):
                ok = False
        result.append({'id': c['id'], 'label': c['label'], 'passed': bool(ok), 'required': c['required']})
    return result


def assess(output, grader, task_id, status='success'):
    validate_grader(grader)
    _string(task_id, 'task id', 100)
    if not isinstance(output, str) or len(output) > MAX_TEXT or status not in TRANSPORT_STATES:
        raise ValueError('Invalid answer or transport status')
    result = {'protocolId': PROTOCOL, 'taskId': task_id, 'status': 'not_applicable', 'contentState': 'not_applicable',
              'contentScore': None, 'formatPassed': False, 'strictPassed': False, 'checks': [], 'constraints': [],
              'reason': '请求未完整成功；不对不完整输出评分。'}
    if status != 'success':
        return result
    constraints = _constraints(output, grader)
    result.update(constraints=constraints, formatPassed=all(c['passed'] for c in constraints if c['required']))
    if grader['kind'] == 'code':
        result.update(status='blocked', contentState='blocked', strictPassed=None,
                      reason='未验收代码隔离执行环境；保留格式结果，不执行提交，不发布 pass@1。')
        return result
    if grader['kind'] == 'manual':
        result.update(status='pending', contentState='pending', strictPassed=None,
                      reason='等待依据五档量表逐项复核；不自动推断语义或视觉质量。')
        return result
    candidate = output.strip()
    fence = re.fullmatch(r'```(?:json)?[ \t]*\r?\n(.*?)\r?\n```', candidate, re.S)
    if fence:
        candidate = fence.group(1).strip()
    try:
        raw = strict_json(candidate)
    except (ValueError, TypeError):
        result.update(status='failed', contentState='unscorable', reason='无法按声明规则解析内容；不猜测或自动修复答案。')
        return result
    checks = []
    for c in grader['checks']:
        try:
            ok = _matches(_at(raw, c['path']), c)
        except (KeyError, IndexError, TypeError):
            ok = False
        checks.append({'id': c['id'], 'label': c['label'], 'points': c['points'], 'earned': c['points'] if ok else 0,
                       'passed': ok, 'critical': c['critical']})
    strict = result['formatPassed'] and all(c['passed'] for c in checks if c['critical'])
    result.update(status='passed' if strict else 'failed', contentState='scored', contentScore=sum(c['earned'] for c in checks),
                  strictPassed=strict, checks=checks, reason='内容分、必要输出合同与严格完成分别计算；未做模型难度校准。')
    return result


def apply_review(output, grader, task_id, review, status='success'):
    base = assess(output, grader, task_id, status)
    if grader['kind'] != 'manual' or status != 'success':
        raise ValueError('Only complete manual tasks accept rubric reviews; code remains blocked')
    guard(review)
    _keys(review, {'reviewer', 'reviewedAt', 'items', 'synthetic'}, {'reviewer', 'reviewedAt', 'items'})
    _string(review['reviewer'], 'reviewer alias', 100)
    _string(review['reviewedAt'], 'review timestamp', 100)
    try:
        when = dt.datetime.fromisoformat(review['reviewedAt'].replace('Z', '+00:00'))
        if when.tzinfo is None: raise ValueError('Review timestamp requires a timezone')
    except (ValueError, TypeError) as exc:
        raise ValueError('Invalid review timestamp') from exc
    if 'synthetic' in review and type(review['synthetic']) is not bool:
        raise ValueError('Synthetic review flag must be boolean')
    items = review['items']
    if not isinstance(items, list) or len(items) != len(grader['criteria']):
        raise ValueError('Every criterion needs one review')
    by_id = {}
    for item in items:
        _keys(item, {'id', 'level', 'evidence'}, {'id', 'level', 'evidence'})
        _string(item['id'], 'review criterion id', 100)
        _string(item['evidence'], 'review evidence', 4000)
        if item['id'] in by_id or type(item['level']) is not int or not 0 <= item['level'] <= 4:
            raise ValueError('Duplicate criterion or invalid anchored level')
        by_id[item['id']] = item
    if set(by_id) != {c['id'] for c in grader['criteria']}:
        raise ValueError('Review criterion set mismatch')
    checks = []
    for c in grader['criteria']:
        item = by_id[c['id']]
        critical = c['criticalLevel'] is not None
        ok = item['level'] >= c['criticalLevel'] if critical else item['level'] == 4
        checks.append({'id': c['id'], 'label': c['label'], 'points': c['points'], 'earned': c['points'] * item['level'] / 4,
                       'passed': ok, 'critical': critical})
    strict = base['formatPassed'] and all(c['passed'] for c in checks if c['critical'])
    base.update(contentState='scored', contentScore=sum(c['earned'] for c in checks), status='passed' if strict else 'failed',
                strictPassed=strict, checks=checks, review=copy.deepcopy(review), reason='逐项五档复核记录；提交者身份及判断不由系统认证。')
    return base


def validate_assessment(result, output=None, grader=None, task_id=None, status='success'):
    guard(result)
    _keys(result, {'protocolId', 'taskId', 'status', 'contentState', 'contentScore', 'formatPassed', 'strictPassed', 'checks', 'constraints', 'review', 'reason'},
          {'protocolId', 'taskId', 'status', 'contentState', 'contentScore', 'formatPassed', 'strictPassed', 'checks', 'constraints', 'reason'})
    if result['protocolId'] != PROTOCOL or result['contentState'] not in STATES or result['status'] not in {'passed', 'failed', 'pending', 'blocked', 'not_applicable'}:
        raise ValueError('Invalid assessment protocol or state')
    _string(result['taskId'], 'task id', 100)
    _string(result['reason'], 'assessment reason')
    if type(result['formatPassed']) is not bool or result['strictPassed'] is not None and type(result['strictPassed']) is not bool:
        raise ValueError('Invalid assessment flags')
    if result['contentScore'] is not None and not _finite(result['contentScore'], 0, 100):
        raise ValueError('Invalid 0..100 score')
    if not isinstance(result['checks'], list) or not isinstance(result['constraints'], list):
        raise ValueError('Missing assessment detail lists')
    check_ids = set()
    for c in result['checks']:
        _keys(c, {'id', 'label', 'points', 'earned', 'passed', 'critical'}, {'id', 'label', 'points', 'earned', 'passed', 'critical'})
        _string(c['id'], 'assessment check id', 100); _string(c['label'], 'assessment check label')
        if c['id'] in check_ids or type(c['passed']) is not bool or type(c['critical']) is not bool or not _finite(c['points'], .000001, 100) or not _finite(c['earned'], 0, c['points']):
            raise ValueError('Invalid assessment content check')
        check_ids.add(c['id'])
    constraint_ids = set()
    for c in result['constraints']:
        _keys(c, {'id', 'label', 'passed', 'required'}, {'id', 'label', 'passed', 'required'})
        _string(c['id'], 'assessment constraint id', 100); _string(c['label'], 'assessment constraint label')
        if c['id'] in constraint_ids or type(c['passed']) is not bool or type(c['required']) is not bool:
            raise ValueError('Invalid assessment output constraint')
        constraint_ids.add(c['id'])
    state = result['contentState']
    if state == 'not_applicable':
        if result['status'] != 'not_applicable' or result['contentScore'] is not None or result['strictPassed'] is not False or result['formatPassed'] or result['checks'] or result['constraints'] or 'review' in result:
            raise ValueError('Incomplete transport cannot have assessed quality')
    else:
        if not result['constraints'] or result['constraints'][0]['id'] != 'output-shape' or not result['constraints'][0]['required'] or result['formatPassed'] != all(c['passed'] for c in result['constraints'] if c['required']):
            raise ValueError('Output contract aggregate mismatch')
        if state in {'pending', 'blocked'} and (result['status'] != state or result['contentScore'] is not None or result['strictPassed'] is not None or result['checks'] or 'review' in result):
            raise ValueError('Pending or blocked quality cannot contain completed scores')
        if state == 'unscorable' and (result['status'] != 'failed' or result['contentScore'] is not None or result['strictPassed'] is not False or result['checks'] or 'review' in result):
            raise ValueError('Unscorable result cannot contain completed scores')
        if state == 'scored':
            checks = result['checks']
            if not checks or abs(sum(c['points'] for c in checks) - 100) > 1e-8 or result['contentScore'] is None or abs(sum(c['earned'] for c in checks) - result['contentScore']) > 1e-8:
                raise ValueError('Content score contradicts item weights')
            strict = result['formatPassed'] and all(c['passed'] for c in checks if c['critical'])
            if result['strictPassed'] is not strict or result['status'] != ('passed' if strict else 'failed'):
                raise ValueError('Strict completion contradicts item checks')
    if output is not None and grader is not None:
        expected = (apply_review(output, grader, task_id or result['taskId'], result['review'], status)
                    if 'review' in result else assess(output, grader, task_id or result['taskId'], status))
        actual = dict(result)
        actual.pop('reason'); expected.pop('reason')
        if actual != expected:
            raise ValueError('Assessment contradicts deterministic recomputation')
    return result
