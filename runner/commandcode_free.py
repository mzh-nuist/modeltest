"""Bounded first-party-documented free-model probe using existing local credentials.

No credential is copied into this project. No settings or subscription changes.
"""
import argparse
import json
import os
from pathlib import Path
from .core import ConfigError, execute, load_json, make_plan, public_export, write_json

ROOT = Path(__file__).resolve().parents[1]
ENV_NAME = 'ZHUFENG_EVAL_COMMANDCODE_SESSION_KEY'
FREE_MODELS = [
    ('glyph-free', 'Glyph Cluster (free)', 'stealth/glyph-cluster:free', 256000),
    ('beam-free', 'Beam (free)', 'reflection/beam:free', 1048576),
    ('laguna-free', 'Laguna S 2.1 (free)', 'poolside/laguna-s-2.1-free', 256000),
]


def configuration(suite='smoke'):
    return {'schemaVersion': '1.0', 'title': 'CommandCode 免费端点首次真实采集',
            'simulation': False, 'region': '本机 Windows 客户端；网络出口位置未核验',
            'concurrency': 1, 'repeats': 1, 'maxRetries': 0, 'timeoutSeconds': 60,
            'budgetUsd': 0.01, 'taskIds': ['math-01', 'data-01', 'chinese-04'] if suite=='smoke' else ['speed-copy', 'speed-json', 'speed-writing'],
            'models': [
                {'id': ident, 'name': name, 'family': 'CommandCode 声明模型',
                 'provider': 'CommandCode GOAT', 'adapter': 'openai-compatible',
                 'endpoint': 'https://api.commandcode.ai/provider/v1/chat/completions',
                 'apiModel': api, 'apiKeyEnv': ENV_NAME, 'version': api + ' · 服务商别名',
                 'reasoning': '服务商默认，未指定推理档位', 'reasoningEffort': None,
                 'temperature': None, 'maxInputTokens': 8192, 'maxOutputTokens': 1024 if suite=='smoke' else 2048,
                 'maxTokensParameter': 'max_completion_tokens', 'outputLimitIncludesReasoning': True,
                 'usageSemantics': 'includes_reasoning', 'contextWindow': context,
                 'inputPrice': 0, 'outputPrice': 0, 'cachedInputPrice': 0, 'currency': 'USD',
                 'sourceUrl': 'https://commandcode.ai/docs/provider', 'sourceDate': '2026-10-23',
                 'tags': ['首次采集', '免费端点', '第三方服务商'],
                 'description': '服务商当前文档声明不消耗 credits；客户端测量，尚未独立验证上游模型身份。'}
                for ident, name, api, context in FREE_MODELS]}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', required=True)
    p.add_argument('--execute', action='store_true')
    p.add_argument('--suite', choices=['smoke','speed'], default='smoke')
    a = p.parse_args(argv)
    config = configuration(a.suite)
    if a.suite=='speed':
        config['title']='CommandCode 免费端点长输出采样'
    dataset = load_json(ROOT / ('datasets/tasks.json' if a.suite=='smoke' else 'datasets/speed_tasks.json'))
    plan = make_plan(config, dataset)
    if plan['plannedRequests'] != 9 or plan['reservedUpperBoundUsd'] != 0:
        raise ConfigError('Free probe must stay at 9 requests and zero nominal cost')
    if not a.execute:
        print(json.dumps({k: v for k, v in plan.items() if k != 'jobs'}, ensure_ascii=True, indent=2))
        return 0
    path = Path.home() / '.opencodex/config.json'
    provider = load_json(path).get('providers', {}).get('commandcode', {})
    if provider.get('baseUrl', '').rstrip('/') != 'https://api.commandcode.ai/provider/v1':
        raise ConfigError('Existing CommandCode endpoint does not match the documented service')
    key = provider.get('apiKey')
    if not isinstance(key, str) or len(key) < 8:
        raise ConfigError('Existing local CommandCode key is unavailable')
    previous = os.environ.get(ENV_NAME)
    os.environ[ENV_NAME] = key
    try:
        print('Starting 9 bounded real requests to documented free models; no paid model or retry.', flush=True)
        result = execute(config, dataset, a.out, allow_paid=True)
        result['meta']['description'] += ' 首次有限免费端点探测：非代表性小样本；未独立核验上游模型身份或思考配置。'
        result['batches'][0]['description'] = result['meta']['description']
        write_json(Path(a.out) / 'results.json', result)
        write_json(Path(a.out) / 'public.json', public_export(result))
        print(json.dumps({'status': result['batches'][0]['status'], 'runs': len(result['runs']),
                          'successes': sum(r['status'] == 'success' for r in result['runs']),
                          'dataKind': 'measured', 'publicFile': str(Path(a.out) / 'public.json')}, ensure_ascii=True))
        return 0
    finally:
        if previous is None:
            os.environ.pop(ENV_NAME, None)
        else:
            os.environ[ENV_NAME] = previous


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ConfigError, OSError, ValueError, TypeError, KeyError):
        print('Free probe could not proceed; check local configuration and output directory. No credential values logged.')
        raise SystemExit(2)
