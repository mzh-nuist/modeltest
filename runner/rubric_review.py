"""Criterion-level human review. No model calls, no execution, no overwrite."""
import argparse
import copy
import datetime
from pathlib import Path
from .scoring import assess


def apply_review(output, spec, review):
    if spec.get('kind')!='manual': raise ValueError('Only manual contracts accept rubric reviews')
    if any(not isinstance(review.get(k),str) or not review[k].strip() for k in ('reviewer','reviewedAt')):
        raise ValueError('Public reviewer alias and timestamp required')
    items=review.get('items')
    if not isinstance(items,list) or len(items)!=len(spec['criteria']): raise ValueError('Every rubric criterion needs a decision')
    by_id={c.get('id'):c for c in items if isinstance(c,dict)}
    if len(by_id)!=len(items) or set(by_id)!={c['id'] for c in spec['criteria']}: raise ValueError('Missing or duplicate criterion')
    base=assess(output,spec);earned=0;qualified=True;checks=[]
    for c in spec['criteria']:
        item=by_id[c['id']];points=item.get('awarded')
        if isinstance(points,bool) or points not in (0,c['points']/2,c['points']): raise ValueError('Use zero, half or full anchored points')
        if not isinstance(item.get('reason'),str) or not item['reason'].strip() or len(item['reason'])>4000: raise ValueError('Criterion evidence is required')
        earned+=points;ok=points>=c['passAt'];qualified=qualified and ok
        checks.append({'id':c['id'],'label':c['label'],'passed':ok,'points':c['points'],'earned':points})
    score=earned/sum(c['points'] for c in spec['criteria'])
    qualified=qualified and base['assessment']['formatState']=='passed'
    base.update(status='passed' if qualified else 'failed',score=score,reason='人工逐项复核；零/半/满分锚点及评审证据已保存。',rubricReview=copy.deepcopy(review))
    base['assessment'].update(contentState='passed' if all(c['passed'] for c in checks) else 'failed',contentScore=score,qualified=qualified,checks=checks)
    return base


def main(argv=None):
    from .core import load_json,public_export,write_json,validate_document
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source');p.add_argument('--run-id',required=True);p.add_argument('--review',required=True);p.add_argument('--out',required=True)
    a=p.parse_args(argv)
    try:
        if Path(a.out).exists() or Path(a.out).resolve()==Path(a.source).resolve(): raise ValueError('Output must be a new file')
        d=load_json(a.source)
        if validate_document(d): raise ValueError('Input evidence is invalid')
        r=next(x for x in d['runs'] if x['id']==a.run_id)
        if r['status']!='success': raise ValueError('Incomplete requests cannot receive completed-answer reviews')
        if r['grading'].get('rubricReview'): raise ValueError('Review already present; retain it and use a separately versioned review document')
        t=next(t for t in d['tasks'] if t['id']==r['taskId']);review=load_json(a.review)
        review['reviewedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        r['grading']=apply_review(r['output'],t['grader'],review)
        d['meta']['updatedAt']=review['reviewedAt'];write_json(a.out,public_export(d));print('Criterion review saved; original evidence retained.')
        return 0
    except (ValueError,KeyError,StopIteration,TypeError,OSError):
        print('Review rejected: verify complete anchored decisions and original evidence.');return 2


if __name__=='__main__': raise SystemExit(main())
