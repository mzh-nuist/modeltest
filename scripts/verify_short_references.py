"""Independent exhaustive reference checks; no model or network access."""
import itertools
import json
from collections import deque
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def shortest(rows):
    floor={(r,c) for r,row in enumerate(rows) for c,ch in enumerate(row) if ch!='#'}
    goals=frozenset((r,c) for r,row in enumerate(rows) for c,ch in enumerate(row) if ch=='.')
    boxes=frozenset((r,c) for r,row in enumerate(rows) for c,ch in enumerate(row) if ch=='B')
    player=next((r,c) for r,row in enumerate(rows) for c,ch in enumerate(row) if ch=='P')
    queue=deque([(player,boxes,'')]);seen={(player,boxes)}
    while queue:
        p,b,path=queue.popleft()
        if b==goals:return path,len(seen)
        for name,(dr,dc) in [('U',(-1,0)),('D',(1,0)),('L',(0,-1)),('R',(0,1))]:
            n=(p[0]+dr,p[1]+dc);nb=b
            if n not in floor:continue
            if n in b:
                beyond=(n[0]+dr,n[1]+dc)
                if beyond not in floor or beyond in b:continue
                nb=frozenset((b-{n})|{beyond})
            if (n,nb) not in seen:
                seen.add((n,nb));queue.append((n,nb,path+name))
    return None,len(seen)


def compatible(vertices,edges):
    # Exhaust all 32 direction assignments, independent of browser graph coloring.
    directions=[dict(zip(vertices,bits)) for bits in itertools.product([0,1],repeat=len(vertices))]
    if not any(all(d[a]!=d[b] for a,b in edges) for d in directions):return False
    reached={vertices[0]}
    for _ in vertices:
        for a,b in edges:
            if a in reached or b in reached:reached.update([a,b])
    return reached==set(vertices)


def verify():
    bank=json.loads((ROOT/'dist/data/short-challenges.json').read_text(encoding='utf8'));report=[]
    for case in bank['tasks'][0]['cases']:
        answer,states=shortest(case['board'])
        assert answer is not None and len(answer)<=case['moveLimit']
        assert answer==case['reference']
        report.append({'case':case['id'],'shortestSteps':len(answer),'reference':answer,'statesSeen':states})
    for case in bank['tasks'][1]['cases']:
        for count in range(len(case['edges'])+1):
            solutions=[list(cut) for cut in itertools.combinations(case['edges'],count) if compatible(case['vertices'],[e for e in case['edges'] if e not in cut])]
            if solutions:break
        assert case['reference']['can']==compatible(case['vertices'],case['edges'])
        assert case['reference']['cut'] in solutions
        report.append({'case':case['id'],'minimumCuts':count,'allMinimumRepairs':solutions})
    return report


if __name__=='__main__':print(json.dumps(verify(),ensure_ascii=False,indent=2))
