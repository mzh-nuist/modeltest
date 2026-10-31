"""Explicit human grading; writes a new document and retains review history."""
import argparse
import copy
import datetime
from pathlib import Path
from .core import ConfigError, load_json, public_export, validate_document, write_json


def review(document, run_id, decision, reason, reviewer):
    errors = validate_document(document)
    if errors:
        raise ConfigError('Review requires a valid result document')
    if decision not in ('passed', 'failed'):
        raise ConfigError('Decision must be passed or failed')
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 4000:
        raise ConfigError('A concrete review reason is required (1..4000 characters)')
    if not isinstance(reviewer, str) or not reviewer.strip() or len(reviewer) > 120:
        raise ConfigError('Reviewer alias is required (1..120 characters)')
    result = copy.deepcopy(document)
    run = next((r for r in result['runs'] if r['id'] == run_id), None)
    if not run:
        raise ConfigError('Run ID not found')
    task = next(t for t in document['tasks'] if t['id'] == run['taskId'])
    if task.get('grader',{}).get('type') == 'contract':
        raise ConfigError('Versioned tasks require python -m runner.rubric_review with criterion evidence')
    if run['status'] != 'success':
        raise ConfigError('An unsuccessful request cannot be graded as a completed answer')
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    history = list(run['grading'].get('reviews', []))
    history.append({'reviewer': reviewer.strip(), 'reviewedAt': timestamp,
                    'previousStatus': run['grading']['status'], 'decision': decision, 'reason': reason.strip()})
    run['grading'] = {'status': decision, 'score': 1 if decision == 'passed' else 0,
                      'reason': reason.strip(), 'reviews': history}
    result['meta']['updatedAt'] = timestamp
    # Reuse public whitelist and secret-value redaction before writing output.
    return public_export(result)


def main(argv=None):
    p = argparse.ArgumentParser(description='人工复核单条回答，保留历史并另存公开结果。不会调用模型。')
    p.add_argument('source')
    p.add_argument('--run-id', required=True)
    p.add_argument('--decision', choices=['passed', 'failed'], required=True)
    p.add_argument('--reason', required=True)
    p.add_argument('--reviewer', required=True, help='公开评审别名，请勿填写私人信息')
    p.add_argument('--out', required=True)
    a = p.parse_args(argv)
    try:
        if Path(a.out).exists() or Path(a.source).resolve() == Path(a.out).resolve():
            raise ConfigError('Review output must be a new file; original evidence is preserved')
        result = review(load_json(a.source), a.run_id, a.decision, a.reason, a.reviewer)
        write_json(a.out, result)
        print('Human review saved with history; original file unchanged.')
        return 0
    except (ConfigError, OSError, ValueError, TypeError, KeyError) as exc:
        print('ERROR: ' + (str(exc) if isinstance(exc, ConfigError) else 'Invalid review input or output'))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
