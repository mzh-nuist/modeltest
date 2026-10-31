"""Build attributed catalogue and strictly separate synthetic demo. No API calls."""
import json, random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOW = '2026-10-23T23:00:00+08:00'
tasks = []
def add(category, title, prompt, reference, kind='manual', expected=None, difficulty='medium', rubric=None):
    task={'id':f'{category}-{sum(t["category"]==category for t in tasks)+1:02d}', 'category':category,'title':title,'prompt':prompt,'reference':str(reference),'difficulty':difficulty,'rubric':rubric or ['回答符合题目条件','结果与参考一致；开放性题目需人工检查论证'],'maxOutputTokens':1200,'grader':{'type':kind},'source':'逐风起步题库 v1 · 原创设计，待扩大校核'}
    if expected is not None: task['grader']['expected']=expected
    tasks.append(task)

add('math','独立事件的条件概率','A、B 独立，P(A)=0.4，P(B)=0.5。只输出 P(A|B) 的十进制数。','0.4','exact','0.4','easy')
add('math','交换极限的漏洞','对 f_n(x)=n·1_(0,1/n)(x)，定义域 [0,1]。有人由逐点趋于0推出积分趋于0。指出错误并计算各积分。','逐点趋于0，但积分均为1；缺少支配收敛等可交换条件。')
add('math','矩阵行列式','矩阵 [[1,2],[3,4]] 的行列式是多少？只输出整数。','-2','exact','-2','easy')
add('math','连续与一致连续','给出一个在实数集上连续但不一致连续的函数，并用定义或序列证明。','例如 x²，取 x_n=n、y_n=n+1/n，距离趋于0而函数差趋于2。')
add('math','贝叶斯基率','患病率1%，灵敏度90%，假阳性率9%。阳性者患病概率是多少？给出分式与计算。','0.009/(0.009+0.0891)=10/109≈9.1743%。')
add('math','图的最短路径','有向图边 A→B=3，A→C=10，B→C=2，C→D=4，B→D=12。A 到 D 最短距离？只输出整数。','9','exact','9','easy')
add('math','凸性条件','有人声称 f″(x)≥0 蕴含 f 严格凸。判断并给出反例，说明正确关系。','二阶导非负在相应光滑区间条件下保证凸，不保证严格凸；仿射函数是反例。')
add('math','抽样方差','样本 [1,2,3] 的无偏样本方差是多少？只输出整数。','1','exact','1','easy')
add('data','去重后的收入','订单数据：a,10；b,20；a,10；c,5。按订单ID去重后总收入？只输出整数。','35','exact','35','easy')
add('data','加权转化率','渠道 A：10/100 转化；渠道 B：90/300 转化。合并后的转化率是多少？只输出小数。','0.25','exact','0.25','easy')
add('data','平均数与中位数','数据 [1,2,2,3,100]。请只输出 JSON，键 mean 和 median，值为数值。','{"mean":21.6,"median":2}','json_fields',{'mean':21.6,'median':2})
add('data','缺失值的解释','表中用户甲收入0，用户乙收入缺失。分析时能否都填0？说明何时可填、需要保留什么信息。','零与未知不同；需依据缺失机制和业务定义处理，保留缺失标志和处理假设。')
add('data','同比增长','去年收入80，今年收入100。同比增长率是多少？只输出小数。','0.25','exact','0.25','easy')
add('data','分组聚合','记录 [{"g":"A","v":2},{"g":"B","v":3},{"g":"A","v":5}]。按组求和，只输出 JSON。','{"A":7,"B":3}','json_fields',{'A':7,'B':3})
add('data','相关性与干预','观察到使用新工具的人绩效更高。能否得出工具使绩效提高？提出至少两种替代解释和一种验证设计。','可能有自选择、资历或任务差异；需随机实验或明确识别假设的准实验。')
add('data','重复运行与样本量','同一道题运行100次，与100道不同题各运行1次，能否作为相同证据来比较模型整体能力？解释独立性和覆盖差异。','不能；前者衡量该题稳定性，题目覆盖与有效独立样本不同。')
add('chinese','忠实提取会议结论','材料：团队计划下周测试新界面。预算尚未批准。小林负责整理问卷；上线日期未定。仅列出已确定事项，不补充安排。','已确定小林整理问卷；下周测试是计划。不得把预算或上线日期写为已确定。')
add('chinese','保留原稿中的不确定性','把“我试了一次，觉得它好像更适合整理材料，复杂推理还没测”改得简洁自然，保留事实范围与不确定性。','保留一次体验、材料整理印象和复杂推理未测，不扩大成普遍性能结论。')
add('chinese','按材料回答并承认未知','材料：产品A支持导出TXT和Markdown。材料未提及PDF。用户问是否支持PDF。只根据材料回答。','根据材料无法确认PDF支持；不能从未提及推断一定不支持。')
add('chinese','结构化信息提取','材料：订单 ZF-17，商品笔记本，数量2，单价18元。只输出 JSON，字段 orderId、quantity、total。','{"orderId":"ZF-17","quantity":2,"total":36}','json_fields',{'orderId':'ZF-17','quantity':2,'total':36})
add('chinese','辨认比较口径','甲模型用官方API在上海测，乙模型用转发接口在海外测。甲更慢。写一段严谨的测评结论，指出还能验证什么。','结论限定于当前端点和环境，需控制网络、服务商、输入长度等，不能直接断言模型本体更慢。')
add('chinese','不虚构第一人称经历','用户只提供“我想试试用AI写学习笔记”，请写一条中文短帖，不虚构已完成测试、收益或读者反馈。','表达计划、疑问或预期；不得写成已经测试成功。')
add('chinese','多条件摘要','材料：试验有20人参加，持续两周，未设置对照组，15人自报满意。写不超过80字的摘要，保留样本、时长和限制。','含20人、两周、15人自报满意及无对照组；不推出效果因果。')
add('chinese','冲突信息处理','材料1写发布时间周三，材料2写周五，两份都没有版本号。用户问哪天发布。请回答并说明最小核实动作。','指出冲突，不能自行选定；核实最新负责人确认或权威版本。')
add('code','稳定去重函数','用 Python 实现 stable_unique(items)，保持第一次出现顺序。输入是可哈希元素；提供空列表、重复值和混合元素的测试。','可用集合记录已见并按输入顺序追加；空列表返回[]。人工检查代码与测试。')
add('code','修复可变默认参数','修复 Python：def append_item(x, items=[]): items.append(x); return items。解释跨调用问题并给出验证示例。','默认参数使用None，在函数体内创建列表；独立调用不共享历史。')
add('code','正确处理分母为零','实现 conversion_rate(success,total)，要求 0≤success≤total，total为0时返回None，非法输入抛ValueError。提供边界测试。','检查范围、负数和零分母；人工验证实现是否满足契约。')
add('code','防止SQL注入','Python sqlite3 查询 users 表的name字段，用户输入不可拼接到SQL。写查询函数并解释参数绑定。','使用 SELECT ... WHERE name = ? 和独立参数元组。')
add('code','流式解析边界','SSE数据可能跨网络块分割，一个块也可能包含多条事件。描述正确解析过程，并解释为何不能按chunk数计算token数。','按行和空行事件边界缓冲，处理UTF-8与data多行；chunk不是token。')
add('code','缺失费用不能计作免费','实现 sum_cost(costs)，列表中任一元素为None则返回None，否则求和。输入为非负数或None；给出测试。','[0,1]→1；[1,None]→None；[]的契约须明确。')

def model(id,name,family,provider,version,context,output,inp,out,url,description,cache=None,note='',endpoint=None):
    return dict(id=id,name=name,family=family,provider=provider,endpoint=endpoint,version=version,reasoning='未实测 / 待指定',contextWindow=context,maxOutputTokens=output,inputPrice=inp,outputPrice=out,cachedInputPrice=cache,currency='USD',sourceUrl=url,sourceDate='2026-10-23',tags=[family,'官方资料'],status='catalog',description=description,priceNote=note)
ds='https://api-docs.deepseek.com/quick_start/pricing/'
cl='https://platform.claude.com/docs/en/models/sonnet-4-6/overview'
models=[
 model('deepseek-flash','DeepSeek V4.1 Flash','DeepSeek','DeepSeek 官方','DeepSeek-V4.1-Flash-1017',1000000,384000,.3,1.2,ds,'官方文档列出的 Flash 配置，支持思考与非思考模式。',.006,'展示峰时、缓存未命中报价；离峰为半价，时段与节假日条件见官方来源。','https://api.deepseek.com'),
 model('deepseek-v4-pro','DeepSeek V4 Pro','DeepSeek','DeepSeek 官方','DeepSeek-V4-Pro-0813',1000000,384000,1.32,3.96,ds,'官方文档列出的 Pro 配置。',.044,'展示峰时、缓存未命中报价；离峰为半价，时段与节假日条件见官方来源。','https://api.deepseek.com'),
 model('claude-sonnet-4-6','Claude Sonnet 4.6','Claude','Anthropic 官方','claude-sonnet-4-6',1000000,128000,3,15,cl,'官方文档列为 Legacy，仍可用；新项目应核实当前型号。',.3,'标准输入输出价；缓存写入、批处理等条件另计。'),
 model('claude-sonnet-5-5-catalog','Claude Sonnet 5.5','Claude','Anthropic 官方','Sonnet 5.5 · API ID待接入核实',1000000,128000,2,10,cl,'来源页面当前型号比较表所列规格；尚未核验具体 API 接入。',note='来源比较表中的标准价；具体使用条件以型号文档为准。'),
 model('claude-opus-5-5-catalog','Claude Opus 5.5','Claude','Anthropic 官方','Opus 5.5 · API ID待接入核实',1000000,128000,4,20,cl,'来源页面当前型号比较表所列规格；尚未核验具体 API 接入。',note='来源比较表中的标准价；具体使用条件以型号文档为准。'),
 model('gemini-2-5-pro','Gemini 2.5 Pro','Gemini','Google 官方','gemini-2.5-pro',1048576,65536,None,None,'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro','官方页面说明限已有使用记录的用户接入；新项目应查看当前型号。',note='本次未核对计价页面，报价留空。')]
catalog={'schemaVersion':'1.0','meta':{'title':'逐风官方资料目录','updatedAt':NOW,'kind':'catalog','description':'6 个示例目录条目；仅核对官方公开资料，无本站模型实测，非全量当前模型清单。'},'models':models,'tasks':tasks,'runs':[],'batches':[]}
rng=random.Random(303)
demo=json.loads(json.dumps(catalog));demo['meta']={'title':'交互功能演示 · 全部成绩虚构','updatedAt':NOW,'kind':'demo','description':'合成演示数据；全部模型名称与运行结果均为虚构，不代表任何实际模型性能。'}
names=['星河 Research','青禾 Flash','远山 Reason','拾光 Writer','白鹭 Code','竹影 Lite']
for i,m in enumerate(demo['models']):
    m.update(id=f'demo-{i+1}',name=names[i],family='虚构模型',provider='演示服务商',version=f'synthetic-v1-{i+1}',reasoning='演示档位',sourceUrl=None,endpoint=None,status='demo',description='此配置由程序生成，仅演示数据查看、筛选及比较功能。',tags=['虚构','演示'],inputPrice=round(.2+i*.3,2),outputPrice=round(.8+i*1.1,2),cachedInputPrice=None,priceNote='虚构报价，无实际服务。')
batch={'id':'demo-batch-001','title':'起步题库交互演示','createdAt':NOW,'status':'completed','dataKind':'demo','description':'30 道原创起步题 × 6 个虚构配置 × 3 次合成重复；全部记录为演示，不是模型调用。','config':{'region':'synthetic-local','concurrency':1,'repeats':3,'timeoutSeconds':60,'budgetUsd':10},'taskIds':[t['id'] for t in tasks],'modelIds':[m['id'] for m in demo['models']]}
demo['batches']=[batch]
for mi,m in enumerate(demo['models']):
 for ti,t in enumerate(tasks):
  for rep in range(3):
   n=len(demo['runs'])+1;error=n%47==0;passed=rng.random()<(.70+mi*.035);manual=t['grader']['type']=='manual';duration=round((3+mi+ti*.05+rng.random()*4)*1000);ttfa=round(250+mi*220+rng.random()*400)
   grade='not_applicable' if error else 'pending' if manual else 'passed' if passed else 'failed'
   output='' if error else t['reference'] if manual or passed else '（演示错误答案）'
   demo['runs'].append({'id':f'demo-run-{n:04d}','batchId':batch['id'],'modelId':m['id'],'taskId':t['id'],'status':'error' if error else 'success','dataKind':'demo','timestamp':NOW,'output':output,'error':'合成超时示例，未调用任何模型' if error else None,'metrics':{'ttftMs':ttfa-100 if not error else None,'ttfaMs':ttfa if not error else None,'durationMs':duration,'outputTps':round(35+mi*12+rng.random()*15,1) if not error else None,'charsPerSec':round(30+mi*10+rng.random()*10,1) if not error else None,'inputTokens':200+ti*4,'outputTokens':None if error else 240+mi*35,'reasoningTokens':None,'cost':round(.0006+mi*.0007+rng.random()*.0004,6)},'grading':{'status':grade,'score':1 if grade=='passed' else 0 if grade=='failed' else None,'reason':'合成演示评分；人工题保持待评状态。'},'config':{'region':'synthetic-local','concurrency':1,'temperature':0,'reasoning':'synthetic','cacheState':'synthetic'},'provenance':{'adapter':'synthetic-generator','tokenCountSource':'synthetic','timingSource':'synthetic'}})
for name,d in [('catalog',catalog),('demo',demo)]:
 (ROOT/'dist'/'data'/f'{name}.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'datasets'/'tasks.json').write_text(json.dumps(tasks,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Built {len(models)} catalogue models, {len(tasks)} tasks, {len(demo["runs"])} synthetic runs')
