"""Author the public development set. No model client, credential or network code."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def criterion(label, maximum, full, partial, zero, dimension='content'):
    return dict(label=label, max=maximum, dimension=dimension, full=full, partial=partial, zero=zero)


def task(identity, title, hook, ability, replaces, prompts, reference, checks, format_full, delivery_full, **extras):
    return dict(id=identity, title=title, hook=hook, ability=ability, replaces=replaces,
                status='unmeasured', origin='original-adaptation', maxScore=100,
                prompts=prompts, reference=reference,
                criteria=checks + [
                    criterion('输出格式', 10, format_full, '5分：可提取唯一有效答案，但有题面禁止的围栏、说明或额外字段。', '0分：指定格式无法解析，或有多个互相冲突的最终答案。', 'format'),
                    criterion('完整交付', 10, delivery_full, '5分：主要答案存在，但漏一个要求的组成部分；按题面逐项核对。', '0分：无可用最终答案、截断，或未交付主要结果。', 'delivery')
                ], **extras)


def make_bank():
    tasks = []
    tasks.append(task(
        'werewolf-rota', '满月夜，狼人还能上夜班吗？', '排班表看起来满满当当，一过凌晨两点，员工变身了。',
        '跨午夜时间边界、多个约束同时满足、禁止相邻连班', '简单时间计算', [
            '怪物便利店周六夜班要排6个连续班次，按顺序是：周六20:00—22:00、周六22:00—周日00:00、周日00:00—02:00、02:00—04:00、04:00—06:00、06:00—08:00。每班恰好1人。\n'
            '员工只有狼人、蝙蝠、吸血鬼、僵尸。规则：\n'
            '1. 狼人恰好上2班，且两班都必须在周日02:00或之前结束。\n'
            '2. 蝙蝠恰好上2班，不能上第1班。\n'
            '3. 吸血鬼恰好上1班，必须在周日06:00或之前结束。\n'
            '4. 僵尸恰好上1班，只能上最后一班。\n'
            '5. 任何人都不能连续上两个相邻班次。\n'
            '给出任意一个满足全部规则的排班，不要求唯一解或最优解。只输出JSON，唯一字段assignment的值为按上述班次顺序排列的6个人名。'
        ], dict(answer={'assignment': ['狼人', '蝙蝠', '狼人', '吸血鬼', '蝙蝠', '僵尸']},
                explanation='这是一个可行解；不要求与参考排列相同。独立枚举所有4^6种排列，逐条检查约束。02:00、06:00允许作为结束边界。'), [
            criterion('六班覆盖与员工范围', 12, '8分：长度为6、每槽一人且按固定时序；4分：六槽都是四名合法员工。', '分别满足哪一项就得该项分，不因排列与参考不同扣分。', '没有六个可核对班位且无合法姓名，0分。'),
            criterion('狼人班数与变身边界', 16, '8分：恰好2班；8分：所有狼人班均在索引0—2，最晚02:00结束。', '按两个独立检查各给0或8分。缺少狼人不获得时间边界分。', '两项均不满足，0分。'),
            criterion('蝙蝠班数与首班限制', 16, '8分：恰好2班；8分：至少有1个蝙蝠班且不占索引0。', '按两个独立检查各给0或8分。', '两项均不满足，0分。'),
            criterion('吸血鬼班数与日出边界', 12, '6分：恰好1班；6分：有吸血鬼班且所有班均在索引0—4。', '按两个独立检查各给0或6分。', '两项均不满足，0分。'),
            criterion('僵尸班数与末班', 12, '6分：恰好1班；6分：僵尸恰占索引5且无其他班。', '按两个独立检查各给0或6分。', '两项均不满足，0分。'),
            criterion('不连班', 12, '六个有效班位均无相邻同名，12分。', '恰好一对相邻同名，6分；两对及以上，0分。', '无法核对六个班位，或两对及以上相邻连班，0分。')
        ], '单个可解析JSON对象，只有assignment字段，值为6个字符串。', '交付完整的6班排班；没有省略号或只给建议。',
        gates=['六个班位和合法员工是所有后续约束的检查前提；不满足时内容分为0，不能靠缺失员工逃避约束。', '只有全部内容约束通过，才能标记内容合格；80分的内容累计不能替代逐条通过。']))

    original = ('01｜启动口令：咕咕咕。\n02｜巡逻时间：周日03:00。\n03｜门牌编号：B-07；备用编号：B-70。\n'
                '04｜用左夹爪拿蛋糕，保持托盘水平。\n05｜接近卧室时：自动开门；轻敲两下；等待回应。\n'
                '06｜异常时说：“我只是路过的扫地机。”\n07｜校验串：AabB-001-零；不得补写说明。')
    expected = original.replace('周日03:00', '周日04:30').replace('用左夹爪', '用右夹爪').replace('自动开门；', '')
    tasks.append(task(
        'robot-repair', '修好机器人，别顺手把它重装了', '它会不会改完时间，又顺手润色口令、门牌和标点？',
        '多位置局部编辑、保护无关内容、逐字执行', '只改指定时间', [
            '以下是送蛋糕机器人的指令。只做3处改动：第02行把“周日03:00”改为“周日04:30”；第04行把“左夹爪”改为“右夹爪”；第05行仅删除“自动开门；”。其他字符、行序和标点必须原样保留。只回复修改后的完整7行，不加解释、不加代码围栏。整份答案首尾空白及CRLF/LF传输换行差异忽略，行内空白不忽略。\n\n' + original
        ], dict(answer=expected, explanation='每处改动对照原行；不靠关键词出现判对。未指定的4整行及3条被编辑行的其他字符必须原样保留。', original=original), [
            criterion('第02行定点修改', 20, '与参考第02行逐字一致，20分。', '时间改为04:30但本行同时改了其他字符，10分。', '指定时间未改对或第02行缺失，0分。'),
            criterion('第04行定点修改', 20, '与参考第04行逐字一致，20分。', '夹爪改对但本行同时改了其他字符，10分。', '夹爪未改对或第04行缺失，0分。'),
            criterion('第05行精确删除', 20, '与参考第05行逐字一致，20分。', '已删除指定片段但本行还删改了其他字符，10分。', '指定片段未删、仅改写或第05行缺失，0分。'),
            criterion('保护未指定行', 20, '第01、03、06、07行各逐字正确得5分。', '按保留的正确整行累计，每行0或5分。', '四行均有变化或缺失，0分。')
        ], '只有修改后的7行原文，没有解释、围栏、增行。', '全部7行完整交付；缺1行得5分，缺2行及以上得0分。',
        gates=['内容合格要求参考全文逐字一致（只作题面允许的首尾空白和换行归一化）。', '没有实际运行任何机器人；本题仅编辑给定文本。']))

    tasks.append(task(
        'monster-flat', '房东改了三次条件，怪物还住得下吗？', '上一轮确实无解，下一轮取消了旧条件；别让已经撤销的要求继续闹鬼。',
        '多轮状态更新、约束冲突识别、撤销旧条件', '多轮出游记忆', [
            '怪物公寓有4个单人房，每个房恰好住1只怪物，4只怪物都要入住。101是一楼西窗、102是一楼东窗、201是二楼西窗、202是二楼东窗。怪物是吸血鬼、僵尸、蝙蝠、史莱姆。当前条件：吸血鬼只能一楼且必须东窗；僵尸只能一楼；蝙蝠必须二楼；史莱姆不限。先记住，回复“已记录”，不要排房。',
            '更新：取消“僵尸只能一楼”；新增“史莱姆必须住102”；蝙蝠新增“必须西窗”（二楼要求仍有效）。其余条件不变。判断当前是否可行。只输出JSON，字段feasible为布尔值，conflict为一句冲突原因；如无冲突则写空字符串。',
            '再次更新：取消“吸血鬼只能一楼”，但“必须东窗”保留。其余有效条件不变。现在给出最终入住方案。只输出JSON：rooms是按房号101、102、201、202映射到怪物名的对象；cancelled是已经撤销的两条条件文本列表。不要把上一轮的无解结论沿用到现在。'
        ], dict(turn2={'feasible': False, 'conflict': '吸血鬼仍受一楼且东窗限制，只能102；史莱姆也必须102，两者争用单人房。'},
                answer={'rooms': {'101': '僵尸', '102': '史莱姆', '201': '蝙蝠', '202': '吸血鬼'}, 'cancelled': ['僵尸只能一楼', '吸血鬼只能一楼']},
                explanation='第二轮无解，第三轮有唯一解。蝙蝠二楼西窗只能201，史莱姆102，吸血鬼东窗只能202，僵尸住剩余101。取消的条件不再约束最终排房。'), [
            criterion('第二轮识别冲突', 20, 'feasible=false得10分；指出吸血鬼与史莱姆都被约束到102得10分。', '只满足其中一项得10分；feasible=true时冲突原因项不得分。', '误判可行且未正确解释冲突，0分。'),
            criterion('第三轮有效入住方案', 40, '四房恰好覆盖四怪、无重复；101僵尸、102史莱姆、201蝙蝠、202吸血鬼各10分。', '房号和怪物集合完整且无重复后，按每个正确房位累计。', '缺房、重复怪物或捏造房号/怪物时本项0分。'),
            criterion('撤销记录', 20, '准确列出两条已撤销的一楼限制且无多余撤销，每条10分。', '只列对1条且未额外撤销有效条件，10分；同义表述可接受。', '仍沿用旧限制，或错误撤销东窗/二楼/西窗等有效条件，0分。')
        ], '第2轮和第3轮分别是单个JSON对象，字段及类型符合题面。两轮各5分；无额外说明。', '保留同一会话真实第1—3轮历史；第2、3轮所要求的结果均完整，各5分。',
        gates=['本题必须连续3轮实测；只把最后一轮单独发给模型不计该题成绩。', '内容合格要求第二轮正确识别冲突且第三轮全部有效约束成立。']))

    tasks.append(task(
        'alien-minutes', '外星人会议：谁又替同事答应了？', '提议、撤回和正式确认挤在一起，别把群里一句“要不”写成承诺。',
        '冲突材料整合、版本优先级、证据引用、未知信息保留', '会议未知信息', [
            '请将以下材料整理为当前有效待办。A是原会议记录，B是后来正式确认的修订，C只是未获确认的提议。B覆盖A中明确修改的字段；未修改字段沿用A；C不能作为已确认事实。\n'
            '[A1] 修理牵引光束：小绿负责，周五前完成。\n[A2] 调试传送门：负责人、截止时间均未定。\n[A3] 修补飞船地板：小灰负责，没说截止时间。\n'
            '[B1] 正式修订：牵引光束的周五截止时间撤回，等待配件到货后再确认；没有更换负责人。\n'
            '[B2] 正式确认：传送门由小紫负责，截止周六10:00。\n'
            '[C1] 小蓝在群里说：“要不我周四把光束修了？”没有人确认。\n'
            '只输出JSON对象，唯一字段tasks是3个对象的列表。每项字段task、owner、deadline、sources；sources为支撑当前字段的材料ID列表。未知值统一写“未说明”。不要添加任务，不要把提议当确认，不要自行补具体日期。'
        ], dict(answer={'tasks': [
            {'task': '修理牵引光束', 'owner': '小绿', 'deadline': '未说明', 'sources': ['A1', 'B1']},
            {'task': '调试传送门', 'owner': '小紫', 'deadline': '周六10:00', 'sources': ['A2', 'B2']},
            {'task': '修补飞船地板', 'owner': '小灰', 'deadline': '未说明', 'sources': ['A3']}
        ]}, explanation='顺序不限；任务名、未知项的同义表达可获内容分，格式项按题面另判。传送门sources含B2即可，A2可有可无；光束必须同时有A1/B1，地板A3。C1不可用于支撑已确认事实。'), [
            criterion('任务与负责人', 30, '每项任务与负责人正确对应得10分，共3项。', '任务存在但负责人未知或遗漏，得0；只按正确对应项累计。', '任务遗漏、重复或负责人错配的该项0分。'),
            criterion('版本与截止时间', 20, '光束不再沿用周五且不采纳周四，10分；传送门为周六10:00，10分。', '按两个检查独立累计；“待确认/未确定”等同义未知可获内容分。', '采用失效期限或提议期限的对应检查0分。'),
            criterion('可追溯证据', 20, '光束A1+B1得8分；传送门B2得6分；地板A3得6分；无虚构ID或C1。', '按每行要求累计；混入C1或虚构ID的该行不得分。', '无来源、来源不支撑对应行，0分。'),
            criterion('未知信息与不补事实', 10, '地板截止时间保持未知，且没有新任务或额外承诺，10分。', '地板未知但另增未被支持的任务，5分。', '编造地板期限或把C1变成有效任务，0分。')
        ], '单个JSON，tasks三项及题面字段类型完整得5分；所有未知值统一为“未说明”得5分。同义词不扣内容分，只扣此处格式分。', '3项当前待办完整返回得10分；只返回2项得5分，0—1项得0分。',
        gates=['内容、格式分别核对；“尚未确定”若语义正确，不能据此扣事实内容分。', '公开评分时，标出错误字段与对应原材料ID，不只给一个总分。']))

    tasks.append(task(
        'octopus-move', '章鱼搬家：最近的门，根本挤不过去', '路线画得再漂亮，宽2米的水缸也不能穿过1米门。',
        '图关系、通行约束、最短路径与SVG忠实表达', '斑马SVG的主测位置（斑马保留盲选）', [
            '章鱼要把宽2米且不能拆卸、缩小或旋转减宽的水缸，从房间A搬到E。只有以下6条双向通道，通道宽度至少2米才能过；每条通道给出“宽度/耗时”：A—B为1米/1分钟，A—C为2米/4分钟，B—E为2米/1分钟，C—D为2米/2分钟，D—E为2米/3分钟，C—E为1米/1分钟。没有其他通道。求可行的最短耗时路线，并画成示意图。\n'
            '只输出一份800×600独立SVG源码。图中须有且只有A、B、C、D、E五个房间节点，6条通道都画出并标注宽度与耗时；高亮最短可行路线，文字写清路线与总耗时。图形连线必须真实连接对应房间，不能只靠文字宣称路线。视觉美观不计分。\n'
            '不用外部资源、脚本、CSS、foreignObject或动画。可以使用svg、g、path、circle、ellipse、rect、line、polyline、polygon、text、tspan、defs、linearGradient、radialGradient、stop、clipPath、mask、title、desc、use；href和url只允许引用图内ID。不加围栏或额外说明。'
        ], dict(answer='路线A → C → D → E，总耗时4+2+3=9分钟。',
                explanation='删去宽1米的A—B和C—E后，A只有C可走，C之后只有D能通向E，故唯一可行简单路径A—C—D—E也是最短路径。不得添加A—D等不存在的捷径。',
                graph=[['A', 'B', 1, 1], ['A', 'C', 2, 4], ['B', 'E', 2, 1], ['C', 'D', 2, 2], ['D', 'E', 2, 3], ['C', 'E', 1, 1]],
                route=['A', 'C', 'D', 'E'], totalMinutes=9,
                artifact='assets/octopus-reference.svg'), [
            criterion('房间节点', 10, 'A—E五个房间各出现一次且可辨，10分。', '恰好漏1个或多1个房间，5分；其他情况0分。', '无法辨认节点或两个及以上漏/多节点，0分。'),
            criterion('完整拓扑与通道参数', 20, '6条边端点全部正确且无额外边，10分；6条边宽度和耗时全部正确标注，10分。', '每组若仅错/漏1条得5分；错/漏2条及以上该组0分。', '拓扑和参数两组均不满足，0分。'),
            criterion('可行搬运路线', 20, '文字路线A—C—D—E且不用窄门，20分。', '路线可行但含绕行，10分；用不存在或不足2米的门，0分。', '路线不可行或没有明确路线，0分。'),
            criterion('最短耗时', 10, '明确9分钟且等于所列最短路线边权和，10分。', '可行绕行的耗时算对但不是最短，5分。', '总耗时错误、漏写或路线与时间不一致，0分。'),
            criterion('图文连接一致', 20, '高亮A—C、C—D、D—E均真实连接相应节点、无高亮窄门，20分。', '路线文字正确但高亮恰有1处遗漏/错接，10分；其余0分。', '仅用文字宣称路线、没有高亮路线或高亮不可行，0分。')
        ], '唯一800×600、合规且可安全预览的独立SVG得10分；只有围栏等可提取的轻微格式问题得5分。', '完整SVG且路线、耗时、节点和通道说明均有交付；只缺1类信息得5分，截断或无法预览得0分。',
        gates=['图像必须实际打开复核；XML合法、含关键词都不能替代空间关系评分。', '参考图仅为出题方示意，不能当成模型作品或实测结果。']))

    return dict(schemaVersion='playful-development-v1', suiteId='zhufeng-playful-season-20261029-v1',
                scoreVersion='playful-rubric-v1', title='整活挑战 · 新一期', authoredAt='2026-10-29',
                status='unmeasured', publication='public-development-set', modelCalls=0, results=[],
                protocol=dict(content=80, format=10, delivery=10, repeats=None,
                              difficulty='待实测校准', aggregateScore=None,
                              note='这是公开开发题。参考答案已公开，不当作封存题或抗污染测试。每题独立100分，暂不建总榜；实测协议、型号、预算和重复次数尚未确定。',
                              grading='逐项记录证据；内容合格要求所有内容检查通过，格式与交付另列。新分数不与旧八题相加。',
                              revision='首次采集前固定题面与评分版本；修改题意、判据或权重须另立版本，不回改既有成绩。'),
                tasks=tasks)


def reference_svg():
    positions = dict(A=(100, 110), B=(400, 110), C=(100, 340), D=(400, 340), E=(690, 225))
    labels = [(250, 92), (110, 235), (555, 140), (250, 325), (555, 316), (380, 242)]
    bank = make_bank()
    edges = bank['tasks'][-1]['reference']['graph']
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#fff"/><title>出题方参考图：章鱼搬家，A到E共9分钟</title>']
    route = {frozenset(x) for x in zip(['A', 'C', 'D'], ['C', 'D', 'E'])}
    for (a, b, width, minutes), (lx, ly) in zip(edges, labels):
        x1, y1 = positions[a]; x2, y2 = positions[b]
        color = '#3355cc' if frozenset((a, b)) in route else '#83909c'
        dash = ' stroke-dasharray="7 6"' if width == 1 else ''
        parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{6 if color == "#3355cc" else 3}"{dash}/><rect x="{lx-60}" y="{ly-19}" width="130" height="28" fill="#fff"/><text x="{lx}" y="{ly}" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#26313e">{width}米 / {minutes}分钟</text>')
    for label, (x, y) in positions.items():
        parts.append(f'<circle cx="{x}" cy="{y}" r="25" fill="#fff" stroke="#26313e" stroke-width="2"/><text x="{x}" y="{y+7}" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#26313e">{label}</text>')
    parts.append('<text x="55" y="465" font-family="sans-serif" font-size="28" fill="#3355cc">A → C → D → E · 共9分钟</text><text x="55" y="507" font-family="sans-serif" font-size="18" fill="#4c5968">蓝线为搬运路线；灰色虚线为宽1米的禁行通道。</text><text x="55" y="550" font-family="sans-serif" font-size="16" fill="#4c5968">出题方参考示意 · 非模型作品 · 未实测</text></svg>')
    return ''.join(parts)


if __name__ == '__main__':
    bank = make_bank()
    for item in bank['tasks']:
        assert sum(c['max'] for c in item['criteria']) == 100
        assert sum(c['max'] for c in item['criteria'] if c['dimension'] == 'content') == 80
    (ROOT/'dist/data/playful-season.json').write_text(json.dumps(bank, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (ROOT/'dist/assets/octopus-reference.svg').write_text(reference_svg()+'\n', encoding='utf-8')
    print(json.dumps({'tasks': len(bank['tasks']), 'modelCalls': 0, 'results': 0}))
