"""Recompute rate eligibility from preserved raw events; never overwrite evidence."""
import argparse
import copy
import hashlib
from pathlib import Path
from .core import ConfigError, load_json, now, public_export, validate_document, write_json
from .rates import estimate_rates
from .anthropic import MessagesStream


def reprocess(document, raw_directory):
    if validate_document(document):
        raise ConfigError('Input result document must be valid')
    result = copy.deepcopy(document)
    tasks = {t['id']: t for t in result['tasks']}
    for run in result['runs']:
        if run['status'] == 'skipped':
            continue
        path = Path(raw_directory) / (run['id'] + '.json')
        if not path.is_file():
            if run['status']=='success':
                raise ConfigError('A successful record requires matching raw evidence')
            # HTTP failures have no body evidence and no estimable output rate.
            run['metrics']['outputTps'] = run['metrics']['charsPerSec'] = None
            continue
        raw = load_json(path)
        expected_hash = hashlib.sha256(tasks[run['taskId']]['prompt'].encode('utf-8')).hexdigest()
        if raw.get('runId') != run['id'] or raw.get('taskSha256') != expected_hash:
            raise ConfigError('Raw evidence does not match run/task identity')
        if run['status']!='success':
            run['metrics']['outputTps'] = run['metrics']['charsPerSec'] = None
            continue
        if not raw.get('streamDone') or not raw.get('finishSeen'):
            raise ConfigError('Successful raw evidence must include stream completion')
        chunks = []
        normalizer = MessagesStream() if run['provenance'].get('adapter') == 'anthropic-messages' else None
        for entry in raw.get('events', []):
            event = entry.get('data', {})
            if normalizer:
                event, _ = normalizer.normalize(event)
            for choice in event.get('choices', []):
                text = choice.get('delta', {}).get('content')
                if isinstance(text, str) and text:
                    chunks.append((entry['elapsedMs'] / 1000, text))
        metrics = run['metrics']
        tokens = None
        if metrics.get('outputTokens') is not None and metrics.get('reasoningTokens') is not None:
            tokens = metrics['outputTokens'] - metrics['reasoningTokens']
        rates = estimate_rates(run['status'], chunks, tokens)
        for field in ['outputTps', 'charsPerSec']:
            metrics[field] = rates[field]
        run['provenance'].update({key: rates[key] for key in ['ratePolicy','rateSampleSeconds','answerChunkCount']})
        run['provenance']['tpsMethod'] = 'client first-to-last chunk estimate with >=500ms, >=3 chunks, >=64 visible tokens; otherwise unavailable'
    result['meta']['updatedAt'] = now()
    result['meta']['description'] += ' 速率经原始事件重算，短输出或突发缓冲样本不显示生成速率；原始采集文件保留。'
    return public_export(result)


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source');p.add_argument('--raw-dir',required=True);p.add_argument('--out',required=True)
    a=p.parse_args()
    if Path(a.out).exists() or Path(a.source).resolve()==Path(a.out).resolve():
        raise SystemExit('Output must be a new file')
    try:
        write_json(a.out,reprocess(load_json(a.source),a.raw_dir))
        print('Rate-reviewed export saved; original evidence unchanged.')
    except (ConfigError,OSError,ValueError,TypeError,KeyError):
        raise SystemExit('Cannot recompute rates: check source and matching raw evidence')
