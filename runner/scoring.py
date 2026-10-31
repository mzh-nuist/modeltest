"""Deterministic content/format separation; no execution of model code."""
import json
import math
import re
from fractions import Fraction

PROTOCOL = 'core-rubric-v1'
NUMERIC = re.compile(r'(?<![\w.])[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?(?:/[-+]?\d+)?(?![\w.])')


def strict_json(text):
    def unique(pairs):
        result={}
        for k,v in pairs:
            if k in result: raise ValueError('Duplicate JSON key')
            result[k]=v
        return result
    def finite_float(value):
        result=float(value)
        if not math.isfinite(result): raise ValueError('Non-finite JSON number')
        return result
    return json.loads(text, parse_float=finite_float, object_pairs_hook=unique, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Non-finite JSON')))


def validate_spec(g):
    if g.get('type') != 'contract' or g.get('version') != PROTOCOL or g.get('kind') not in ('number','json','text_rules','manual'):
        raise ValueError('Unsupported versioned scoring contract')
    if g.get('format') not in ('number_only','json_only','plain_text'):
        raise ValueError('Unsupported output format')
    expected_format={'number':'number_only','json':'json_only','text_rules':'plain_text','manual':'plain_text'}[g['kind']]
    if g['format']!=expected_format: raise ValueError('Format contradicts content kind')
    for key in ('checks','constraints','criteria'):
        if not isinstance(g.get(key,[]),list) or len(g.get(key,[]))>100:
            raise ValueError('Invalid scoring list')
    if g['kind'] in ('number','json') and not g.get('checks'):
        raise ValueError('Content checks are required')
    if g['kind']=='text_rules' and not g.get('constraints'):
        raise ValueError('Verifiable text constraints required')
    if g['kind']=='manual' and not g.get('criteria'):
        raise ValueError('Manual tasks require detailed rubric items')
    if (g['kind'] in ('manual', 'text_rules') and g.get('checks')) or (g['kind'] != 'manual' and g.get('criteria')):
        raise ValueError('Scoring lists contradict the contract kind')
    seen=set()
    for c in g.get('checks',[]):
        if not isinstance(c,dict) or not isinstance(c.get('id'),str) or not c['id'] or c['id'] in seen or 'expected' not in c or not isinstance(c.get('points'),(int,float)) or isinstance(c.get('points'),bool) or not math.isfinite(c['points']) or c['points']<=0:
            raise ValueError('Invalid content check')
        seen.add(c['id'])
        try:
            json.dumps(c['expected'], allow_nan=False)
            if g['kind'] == 'number':
                if isinstance(c['expected'], bool) or not isinstance(c['expected'], (str, int, float)) or c.get('path'):
                    raise ValueError('Numeric checks require a root numeric answer')
                Fraction(str(c['expected']))
        except (ValueError, TypeError, ZeroDivisionError, OverflowError):
            raise ValueError('Invalid reference answer') from None
        if not isinstance(c.get('path',[]),list) or any(isinstance(v,bool) or not isinstance(v,(str,int)) or (isinstance(v,int) and v<0) for v in c.get('path',[])):
            raise ValueError('Invalid JSON path')
        for k in ('absTolerance','relTolerance'):
            if not isinstance(c.get(k,0),(int,float)) or isinstance(c.get(k,0),bool) or not math.isfinite(c.get(k,0)) or c.get(k,0)<0:
                raise ValueError('Invalid numeric tolerance')
    seen=set()
    for c in g.get('constraints',[]):
        if not isinstance(c,dict) or not isinstance(c.get('id'),str) or not c['id'] or c['id'] == 'output-shape' or c['id'] in seen or c.get('type') not in ('contains','forbidden','paragraphs','hanzi','lines','occurrences','one_per_line'):
            raise ValueError('Unsupported constraint')
        seen.add(c['id'])
        if c['type'] in ('contains','forbidden','occurrences') and (not isinstance(c.get('text'),str) or not c['text']):
            raise ValueError('Constraint text required')
        if c['type']=='occurrences' and (not isinstance(c.get('count'),int) or isinstance(c.get('count'),bool) or c['count']<0):
            raise ValueError('Occurrence count required')
        if c['type']=='one_per_line':
            texts=c.get('texts')
            if not isinstance(texts,list) or not 1<=len(texts)<=100 or any(not isinstance(t,str) or not t.strip() for t in texts) or len(set(texts))!=len(texts):
                raise ValueError('One-per-line identifiers must be unique nonempty strings')
        if c['type'] in ('paragraphs','hanzi','lines'):
            if any(not isinstance(c.get(k),int) or isinstance(c.get(k),bool) or c[k]<0 for k in ('min','max')) or c['min']>c['max']:
                raise ValueError('Invalid length range')
    seen=set()
    for c in g.get('criteria',[]):
        if not isinstance(c,dict) or not isinstance(c.get('id'),str) or not c['id'] or c['id'] in seen or any(not isinstance(c.get(k),str) or not c[k] for k in ('label','zero','partial','full')):
            raise ValueError('Manual rubric requires concrete anchors')
        seen.add(c['id'])
        if any(not isinstance(c.get(k),(int,float)) or isinstance(c.get(k),bool) or not math.isfinite(c[k]) for k in ('points','passAt')) or not 0<=c['passAt']<=c['points'] or c['points']<=0:
            raise ValueError('Invalid rubric weights/threshold')


def same(actual, expected, abs_tol=0, rel_tol=0):
    if isinstance(expected,bool) or isinstance(actual,bool): return type(actual)==type(expected) and actual==expected
    if isinstance(expected,(float,int,Fraction)) and isinstance(actual,(float,int,Fraction)):
        a,b=Fraction(str(actual)),Fraction(str(expected))
        return abs(a-b)<=max(Fraction(str(abs_tol)),Fraction(str(rel_tol))*abs(b))
    if isinstance(expected,dict): return isinstance(actual,dict) and set(actual)==set(expected) and all(same(actual[k],v,abs_tol,rel_tol) for k,v in expected.items())
    if isinstance(expected,list): return isinstance(actual,list) and len(actual)==len(expected) and all(same(a,b,abs_tol,rel_tol) for a,b in zip(actual,expected))
    return type(actual)==type(expected) and actual==expected


def assess(output, spec, status='success'):
    validate_spec(spec)
    if status!='success':
        return {'status':'not_applicable','score':None,'reason':'请求未完整返回；不对半截回答评分。',
                'assessment':{'protocolId':PROTOCOL,'contentState':'not_applicable','contentScore':None,'formatState':'not_applicable','qualified':False,'checks':[],'constraints':[]}}
    text=output.strip(); candidate=text
    fence=re.fullmatch(r'```(?:json|text)?\s*\n(.*?)\n```',text,re.S)
    if fence: candidate=fence.group(1).strip()
    raw=None; parsed=False; shape=False
    if spec['kind']=='number':
        pieces=NUMERIC.findall(candidate)
        try:
            if len(pieces)==1: raw=Fraction(pieces[0]);parsed=True
        except (ValueError,ZeroDivisionError,OverflowError): pass
        shape=parsed and NUMERIC.fullmatch(text) is not None
    elif spec['kind']=='json':
        try: raw=strict_json(candidate);parsed=True
        except (ValueError,TypeError): pass
        try: strict_json(text);shape=True
        except (ValueError,TypeError): pass
    else:
        shape=not text.startswith('```') and bool(text)
    checks=[]
    for c in spec.get('checks',[]):
        actual=raw;found=parsed
        try:
            for part in c.get('path',[]):
                if isinstance(part,int) and not isinstance(actual,list): raise KeyError(part)
                if isinstance(part,str) and not isinstance(actual,dict): raise KeyError(part)
                actual=actual[part]
        except (KeyError,IndexError,TypeError): found=False
        expected=Fraction(str(c['expected'])) if spec['kind']=='number' else c['expected']
        ok=found and same(actual,expected,c.get('absTolerance',0),c.get('relTolerance',0))
        checks.append({'id':c['id'],'label':c.get('label',c['id']),'passed':ok,'points':c['points'],'earned':c['points'] if ok else 0})
    constraints=[{'id':'output-shape','label':{'number_only':'仅输出数值','json_only':'整份回答为JSON','plain_text':'仅正文，无代码围栏'}[spec['format']],'passed':shape}]
    for c in spec.get('constraints',[]):
        kind=c['type'];value=None
        if kind=='contains': ok=c['text'] in output
        elif kind=='forbidden': ok=c['text'] not in output
        elif kind=='occurrences': value=output.count(c['text']);ok=value==c['count']
        elif kind=='one_per_line':
            lines=output.splitlines();identifiers=c['texts']
            ok=(len(lines)==len(identifiers) and all(line.strip() for line in lines)
                and all(sum(line.count(identifier) for identifier in identifiers)==1 for line in lines)
                and all(output.count(identifier)==1 for identifier in identifiers))
        else:
            value={'paragraphs':lambda:len(re.split(r'\n\s*\n',text)) if text else 0,
                   'hanzi':lambda:sum('\u4e00'<=ch<='\u9fff' for ch in output),
                   'lines':lambda:len(text.splitlines())}[kind]()
            ok=c['min']<=value<=c['max']
        constraints.append({'id':c['id'],'label':c.get('label',c['id']),'passed':ok})
    format_ok=all(c['passed'] for c in constraints)
    manual=spec['kind']=='manual'
    score=sum(c['earned'] for c in checks)/sum(c['points'] for c in checks) if checks else None
    content_state='pending' if manual else 'not_applicable' if not checks else 'passed' if all(c['passed'] for c in checks) else 'failed'
    qualified=None if manual else format_ok and (content_state in ('passed','not_applicable'))
    state='pending' if manual else 'passed' if qualified else 'failed'
    return {'status':state,'score':None if manual else score if score is not None else float(format_ok),
            'reason':'内容与格式分别核验；人工标准仍需逐项复核。' if manual else '内容分与约束结果分开；仅关键内容及所有约束均满足才合格。',
            'assessment':{'protocolId':PROTOCOL,'contentState':content_state,'contentScore':score,
                          'formatState':'passed' if format_ok else 'failed','qualified':qualified,'checks':checks,'constraints':constraints}}


def validate_assessment(a):
    if not isinstance(a,dict) or a.get('protocolId')!=PROTOCOL or a.get('contentState') not in ('passed','failed','pending','not_applicable') or a.get('formatState') not in ('passed','failed','not_applicable'):
        raise ValueError('Invalid separated assessment')
    if a.get('qualified') is not None and not isinstance(a.get('qualified'),bool): raise ValueError('Invalid qualification')
    score=a.get('contentScore')
    if score is not None and (isinstance(score,bool) or not isinstance(score,(float,int)) or not math.isfinite(score) or not 0<=score<=1): raise ValueError('Invalid content score')
    for key in ('checks','constraints'):
        if not isinstance(a.get(key),list): raise ValueError('Missing assessment details')
        for c in a[key]:
            if not isinstance(c,dict) or not isinstance(c.get('id'),str) or not isinstance(c.get('label'),str) or not isinstance(c.get('passed'),bool): raise ValueError('Invalid assessment check')
    if a.get('qualified') is True and (a['contentState'] not in ('passed','not_applicable') or a['formatState']!='passed'):
        raise ValueError('Qualified result contradicts checks')
