"""Author the frozen, independently scored two-question public pilot."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def bank():
    boards = [
        ['#######', '#..---#', '#-BB--#', '#--P--#', '#######'],
        ['#######', '#--.--#', '#-B-B-#', '#--#--#', '#-.P--#', '#######'],
    ]
    cases = []
    for i, (rows, limit, answer) in enumerate(zip(boards, [12, 18], ['URULDLDLU', 'RUULULDDURRRUL'])):
        prompt = ('把两位老板都推进工位。只能推，不能拉；每步上下左右一格，不能穿墙或同时推两人。\n'
                  '#墙，-空地，P是你，B是老板，.是工位。\n'
                  f'{limit}步内完成，只输出UDLR动作串（上、下、左、右）。\n' + '\n'.join(rows))
        cases.append(dict(id=f'office-{i+1}', label=['老板挤一排', '隔墙也要送到岗'][i],
                          prompt=prompt, board=rows, moveLimit=limit, reference=answer))
    gears = []
    for i, (edges, answer) in enumerate([
        (['AB', 'BC', 'CD', 'DE', 'EA', 'BD'], {'can': False, 'cut': ['BC']}),
        (['AB', 'CD', 'DE', 'EA', 'BD'], {'can': True, 'cut': []}),
    ]):
        prompt = (f'A驱动五个固定轴齿轮，啮合关系为{"、".join(edges)}，每对必须反向。\n'
                  '只检查转向，不考虑速比与安装距离。\n'
                  '原机构能全部转动吗？最少断开哪些啮合，才能让A仍驱动全部？\n'
                  '只输出JSON：can为原机构能否转动（布尔），cut为断开的啮合对数组。')
        gears.append(dict(id=f'gears-{i+1}', label=f'机构 {i+1}', prompt=prompt,
                          vertices=list('ABCDE'), edges=edges, reference=answer))
    return dict(schemaVersion='short-challenges-v1', suiteId='zhufeng-short-20261101-v1',
        scoreVersion='short-rubric-v1', authoredAt='2026-11-01', publication='public-development-pilot',
        protocol=dict(content=80, format=10, delivery=10, repeats=1, casesPerTask=2,
            effort='high', maxOutputTokens=16384, automaticRetries=0, aggregateScore=None,
            note='每题两个独立样例，各开启新会话；每样例100分，两样例等权平均。内容合格要求两个样例的内容分均为80。无跨题总分，不并入第一期成绩。',
            limitation='每个样例每模型仅测一次；这是公开开发题小样本，不证明稳定排名或抗题库记忆能力。',
            revision='题面、样例、判据与版本在首次请求前固定；后续改题另立版本，不回改已采集成绩。'),
        tasks=[dict(id='boss-sokoban', title='推老板进工位', hook='只能推不能拉，一步错，老板就堵在墙角。',
            ability='空间规划、动作后果与不可逆死局', replaces='斑马SVG的候选替代，旧题成绩仍保留',
            origin='original-adaptation', responseFormat='UDLR-only', cases=cases,
            source=dict(title='Reasoning Gym · Sokoban', url='https://github.com/open-thought/reasoning-gym/blob/main/reasoning_gym/games/sokoban.py',
                        note='参考可执行动作验证机制；地图及中文题面由本站自拟，不沿用项目成绩。'),
            criteria=[dict(label='在步数内合法送到全部工位', max=80, dimension='content',
                rule='严格按每个字母执行，撞墙、推两人或越界即在首次非法动作停止。整串合法、最终两人均在工位且不超过题面步数，得80分；否则0分。不要求最短或与参考动作相同。'),
                dict(label='只输出动作串', max=10, dimension='format', rule='去除首尾空白后仅含大写UDLR且非空，得10分；解释、代码围栏或其他字符得0分。内容可提取唯一一行动作串验证，不能从多条候选中挑最好的一条。'),
                dict(label='完整交付', max=10, dimension='delivery', rule='接口完整结束且正文非空得10分，否则0分。未发送不计0，完整返回错误答案仍得交付分。')]),
            dict(id='gear-scam', title='齿轮诈骗，先别通电', hook='指令听起来都对，接在一起却可能根本转不动。',
            ability='可行性判断、反例识别与最小修复', replaces='新增可行性与纠错题位，不替代会议事实题',
            origin='original-adaptation', responseFormat='json-only', cases=gears,
            source=dict(title='本站原创改编', url=None, note='仅测试给定反向约束图的方向兼容性及连通性，不验证实体齿形、装配与动力学。'),
            criteria=[dict(label='原机构可行性', max=20, dimension='content', rule='can为正确的JSON布尔值得20分，否则0分。'),
                dict(label='最少修复且仍驱动全部', max=60, dimension='content', rule='cut只包含互不重复的原有啮合对；删除后仍连通且每条边可反向赋值，删除数量达到枚举最小值，得60分，否则0分。AB与BA等价。可行机构的最少修复是空数组。'),
                dict(label='独立JSON', max=10, dimension='format', rule='正文仅为一个JSON对象，且恰含can布尔和cut字符串数组两个字段，得10分，否则0分；重复字段无效。仅剥离完整代码围栏可核对内容，围栏仍扣格式分。'),
                dict(label='完整交付', max=10, dimension='delivery', rule='接口完整结束且正文非空得10分，否则0分。未发送不计0，完整返回错误答案仍得交付分。')])])


if __name__ == '__main__':
    target = ROOT / 'dist/data/short-challenges.json'
    if target.exists():
        raise SystemExit('Existing question bank retained. Create a new version instead of overwriting a frozen bank.')
    target.write_text(json.dumps(bank(), ensure_ascii=False, indent=2) + '\n', encoding='utf8')
