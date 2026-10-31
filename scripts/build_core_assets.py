"""Build pilot task/metric definitions only; never fetch models or generate scores."""
import copy
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner.core_suite import build_suite,SUITE
from runner.core import validate_document

ROOT=Path(__file__).resolve().parents[1]


def build():
    tasks,_=build_suite();old=json.loads((ROOT/'dist/data/measured.json').read_text(encoding='utf-8'))
    models=copy.deepcopy([m for m in old['models'] if m['maxOutputTokens']==1536])
    for m in models:
        m.update(status='catalog',inputPrice=None,outputPrice=None,cachedInputPrice=None,
                 description='GOAT历史配置目录，非本轮可用性保证。新协议尚无真实采集；报价需重新核验，显示为空。规格沿用历史声明快照。')
    d={'schemaVersion':'1.0','meta':{'title':'核心试测 v1 · 尚无真实成绩','updatedAt':'2026-10-25T00:00:00Z','kind':'catalog','protocolId':'core-client-v1','suiteId':SUITE,
         'description':'本轮新增API费用0。24道试测题，18道自动验证、6道人工细评；题目区分度未做真实校准。六个GOAT历史配置待重新核验。此数据集只有题库和目录，没有模型运行或成绩。'},
       'models':models,'tasks':tasks,'runs':[],'batches':[]}
    errors=validate_document(d)
    if errors:raise ValueError(errors)
    def save(path,value):
        (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    save('datasets/core_v1.json',tasks);save('dist/data/core.json',d)
    definitions=[
      ('body-tps','速度性能','正文TPS','token/s','首块之后可靠可见token数 / 首末正文块间隔。至少3块、0.5秒、后续64token；缺首块计数留空。','AIPerf','https://github.com/ai-dynamo/aiperf/blob/main/docs/metrics-reference.md','协议参考；本站core-client-v1明确首块处理','implemented','GOAT现有终结用量通常不足以拆首块，不能强填。'),
      ('e2e-tps','速度性能','端到端正文速率','token/s','可靠可见正文token / 请求完整耗时，包含等待。','本站协议',None,'不与正文生成速度混排','implemented','无法拆分推理用量时仍留空。'),
      ('chars','速度性能','字符速度','字符/s','首块之后Unicode字符数 / 首末正文块间隔，含标点空白，至少64字符。','本站辅助指标',None,'仅相同语言与长度分组比较','implemented','不同tokenizer的辅助阅读速度。'),
      ('ttft','速度性能','TTFT / TTFA','秒','请求发送到首个有效内容 / 首个正文，空事件不计。','AIPerf','https://github.com/ai-dynamo/aiperf/blob/main/docs/metrics-reference.md','首正文为本站明确口径；展示P50和样本数','implemented','包含网络与排队，不是内部计算时间。'),
      ('duration','速度性能','完整响应耗时','秒','从请求开始至结束；失败保留错误耗时，成功耗时单独统计。','AIPerf','https://github.com/ai-dynamo/aiperf/blob/main/docs/metrics-reference.md','P50；同条件成功样本≥100才展示P95','implemented','小样本不作服务承诺。'),
      ('gaps','速度性能','分块间隔','毫秒','非空正文块之间的客户端到达间隔。','AIPerf','https://github.com/ai-dynamo/aiperf/blob/main/docs/metrics-reference.md','每次记录块间P50/P95；不冒称逐token ITL','implemented','分块、缓冲影响该值。'),
      ('throughput','速度性能','并发吞吐','请求/s','固定负载逐级增加并发，并报告限流与错误。','AIPerf','https://github.com/ai-dynamo/aiperf','独立专项，不与串行TPS混合','planned','现有运行器串行；本轮0费用，不压测GOAT。'),
      ('math','能力质量','数学与推理','正确率 / 细项分','数值与JSON可验证题；证明按公开锚点复核。','MathArena','https://matharena.ai/','参考题型；本站试测不叫官方成绩','implemented','4道自动、2道证明人工待评；难度未校准。'),
      ('data','能力质量','数据分析','细项正确率','复算去重、关联、统计、成本与泄漏控制。','LiveBench','https://github.com/LiveBench/LiveBench','本站6题；计算与结论逐项验证','implemented','原创编排；不是LiveBench复现。'),
      ('instruction','能力质量','指令遵循','约束满足率','严格JSON、行段字数、关键词、材料伪指令等。','IFEval','https://arxiv.org/abs/2311.07911','逐项满足率与全部合格率分别报告','implemented','本站中文扩展，不能冒称IFEval原始分。'),
      ('context','能力质量','材料证据与长上下文','正确率','版本冲突、未知项、分散证据多跳关联。','RULER / HELMET','https://github.com/NVIDIA/RULER','本站两题验证链路；尚无有效窗口结论','implemented','没有长输入阶梯真实采集。'),
      ('writing','能力质量','中文写作与编辑','细项分','素材忠实、用途、结构、语气的零/半/满分锚点评审。','WritingBench','https://github.com/X-PLUG/WritingBench','人工逐项证据与别名；未评保持pending','review','2道题与复核CLI已接入；无新真实评审。'),
      ('code','能力质量','代码 pass@1','通过率','隔离运行完整隐藏测试，不执行宿主机任意输出。','LiveCodeBench','https://github.com/LiveCodeBench/LiveCodeBench','实际执行前不发布pass@1','blocked','当前未发现Docker/Podman，未验证隔离执行环境；仅准备人工标准。'),
      ('svg','能力质量','SVG / 鹈鹕','细项分','静态子集检查，实际渲染后按结构/空间/约束评分。','Simon Willison','https://simonwillison.net/2024/Oct/25/pelicans-on-a-bicycle/','10+15+20+25+20+10；仅语法检查不能给视觉分','review','静态检查和细则可用；真实渲染评审未做。'),
      ('facts','能力质量','事实与科学知识','正确/错误/未答','可核查事实及专业题按原协议与专家参考核验。','SimpleQA / GPQA','https://cdn.openai.com/papers/simpleqa.pdf','官方复现与本站任务分开','planned','当前没有受核验的新专业题与专家评审。'),
      ('tools','能力质量','原生工具调用','任务成功率','实际调用可重置的模拟工具并核对最终状态。','BFCL','https://gorilla.cs.berkeley.edu/blogs/8_berkeley_function_calling_leaderboard.html','不以文本计划代替执行','planned','现有适配器拒绝工具流；本轮不冒充接入。'),
      ('vision','能力质量','图像/音频理解','分项准确率','原生图片、图表、音频输入，按对应协议评估。','MMMU / FLEURS','https://github.com/MMMU-Benchmark/MMMU','与文本SVG生成分开','planned','本轮无多模态接入或评分。'),
      ('completion','可靠性','完整返回率 / 错误分类','%','完整成功 / 全部已发出尝试；跳过不计。','本站运行日志',None,'错误、超时、截断、限流分别保留','implemented','接口成功与内容正确分开。'),
      ('qualification','可靠性','合格交付率','%','自动题先算合格次数/已发出尝试，再按题、题族等权。','本站评分协议',None,'未复核题显示判定覆盖，不宣称完整合格率','implemented','人工待评不会补为通过。'),
      ('repeat','可靠性','同题重复表现','分布','按批次/题目/repeatIndex聚合，重试不充独立样本。','本站重复协议',None,'展示重复单元与分歧题，不把稳定错答当高能力','implemented','旧重复批次可作历史观察。'),
      ('robust','可靠性','鲁棒性与校准','分项指标','等价变体成对验证；置信度与实际对错对齐。','CheckList','https://github.com/marcotcr/checklist','无匹配样本不发布分数','planned','尚无校准或等价变体真实采集。'),
      ('safety','可靠性','安全与抗注入','攻击/正常成功率','固定规则下同时看攻击成功、正常完成和误拒。','AgentDojo','https://github.com/ethz-spylab/agentdojo','不能靠拒绝全部任务得高分','planned','材料伪指令小题不冒充安全benchmark。'),
      ('cost','成本规格','全部尝试费用','USD','已报告用量×带日期报价；失败也计费，任一未知则总计未知。','服务商报价 / 账单',None,'估算与账单核验分开；本轮模拟0费用不是GOAT报价','implemented','旧费用仅名义估算，未核验账单。'),
      ('qualified-cost','成本规格','每个合格结果费用','USD/合格结果','全部相关尝试费用 / 合格结果数。','本站成本协议',None,'未知费用、人工待评或零合格时不伪造数值','implemented','同时展示未知和待评数量。'),
      ('specs','成本规格','上下文与输出上限','token','厂商声明、接口配置与实测范围分别记录。','官方文档 / 配置',None,'容量规格不换算成能力分','implemented','GOAT目录使用历史快照，不保证当前支持或价格。')]
    rows=[dict(zip(('id','group','title','unit','method','reference','sourceUrl','scoring','state','limit'),r)) for r in definitions]
    save('dist/data/framework.json',{'version':'eval-system-v1','metricProtocol':'core-client-v1','gradingProtocol':'core-rubric-v1','updatedAt':'2026-10-25','budgetUsd':0,'rows':rows})
    print(json.dumps({'tasks':len(tasks),'automatic':18,'manual':6,'metricDefinitions':len(rows),'realRunsAdded':0},ensure_ascii=False))


if __name__=='__main__':build()
