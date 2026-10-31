"""Check authored reference solutions by enumeration and graph search, offline."""
from itertools import product, permutations
import heapq
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]


def verify():
    bank=json.loads((ROOT/'dist/data/playful-season.json').read_text(encoding='utf-8'))
    rota,robot,flat,minutes,move=bank['tasks']
    def legal(a):
        return (len(a)==6 and set(a)<={'狼人','蝙蝠','吸血鬼','僵尸'}
                and a.count('狼人')==2 and all(i<=2 for i,x in enumerate(a) if x=='狼人')
                and a.count('蝙蝠')==2 and a[0]!='蝙蝠'
                and a.count('吸血鬼')==1 and a[5]!='吸血鬼'
                and a.count('僵尸')==1 and a[5]=='僵尸'
                and all(x!=y for x,y in zip(a,a[1:])))
    solutions=[a for a in product(['狼人','蝙蝠','吸血鬼','僵尸'],repeat=6) if legal(a)]
    assert legal(rota['reference']['answer']['assignment'])
    assert len(solutions)>1, 'Any legal roster must be accepted, not only the sample.'
    assert not legal(['狼人','狼人','蝙蝠','吸血鬼','蝙蝠','僵尸'])
    assert not legal(['狼人','蝙蝠','吸血鬼','狼人','蝙蝠','僵尸'])
    original=robot['reference']['original'].splitlines()
    answer=robot['reference']['answer'].splitlines()
    assert len(original)==len(answer)==7
    assert [i for i in range(7) if original[i]!=answer[i]]==[1,3,4]
    assert answer[1]==original[1].replace('周日03:00','周日04:30')
    assert answer[3]==original[3].replace('左夹爪','右夹爪')
    assert answer[4]==original[4].replace('自动开门；','')
    rooms=['101','102','201','202']
    def flat_solutions(vampire_ground):
        result=[]
        for residents in permutations(['吸血鬼','僵尸','蝙蝠','史莱姆']):
            placement=dict(zip(rooms,residents))
            where={v:k for k,v in placement.items()}
            if where['史莱姆']!='102' or where['蝙蝠']!='201':continue
            if where['吸血鬼'] not in ['102','202']:continue
            if vampire_ground and where['吸血鬼'][0]!='1':continue
            result.append(placement)
        return result
    assert flat_solutions(True)==[]
    assert flat_solutions(False)==[flat['reference']['answer']['rooms']]
    assert flat['reference']['turn2']['feasible'] is False
    # Field-level expectations from the explicit A/B/C precedence in the prompt.
    expected=[('修理牵引光束','小绿','未说明',{'A1','B1'}),
              ('调试传送门','小紫','周六10:00',{'B2'}),
              ('修补飞船地板','小灰','未说明',{'A3'})]
    for row,(name,owner,deadline,sources) in zip(minutes['reference']['answer']['tasks'],expected):
        assert (row['task'],row['owner'],row['deadline'])==(name,owner,deadline)
        assert sources<=set(row['sources']) and 'C1' not in row['sources']
    graph={node:[] for node in 'ABCDE'}
    for a,b,width,cost in move['reference']['graph']:
        if width>=2:
            graph[a].append((b,cost));graph[b].append((a,cost))
    queue=[(0,'A',['A'])];seen=set();shortest=None
    while queue:
        cost,node,route=heapq.heappop(queue)
        if node in seen:continue
        seen.add(node)
        if node=='E':shortest=(cost,route);break
        for neighbor,step in graph[node]:heapq.heappush(queue,(cost+step,neighbor,route+[neighbor]))
    assert shortest==(move['reference']['totalMinutes'],move['reference']['route'])==(9,['A','C','D','E'])
    svg=ET.fromstring((ROOT/'dist'/move['reference']['artifact']).read_text(encoding='utf-8'))
    assert svg.attrib['width']=='800' and svg.attrib['height']=='600'
    ns={'s':'http://www.w3.org/2000/svg'}
    assert len(svg.findall('s:line',ns))==6 and len(svg.findall('s:circle',ns))==5
    positions=[(100,110),(400,110),(100,340),(400,340),(690,225)]
    pos=dict(zip('ABCDE',positions))
    actual_edges={frozenset(((int(line.attrib['x1']),int(line.attrib['y1'])),(int(line.attrib['x2']),int(line.attrib['y2'])))) for line in svg.findall('s:line',ns)}
    assert actual_edges=={frozenset((pos[a],pos[b])) for a,b,_,_ in move['reference']['graph']}
    highlights={frozenset(((int(line.attrib['x1']),int(line.attrib['y1'])),(int(line.attrib['x2']),int(line.attrib['y2'])))) for line in svg.findall('s:line',ns) if line.attrib['stroke']=='#3355cc'}
    assert highlights=={frozenset((pos[a],pos[b])) for a,b in zip('ACD','CDE')}
    assert bank['modelCalls']==0 and bank['results']==[]
    return {'status':'passed','rosterFeasibleSolutions':len(solutions),'flatRound2Solutions':0,
            'flatRound3Solutions':1,'shortestRoute':shortest[1],'minutes':shortest[0],
            'robotChangedLines':[2,4,5],'referenceSvgTopology':'checked','modelCalls':0,
            'note':'Only authored references and UI fixtures checked; no model capability test.'}


if __name__=='__main__':print(json.dumps(verify(),ensure_ascii=False,indent=2))
