"""Build sanitized V2 assets locally; never call a model or publish the Site."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runner.challenge_bank import ROOT, EXPECTED_IDS, DEVELOPMENT_IDS, load_bank, read_json, write_json, public_catalog, public_manifest, development_bank, validate_public_catalog
from runner.challenge_offline import run_check, validate_report


def build(bank_path=None, output_root=ROOT):
    output_root = Path(output_root)
    bank = load_bank(bank_path)
    ids = {task['id'] for task in bank['tasks']}
    if ids not in (EXPECTED_IDS, DEVELOPMENT_IDS):
        raise ValueError('Build requires the complete 72-task bank or all 24 public development tasks')
    manifest_path = ROOT / 'datasets/challenge_manifest_v2.json'
    manifest = read_json(manifest_path) if len(bank['tasks']) < 72 and manifest_path.is_file() else None
    if ids == DEVELOPMENT_IDS and manifest is None:
        raise ValueError('Public fallback build requires the 72-task redacted manifest')
    catalog = public_catalog(bank, manifest)
    validate_public_catalog(catalog)
    if {task['id'] for task in catalog['tasks']} != EXPECTED_IDS:
        raise ValueError('Public catalog must preserve all 72 candidate metadata entries')
    report = run_check(bank)
    validate_report(report, bank)
    if report['summary']['failed']:
        raise ValueError('Fixture expectations failed; assets were not written')
    write_json(output_root / 'dist/data/challenge.json', catalog, overwrite=True)
    write_json(output_root / 'dist/data/challenge-offline.json', report, overwrite=True)
    write_json(output_root / 'datasets/challenge_dev_v2.json', development_bank(bank), overwrite=True)
    if len(bank['tasks']) == 72:
        write_json(output_root / 'datasets/challenge_manifest_v2.json', public_manifest(bank), overwrite=True)
    return {'totalCatalogTasks': catalog['counts']['total'], 'development': catalog['counts']['development'], 'sealedMetadata': catalog['counts']['sealed'],
            'verifiedLocalTasks': len(bank['tasks']), 'fixtureChecks': report['summary']['fixturesChecked'], 'externalApiCalls': 0}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank'); parser.add_argument('--output-root', default=str(ROOT))
    args = parser.parse_args(argv)
    try:
        print(json.dumps(build(args.bank, args.output_root), ensure_ascii=False))
        return 0
    except (ValueError, OSError, TypeError, KeyError):
        print('Build rejected: bank/schema/fixtures must pass before public assets are written.', file=sys.stderr)
        return 2


if __name__ == '__main__': raise SystemExit(main())
