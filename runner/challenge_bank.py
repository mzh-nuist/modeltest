"""Private V2 bank validation and public projection with sealed-data boundaries."""
import copy
import datetime as dt
import json
from pathlib import Path, PurePosixPath
import re
from urllib.parse import urlsplit
from .challenge_scoring import PROTOCOL, MAX_TEXT, guard, strict_json, validate_grader, _string

SUITE = 'zhufeng-challenge-v2'
ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {'m': 'math', 'c': 'code', 'd': 'data', 'i': 'instruction', 'l': 'longcontext', 'w': 'chinese', 'v': 'visual'}
SIZES = {'m': 16, 'c': 16, 'd': 12, 'i': 10, 'l': 10, 'w': 4, 'v': 4}
DEV_SIZES = {'m': 6, 'c': 6, 'd': 4, 'i': 3, 'l': 3, 'w': 1, 'v': 1}
EXPECTED_IDS = {f'v2-{prefix}{i:02}' for prefix, n in SIZES.items() for i in range(1, n + 1)}
DEVELOPMENT_IDS = {f'v2-{prefix}{i:02}' for prefix, n in DEV_SIZES.items() for i in range(1, n + 1)}
COMMON = ('id', 'title', 'category', 'familyId', 'pool', 'difficulty', 'status', 'source', 'rubric', 'verification')


def read_json(path):
    path = Path(path)
    if not path.is_file() or path.stat().st_size > 100_000_000:
        raise ValueError('Missing JSON file or file exceeds 100 MB')
    return strict_json(path.read_text(encoding='utf-8'))


def write_json(path, value, overwrite=False):
    guard(value)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    with path.open('w' if overwrite else 'x', encoding='utf-8', newline='\n') as stream:
        stream.write(text)


def _asset_path(name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name or '\x00' in name:
        raise ValueError('Asset path must be a safe relative POSIX path')
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {'.', '..'} for part in name.split('/')) or name.startswith('/'):
        raise ValueError('Unsafe asset path')


def _source(source):
    if not isinstance(source, dict) or set(source) != {'name', 'url', 'note'}:
        raise ValueError('Invalid source metadata')
    _string(source['name'], 'source name')
    _string(source['note'], 'source note')
    if source['url'] is not None:
        if not isinstance(source['url'], str): raise ValueError('Invalid source URL')
        parsed = urlsplit(source['url'])
        if parsed.scheme not in {'http', 'https'} or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError('Unsafe source URL')


def validate_task(task, full=True):
    if not isinstance(task, dict):
        raise ValueError('Task must be an object')
    guard(task)
    for key in ('id', 'title', 'category', 'familyId', 'pool', 'difficulty', 'status'):
        _string(task.get(key), 'task ' + key, 1000)
    match = re.fullmatch(r'v2-([mcdilwv])(\d{2})', task['id'])
    if not match or task['id'] not in EXPECTED_IDS or CATEGORIES[match[1]] != task['category']:
        raise ValueError('Unknown task id or category')
    pool = 'development' if task['id'] in DEVELOPMENT_IDS else 'sealed'
    if task['pool'] != pool or task['status'] != 'uncalibrated':
        raise ValueError('Task pool or calibration state mismatch')
    if task['difficulty'] not in {'candidate-medium', 'candidate-hard', 'candidate-frontier'}:
        raise ValueError('Only candidate difficulty labels are supported')
    _source(task.get('source'))
    if not isinstance(task.get('rubric'), list) or not task['rubric']:
        raise ValueError('Human-readable rubric required')
    for item in task['rubric']:
        _string(item, 'rubric item')
    v = task.get('verification')
    if not isinstance(v, dict) or type(v.get('independentCheck')) is not bool:
        raise ValueError('Verification status required')
    for key in ('method', 'notes'):
        _string(v.get(key), 'verification ' + key, MAX_TEXT)
    if not full:
        return task
    _string(task.get('prompt'), 'complete task prompt', MAX_TEXT)
    _string(task.get('reference'), 'reference answer', MAX_TEXT)
    validate_grader(task.get('grader'))
    if task['category'] == 'code' and task['grader']['kind'] != 'code':
        raise ValueError('Code task must preserve isolated-execution block')
    if task['grader']['kind'] == 'code' and task['category'] != 'code':
        raise ValueError('Code grader category mismatch')
    if 'assets' in task:
        if not isinstance(task['assets'], list) or len(task['assets']) > 100:
            raise ValueError('Invalid asset list')
        names = []
        for a in task['assets']:
            if not isinstance(a, dict) or set(a) != {'path', 'content'}:
                raise ValueError('Invalid supplied file')
            _asset_path(a['path']); _string(a['content'], 'asset content', MAX_TEXT)
            names.append(a['path'])
        if len(names) != len(set(names)):
            raise ValueError('Duplicate asset paths')
    if 'messages' in task:
        if not isinstance(task['messages'], list) or not 1 <= len(task['messages']) <= 30:
            raise ValueError('Invalid fixed-history messages')
        for message in task['messages']:
            if not isinstance(message, dict) or set(message) != {'role', 'content'} or message['role'] not in {'system', 'user', 'assistant'}:
                raise ValueError('Invalid fixed-history message')
            _string(message['content'], 'message content', MAX_TEXT)
    fixtures = task.get('fixtures')
    if not isinstance(fixtures, list) or not fixtures or len(fixtures) > 100:
        raise ValueError('Offline answer fixtures required')
    names = []
    for f in fixtures:
        if not isinstance(f, dict) or not {'name', 'output', 'expect'}.issubset(f) or set(f) - {'name', 'output', 'expect', 'review', 'status'}:
            raise ValueError('Invalid fixture fields')
        _string(f['name'], 'fixture name', 200)
        if not isinstance(f['output'], str) or len(f['output']) > MAX_TEXT:
            raise ValueError('Invalid fixture output')
        expect = f['expect']
        if not isinstance(expect, dict) or set(expect) != {'contentScore', 'formatPassed', 'strictPassed', 'contentState'}:
            raise ValueError('Fixture must declare all four expected results')
        if type(expect['formatPassed']) is not bool or expect['strictPassed'] is not None and type(expect['strictPassed']) is not bool:
            raise ValueError('Invalid fixture expectation flags')
        if expect['contentScore'] is not None and (isinstance(expect['contentScore'], bool) or not isinstance(expect['contentScore'], (int, float)) or not 0 <= expect['contentScore'] <= 100):
            raise ValueError('Invalid fixture expected score')
        if expect['contentState'] not in {'scored', 'unscorable', 'pending', 'blocked', 'not_applicable'}:
            raise ValueError('Invalid fixture expected content state')
        if 'review' in f and (not isinstance(f['review'], dict) or f['review'].get('synthetic') is not True):
            raise ValueError('Fixture reviews must explicitly be synthetic')
        names.append(f['name'])
    if len(names) != len(set(names)):
        raise ValueError('Duplicate fixture names')
    if task['grader']['kind'] == 'json' and len(fixtures) < 2:
        raise ValueError('Automatic tasks need positive and targeted negative fixtures')
    return task


def validate_bank(bank, require_complete=False):
    guard(bank)
    if not isinstance(bank, dict) or bank.get('schemaVersion') != 'challenge-bank-v2' or bank.get('suiteId') != SUITE or bank.get('protocolId') != PROTOCOL:
        raise ValueError('Invalid V2 bank envelope')
    if not isinstance(bank.get('tasks'), list) or not 1 <= len(bank['tasks']) <= 72:
        raise ValueError('Bank requires 1..72 candidate tasks')
    ids = []
    for task in bank['tasks']:
        validate_task(task)
        ids.append(task['id'])
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate task id')
    if require_complete and set(ids) != EXPECTED_IDS:
        raise ValueError('Full bank must contain all 72 planned candidate tasks')
    return bank


def load_bank(path=None, require_complete=False):
    if path is None:
        private = ROOT / 'private/challenge-v2/bank.json'
        path = private if private.is_file() else ROOT / 'datasets/challenge_dev_v2.json'
    bank = read_json(path)
    return validate_bank(bank, require_complete)


def _public_task(task):
    if task['pool'] == 'sealed':
        result = {key: copy.deepcopy(task[key]) for key in ('id', 'title', 'category', 'familyId', 'pool', 'difficulty', 'status')}
        result['source'] = {'name': '逐风自编挑战题库', 'url': None, 'note': '本站题目；不代表官方 benchmark 复现成绩。'}
        result['rubric'] = ['内容完成度、必要输出合同、严格完成分别报告。', '详细题面、答案、测试及评分证据留在本地封存包。']
        result['verification'] = {'method': 'sealed-local', 'notes': '封存内容不进入网站或公开源码包；区分度未实测校准。', 'independentCheck': False}
        return result
    result = {key: copy.deepcopy(task[key]) for key in COMMON}
    for key in ('prompt', 'reference', 'grader', 'messages', 'assets'):
        if key in task:
            result[key] = copy.deepcopy(task[key])
    return result


def public_catalog(bank, manifest=None):
    validate_bank(bank)
    tasks = {t['id']: _public_task(t) for t in bank['tasks']}
    if manifest is not None:
        rows = manifest.get('tasks') if isinstance(manifest, dict) else None
        if not isinstance(rows, list): raise ValueError('Invalid public manifest')
        for row in rows:
            validate_task(row, full=False)
            if row['id'] not in tasks:
                if row['pool'] != 'sealed': raise ValueError('Missing development task in fallback bank')
                tasks[row['id']] = _public_task(row)
    ordered = sorted(tasks.values(), key=lambda t: list(SIZES).index(t['id'][3]) * 100 + int(t['id'][4:]))
    counts = {'total': len(ordered), 'development': sum(t['pool'] == 'development' for t in ordered),
              'sealed': sum(t['pool'] == 'sealed' for t in ordered),
              'byCategory': {category: sum(t['category'] == category for t in ordered) for category in CATEGORIES.values()}}
    return {'schemaVersion': 'challenge-public-v2', 'suiteId': SUITE, 'protocolId': PROTOCOL,
            'meta': {'title': '挑战题库 V2 · 开发完成，待校准', 'description': '本站自编候选题库；开发样题可审阅，封存题仅展示目录。离线验收验证评分规则，不代表模型能力成绩。',
                     'updatedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'kind': 'catalog', 'realApiCalls': 0, 'calibrationState': 'uncalibrated'},
            'counts': counts, 'tasks': ordered}


def development_bank(bank):
    validate_bank(bank)
    return {'schemaVersion': 'challenge-bank-v2', 'suiteId': SUITE, 'protocolId': PROTOCOL,
            'tasks': [copy.deepcopy(t) for t in bank['tasks'] if t['pool'] == 'development']}


def public_manifest(bank):
    catalog = public_catalog(bank)
    return {'schemaVersion': 'challenge-manifest-v2', 'suiteId': SUITE, 'protocolId': PROTOCOL,
            'tasks': [{k: copy.deepcopy(t[k]) for k in COMMON} for t in catalog['tasks']]}


def validate_public_catalog(catalog):
    guard(catalog)
    if not isinstance(catalog, dict) or catalog.get('schemaVersion') != 'challenge-public-v2' or catalog.get('suiteId') != SUITE or catalog.get('protocolId') != PROTOCOL:
        raise ValueError('Invalid public challenge catalog')
    if set(catalog) != {'schemaVersion', 'suiteId', 'protocolId', 'meta', 'counts', 'tasks'}:
        raise ValueError('Unexpected catalog fields')
    if not isinstance(catalog['tasks'], list) or not 1 <= len(catalog['tasks']) <= 72:
        raise ValueError('Invalid public task count')
    ids = []
    for task in catalog['tasks']:
        validate_task(task, full=False)
        allowed = set(COMMON) | ({'prompt', 'reference', 'grader', 'messages', 'assets'} if task['pool'] == 'development' else set())
        if set(task) - allowed:
            raise ValueError('Private or unexpected field in public task')
        if task['pool'] == 'development':
            _string(task.get('prompt'), 'public prompt', MAX_TEXT)
            _string(task.get('reference'), 'public reference', MAX_TEXT)
            validate_grader(task.get('grader'))
        else:
            if task != _public_task(task):
                raise ValueError('Sealed rubric/source/verification must be redacted')
        ids.append(task['id'])
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate public task id')
    expected = {'total': len(ids), 'development': sum(t['pool'] == 'development' for t in catalog['tasks']),
                'sealed': sum(t['pool'] == 'sealed' for t in catalog['tasks']),
                'byCategory': {category: sum(t['category'] == category for t in catalog['tasks']) for category in CATEGORIES.values()}}
    if catalog['counts'] != expected:
        raise ValueError('Public counts mismatch')
    meta = catalog['meta']
    if not isinstance(meta, dict) or set(meta) != {'title', 'description', 'updatedAt', 'kind', 'realApiCalls', 'calibrationState'} or meta['kind'] != 'catalog' or type(meta['realApiCalls']) is not int or meta['realApiCalls'] != 0 or meta['calibrationState'] != 'uncalibrated':
        raise ValueError('Catalog must not claim measured or calibrated results')
    return catalog
