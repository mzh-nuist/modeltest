"""Challenge V2: local offline acceptance, saved-answer grading and manual review. No API command exists."""
import argparse
import copy
import datetime as dt
import json
from pathlib import Path
import re
import sys
from .challenge_bank import ROOT, SUITE, load_bank, read_json, write_json, public_catalog, validate_bank
from .challenge_scoring import PROTOCOL, assess, apply_review, validate_assessment, guard, _string, TRANSPORT_STATES
from .challenge_offline import run_check, validate_report


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def grade_responses(bank, document):
    validate_bank(bank); guard(document)
    if not isinstance(document, dict) or document.get('schemaVersion') != 'challenge-responses-v2' or set(document) - {'schemaVersion', 'suiteId', 'protocolId', 'sourceLabel', 'responses'}:
        raise ValueError('Invalid saved-response envelope')
    if document.get('suiteId', SUITE) != SUITE or document.get('protocolId', PROTOCOL) != PROTOCOL:
        raise ValueError('Saved response protocol mismatch')
    responses = document.get('responses')
    if not isinstance(responses, list) or not 1 <= len(responses) <= 50000:
        raise ValueError('Saved responses must be a nonempty list')
    source = document.get('sourceLabel', '本地导入答卷；来源与模型身份未经系统认证。')
    _string(source, 'source label', 1000)
    tasks = {t['id']: t for t in bank['tasks']}; ids = set(); results = []
    for response in responses:
        if not isinstance(response, dict) or set(response) - {'id', 'taskId', 'output', 'status'} or not {'id', 'taskId', 'output'}.issubset(response):
            raise ValueError('Invalid saved response fields')
        ident = response['id']
        if not isinstance(ident, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,120}', ident) or ident in ids:
            raise ValueError('Response ids must be unique safe identifiers')
        ids.add(ident)
        task = tasks.get(response['taskId'])
        if task is None: raise ValueError('Unknown saved-response task')
        status = response.get('status', 'success')
        assessment = assess(response['output'], task['grader'], task['id'], status)
        results.append({'id': ident, 'taskId': task['id'], 'output': response['output'], 'requestStatus': status, 'assessment': assessment})
    return {'schemaVersion': 'challenge-results-v2', 'suiteId': SUITE, 'protocolId': PROTOCOL, 'dataKind': 'imported',
            'generatedAt': now(), 'sourceLabel': source, 'results': results}


def validate_results(document, bank):
    validate_bank(bank); guard(document)
    keys = {'schemaVersion', 'suiteId', 'protocolId', 'dataKind', 'generatedAt', 'sourceLabel', 'results'}
    if not isinstance(document, dict) or set(document) != keys or document['schemaVersion'] != 'challenge-results-v2' or document['suiteId'] != SUITE or document['protocolId'] != PROTOCOL or document['dataKind'] != 'imported':
        raise ValueError('Invalid imported result envelope')
    _string(document['sourceLabel'], 'source label', 1000)
    try:
        when = dt.datetime.fromisoformat(document['generatedAt'].replace('Z', '+00:00'))
        if when.tzinfo is None: raise ValueError('Timestamp needs timezone')
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError('Invalid result timestamp') from exc
    if not isinstance(document['results'], list) or len(document['results']) > 50000:
        raise ValueError('Invalid result list')
    tasks = {t['id']: t for t in bank['tasks']}; ids = set()
    for row in document['results']:
        if not isinstance(row, dict) or set(row) != {'id', 'taskId', 'output', 'requestStatus', 'assessment'}:
            raise ValueError('Unexpected result fields')
        if not isinstance(row['id'], str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,120}', row['id']) or row['id'] in ids:
            raise ValueError('Duplicate or invalid result id')
        ids.add(row['id'])
        task = tasks.get(row['taskId'])
        if task is None: raise ValueError('Unknown result task')
        validate_assessment(row['assessment'], row['output'], task['grader'], task['id'], row['requestStatus'])
    return document


def export_results(document, bank):
    validate_results(document, bank)
    allowed = {t['id'] for t in bank['tasks'] if t['pool'] == 'development'}
    public = copy.deepcopy(document)
    public['results'] = [r for r in public['results'] if r['taskId'] in allowed]
    return public


def review_results(document, bank, response_id, review):
    validate_results(document, bank)
    result = copy.deepcopy(document)
    row = next((r for r in result['results'] if r['id'] == response_id), None)
    if row is None: raise ValueError('Unknown response id')
    if 'review' in row['assessment']:
        raise ValueError('Review already present; retain the original and create an independent review record')
    task = next(t for t in bank['tasks'] if t['id'] == row['taskId'])
    row['assessment'] = apply_review(row['output'], task['grader'], task['id'], review, row['requestStatus'])
    result['generatedAt'] = now()
    validate_results(result, bank)
    return result


def _safe_result_destination(path, document, bank):
    sealed = {t['id'] for t in bank['tasks'] if t['pool'] == 'sealed'}
    if any(r['taskId'] in sealed for r in document['results']):
        target = Path(path).resolve()
        private_root = (ROOT / 'private').resolve()
        if not target.is_relative_to(private_root):
            raise ValueError('Sealed responses must remain inside the local private directory; use export to redact them')
    return path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('offline', 'validate-bank', 'catalog', 'grade', 'review-template', 'review', 'export', 'validate-results', 'validate-offline'):
        p = sub.add_parser(name); p.add_argument('--bank')
        if name in {'offline', 'catalog', 'grade', 'review-template', 'review', 'export'}:
            p.add_argument('--out', required=True)
        if name == 'grade': p.add_argument('--responses', required=True)
        if name == 'review-template': p.add_argument('--task-id', required=True)
        if name in {'review', 'export', 'validate-results'}: p.add_argument('--results', required=True)
        if name == 'review':
            p.add_argument('--response-id', required=True); p.add_argument('--review', required=True)
        if name == 'validate-offline': p.add_argument('--report', required=True)
        if name == 'validate-bank': p.add_argument('--complete', action='store_true')
    args = parser.parse_args(argv)
    try:
        bank = load_bank(args.bank, getattr(args, 'complete', False))
        if args.command == 'offline':
            report = run_check(bank, args.out)
            validate_report(report, bank)
            print(json.dumps(report['summary'], ensure_ascii=False))
            return 1 if report['summary']['failed'] else 0
        if args.command == 'validate-bank':
            print(json.dumps({'valid': True, 'tasks': len(bank['tasks']), 'externalApiCalls': 0}))
        elif args.command == 'catalog':
            manifest_file = ROOT / 'datasets/challenge_manifest_v2.json'
            manifest = read_json(manifest_file) if len(bank['tasks']) < 72 and manifest_file.is_file() else None
            write_json(args.out, public_catalog(bank, manifest))
        elif args.command == 'grade':
            result = grade_responses(bank, read_json(args.responses))
            write_json(_safe_result_destination(args.out, result, bank), result)
            print('Local answers graded; imported evidence is not authenticated model measurement.')
        elif args.command == 'review-template':
            task = next((t for t in bank['tasks'] if t['id'] == args.task_id), None)
            if task is None or task['grader']['kind'] != 'manual': raise ValueError('Only manual tasks have review templates')
            # Do not expose sealed anchors through arbitrary output paths.
            dummy = {'results': [{'taskId': task['id']}]}
            _safe_result_destination(args.out, dummy, bank)
            template = {'reviewer': '', 'reviewedAt': now(), 'items': [{'id': c['id'], 'level': None, 'evidence': ''} for c in task['grader']['criteria']]}
            write_json(args.out, template)
        elif args.command == 'review':
            result = review_results(read_json(args.results), bank, args.response_id, read_json(args.review))
            write_json(_safe_result_destination(args.out, result, bank), result)
            print('Anchored review saved separately; original evidence retained.')
        elif args.command == 'export':
            result = export_results(read_json(args.results), bank)
            write_json(args.out, result)
            print('Only development-task answers exported; sealed responses removed.')
        elif args.command == 'validate-results':
            validate_results(read_json(args.results), bank); print('Result checks agree with local recomputation.')
        elif args.command == 'validate-offline':
            validate_report(read_json(args.report), bank); print('Public fixture evidence and available local coverage verified.')
        return 0
    except (ValueError, TypeError, KeyError, OSError) as exc:
        # Avoid echoing imported answer content or private data into logs.
        print('Rejected: invalid input/schema, missing private scope, existing destination, or inconsistent scoring evidence.', file=sys.stderr)
        return 2


if __name__ == '__main__': raise SystemExit(main())
