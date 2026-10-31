"""Build the next public development version, adding the approved animated task.

No model client or network access. The original five development tasks are reused
without modifying their prompts or rubric, and measured records are never read.
"""
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.prepare_playful_season import make_bank,task,criterion

def build_bank():
    bank=make_bank()
    prompt=('请制作一段“鹈鹕骑自行车”的连续循环动画。画面大小800×600，侧面视角，自行车朝右。镜头跟随自行车，车身大致保持在画面中央，可以用地面标线向左移动表现前进。\n'
      '必须满足：\n'
      '1. 能认出鹈鹕和完整自行车，车架、两个车轮、车把、车座和曲柄结构清楚。\n'
      '2. 两只脚各自始终踩在对应踏板上；两个踏板绕同一个曲柄中心转动，始终相差180度，不能只把脚画在附近。\n'
      '3. 踏板持续绕完整一圈，腿的弯曲和伸展随踏板位置连续变化，不能让整只鸟绕曲柄旋转来代替踩踏。\n'
      '4. 两个车轮持续同向向前转动，轮辐清晰，使人能看出车轮确实在转。\n'
      '5. 身体始终坐在车座上，两翼始终扶住车把；允许小幅自然起伏，但不能脱离接触点或整体翻转。\n'
      '6. 动画启动后自动播放，以2秒为一个完整踩踏周期，持续循环。循环衔接不能明显跳变，不能用静态图、闪烁或整幅画平移代替骑车动作。\n'
      '只输出一份独立SVG源码，不加解释和代码围栏。不使用外部资源、脚本、事件处理器、CSS、foreignObject或外链。静态图形可用svg、g、path、circle、ellipse、rect、line、polyline、polygon、text、tspan、defs、linearGradient、radialGradient、stop、clipPath、mask、title、desc、use；动画仅使用animate与animateTransform，所有引用仅指向图内ID。')
    item=task('dynamic-pelican','鹈鹕骑车：脚可别从踏板上飞走了','轮子在转，脚却飞了；这次看三个完整周期。',
      '跨时间的空间连接、脚踏联动、腿部弯伸、连续循环动画','鹈鹕静态SVG的动态升级；第一期原答卷和成绩保留',
      [prompt],dict(answer='两脚随对应踏板运动，两踏板同心且相差180度；腿连续弯伸；车轮同向向前转；身体接座、两翼接把；2秒一个完整踩踏周期，持续循环且衔接连续。',
       explanation='这是出题方的核验清单，不是模型答卷或示范动画，也不要求唯一画风或绘图实现。需观察真实播放与固定时间点，不能从动画标签或单张截图推断通过。'),[
       criterion('脚踏联动',30,'每侧15分：脚持续贴着对应踏板，踏板带脚绕曲柄中心完整一圈。','每侧15×该侧通过帧数/36，两侧相加，保留2位小数；未绕完整一圈的该侧0分。','脚或踏板不动、分离或没有对应关系的该侧0分。'),
       criterion('腿部连续弯伸',20,'每侧10分：腿持续连接身体与脚，并随踏板位置连续弯伸。','每侧10×该侧通过帧数/36，两侧相加，保留2位小数；未出现连续弯伸的该侧0分。','断腿、脚腿分离或整体旋转鸟身代替踩踏的该侧0分。'),
       criterion('曲柄中心与踏板相位',10,'两个踏板围绕共同中心运动，始终相差180度，10分。','10×通过帧数/36，保留2位小数；须先观察到踏板绕完整一圈。','踏板不转、不同心或全程不满足相位关系，0分。'),
       criterion('车轮转动',10,'每轮5分：轮辐持续同向向前转，轮心与车架连接稳定。','每轮5×该轮通过帧数/36，两轮相加，保留2位小数。','对应车轮静止、方向错误或轮心脱离车架的该轮0分。'),
       criterion('稳定骑姿',10,'身体与车座持续接触5分；两翼持续扶住车把5分。','两个检查分别按5×通过帧数/36累计，保留2位小数。','漂浮、脱座或翼端脱离车把的对应检查未通过；鸟身整体翻转不合格。')
      ],'800×600独立SVG且符合本题资源和动画元素限制，10分；唯一合规SVG外有说明或围栏得5分；格式不成立或不符合安全要求得0分。',
      '完整可播放5分；2秒踩踏周期、自动持续循环且衔接连续5分。截断或不可播放0分。',
      gates=[
       '在同一浏览器版本、画布和播放起点下，正常播放至少3个完整周期。稳定周期每隔1/12周期取帧，共36个观察帧，并额外核对0、2、4、6秒循环边界。',
       '内容合格要求所有内容检查在全部观察帧成立，并观察到踏板绕完整一圈；分数累计不能替代合格门槛。',
       '轮子转但脚不转、脚转但踏板不转、整只鸟跟着曲柄旋转、仅首帧接上，均不能算动态内容合格。',
       '看不清接触点、遮挡或取帧失败时，相关内容项保留待复核，不推断满分；逐项记录失败时间点与截图。',
       '未通过独立动画安全检查的答卷不直接播放，原文保留，格式与交付不合格，内容标未核验，不给最终总分。',
       '不按画风美丑评分，不要求相同DOM、配色或实现。旧静态SVG白名单不因本题放宽。'],
      scoreVersion='dynamic-pelican-v1',responseFormat='animated-svg-only',
      observation=dict(periodSeconds=2,cycles=3,samplesPerCycle=12,totalFrames=36,boundarySeconds=[0,2,4,6],
       note='先观察连续播放，再取固定时间点核对；每个子项按36帧中的通过比例计分，局部遮挡或无法定位时待复核。'))
    # The common helper's partial anchors apply to text tasks; animation has two
    # independent delivery checks and a stricter resource gate.
    item['criteria'][-2]['partial']='唯一合规SVG外有说明或围栏，5分；资源或安全限制不符合不能按轻微格式问题处理。'
    item['criteria'][-2]['zero']='不是独立SVG、尺寸不符，或不符合本题资源和安全限制，0分。'
    item['criteria'][-1]['partial']='两个交付检查分别成立得5分；静态图不能获得自动循环与周期分。'
    item['criteria'][-1]['zero']='截断、不可播放或无可用最终答卷，0分。'
    bank['tasks'].append(item)
    bank.update(suiteId='zhufeng-playful-season-20261031-v2',scoreVersion='playful-rubric-v2',authoredAt='2026-10-31')
    return bank

if __name__=='__main__':
    bank=build_bank()
    for item in bank['tasks']:
        assert sum(c['max'] for c in item['criteria'])==100
        assert sum(c['max'] for c in item['criteria'] if c['dimension']=='content')==80
    (ROOT/'dist/data/playful-season.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'tasks':len(bank['tasks']),'suiteId':bank['suiteId'],'modelCalls':0,'results':0}))
