"""Zero-network V2 fixture acceptance and safe public demo evidence."""
import copy
import datetime as dt
from pathlib import Path
from .challenge_bank import SUITE, validate_bank, write_json
from .challenge_scoring import PROTOCOL, assess, apply_review, validate_assessment, guard


def _expected_matches(assessment, expected):
    for key, value in expected.items():
        actual = assessment[key]
        if key == 'contentScore' and actual is not None and value is not None:
            if abs(actual - value) > 1e-8: return False
        elif type(actual) is not type(value) or actual != value:
            return False
    return True


def run_check(bank, destination=None):
    validate_bank(bank)
    results = []
    passed = failed = count = sealed_count = 0
    for task in bank['tasks']:
        for fixture in task['fixtures']:
            request_status = fixture.get('status', 'success')
            if fixture.get('review'):
                assessment = apply_review(fixture['output'], task['grader'], task['id'], fixture['review'], request_status)
            else:
                assessment = assess(fixture['output'], task['grader'], task['id'], request_status)
            validate_assessment(assessment, fixture['output'], task['grader'], task['id'], request_status)
            ok = _expected_matches(assessment, fixture['expect'])
            count += 1; passed += int(ok); failed += int(not ok)
            if task['pool'] == 'sealed':
                sealed_count += 1
                continue
            results.append({'taskId': task['id'], 'fixtureName': fixture['name'], 'requestStatus': request_status,
                            'output': fixture['output'], 'assessment': assessment,
                            'expected': copy.deepcopy(fixture['expect']), 'passed': ok})
    summary = {'tasksChecked': len(bank['tasks']), 'fixturesChecked': count, 'passed': passed, 'failed': failed,
               'developmentTasks': sum(t['pool'] == 'development' for t in bank['tasks']),
               'sealedTasks': sum(t['pool'] == 'sealed' for t in bank['tasks']),
               'automaticTasks': sum(t['grader']['kind'] == 'json' for t in bank['tasks']),
               'manualTasks': sum(t['grader']['kind'] == 'manual' for t in bank['tasks']),
               'codeTasks': sum(t['grader']['kind'] == 'code' for t in bank['tasks']),
               'publicFixtures': len(results), 'sealedFixtures': sealed_count}
    report = {'schemaVersion': 'challenge-offline-v2', 'suiteId': SUITE, 'protocolId': PROTOCOL,
              'dataKind': 'demo', 'externalApiCalls': 0, 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'summary': summary, 'results': results}
    if destination is not None:
        destination = Path(destination)
        destination.mkdir(parents=True, exist_ok=False)
        write_json(destination / 'public.json', report)
        write_json(destination / 'acceptance.json', {'suiteId': SUITE, 'protocolId': PROTOCOL, 'dataKind': 'demo', 'externalApiCalls': 0, 'summary': summary})
    return report


def validate_report(report, bank):
    """Recompute public fixtures; sealed aggregate claims need the full local bank."""
    validate_bank(bank)
    guard(report)
    required = {'schemaVersion', 'suiteId', 'protocolId', 'dataKind', 'externalApiCalls', 'generatedAt', 'summary', 'results'}
    if not isinstance(report, dict) or set(report) != required or report['schemaVersion'] != 'challenge-offline-v2' or report['suiteId'] != SUITE or report['protocolId'] != PROTOCOL or report['dataKind'] != 'demo' or type(report['externalApiCalls']) is not int or report['externalApiCalls'] != 0:
        raise ValueError('Invalid zero-network demo report')
    try:
        generated = dt.datetime.fromisoformat(report['generatedAt'].replace('Z', '+00:00'))
        if generated.tzinfo is None: raise ValueError('Timezone required')
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError('Invalid report timestamp') from exc
    tasks = {t['id']: t for t in bank['tasks'] if t['pool'] == 'development'}
    if not isinstance(report['results'], list) or len(report['results']) > 50000:
        raise ValueError('Invalid report result list')
    seen = set()
    for row in report['results']:
        if not isinstance(row, dict) or set(row) != {'taskId', 'fixtureName', 'requestStatus', 'output', 'assessment', 'expected', 'passed'}:
            raise ValueError('Unexpected result fields')
        if row['taskId'] not in tasks:
            raise ValueError('Sealed or unknown result cannot be published')
        task = tasks[row['taskId']]
        key = row['taskId'], row['fixtureName']
        if key in seen: raise ValueError('Duplicate fixture result')
        seen.add(key)
        fixture = next((f for f in task['fixtures'] if f['name'] == row['fixtureName']), None)
        if fixture is None: raise ValueError('Unknown fixture identity')
        if row['output'] != fixture['output'] or row['expected'] != fixture['expect'] or row['requestStatus'] != fixture.get('status', 'success'):
            raise ValueError('Fixture evidence differs from frozen local bank')
        if row['assessment'].get('review') != fixture.get('review'):
            raise ValueError('Fixture review differs from frozen local bank')
        validate_assessment(row['assessment'], row['output'], task['grader'], task['id'], row['requestStatus'])
        if type(row['passed']) is not bool or row['passed'] != _expected_matches(row['assessment'], row['expected']):
            raise ValueError('Fixture acceptance flag contradicts assessment')
    expected_rows = {(t['id'], f['name']) for t in tasks.values() for f in t['fixtures']}
    if seen != expected_rows: raise ValueError('Public report omits development fixtures')
    summary = report['summary']
    keys = {'tasksChecked', 'fixturesChecked', 'passed', 'failed', 'developmentTasks', 'sealedTasks', 'automaticTasks', 'manualTasks', 'codeTasks', 'publicFixtures', 'sealedFixtures'}
    if not isinstance(summary, dict) or set(summary) != keys or any(type(v) is not int or v < 0 for v in summary.values()):
        raise ValueError('Invalid offline summary')
    if summary['tasksChecked'] != summary['developmentTasks'] + summary['sealedTasks'] or summary['tasksChecked'] != summary['automaticTasks'] + summary['manualTasks'] + summary['codeTasks'] or summary['fixturesChecked'] != summary['passed'] + summary['failed'] or summary['fixturesChecked'] != summary['publicFixtures'] + summary['sealedFixtures'] or summary['publicFixtures'] != len(report['results']) or summary['developmentTasks'] != len(tasks):
        raise ValueError('Offline summary contradicts coverage')
    if len(bank['tasks']) == summary['tasksChecked']:
        expected_report = run_check(bank)
        if summary != expected_report['summary']:
            raise ValueError('Summary contradicts local bank recomputation')
    else:
        public_passed = sum(row['passed'] for row in report['results'])
        public_failed = len(report['results']) - public_passed
        if summary['passed'] < public_passed or summary['failed'] < public_failed:
            raise ValueError('Summary omits known public outcomes')
    return report
