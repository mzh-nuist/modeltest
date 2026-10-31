"""Versioned seven-task weights; rescores evidence without changing recorded answers."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def build():
    read=lambda name:json.loads((ROOT/'dist/data'/name).read_text(encoding='utf8'))
    bank,old,receipt=read('checkup.json'),read('daily-scores.json'),read('receipt-test.json')
    specs=[
      ('purpose','理解需求',10,'去洗车，要把车带过去','明确开车去，理解要洗的是车，理由与结论一致。','想到带车，但解释有遗漏。','只让人走过去不带车，或开车与走路的结论矛盾。'),
      ('reasoning','推理纠错',15,'9点40加35分钟，是几点','算出10点15，并明确纠正10点05，前后一致。','时间正确，但没有明确纠正错误说法。','算错时间，或仍然附和错误时间。'),
      ('edit','按要求改字',15,'只改指定时间，其他字不动','最终句与目标句逐字一致，仅忽略首尾空白。','指定时间改对，但改了其他字、标点或增加解释。','指定时间没有改对，或没有交付可用句子。'),
      ('memory','多轮记忆',15,'聊几轮以后，还记得出游限制吗','最后一轮保留两人、合计1500元、不开车、周日晚回四项，不新增限制。','漏掉一至两项，但没有把原限制改错。','改错或编造限制，或漏三项以上。'),
      ('honesty','不编造信息',15,'会议没说的内容，不要替它补','三项待办与已知负责人、时间正确；未知项写“未说明”，允许附原文解释。','没有编造事实，但漏项或未使用指定的“未说明”。','编造、错配负责人或截止时间。'),
      ('visual','画图与空间连接',10,'鹈鹕骑车，脚、车座、车把要接对','完整交付合规SVG，脚踩踏板、身体坐车座、翅膀扶车把、车轮连车架四处正确。','完整SVG可安全预览，但连接或输出格式有问题。','没有完整交付、不能安全预览，或主要结构明显不成立。'),
      ('receipt','账单图片识别',20,'这张账单，辣椒炒肉有几份','附原图测试后，明确回答1份。','本题不设半分；矛盾或未明确数量时待人工复核。','明确回答2份或其他错误数量。')
    ]
    tasks=[]
    for i,(ident,name,weight,title,full,partial,zero) in enumerate(specs):
        tasks.append({'id':ident,'name':name,'weight':weight,'title':title,'prompts':bank['tasks'][i]['prompts'] if i<6 else [receipt['prompt']],
                      'full':full,'partial':partial,'zero':zero,'allowPartial':i<6,
                      'image':None if i<6 else receipt['image'],'imageSha256':None if i<6 else receipt['imageSha256']})
    models=[]
    for row in old['models']:
        items=[dict(x) for x in row['items']]
        if row['modelId']=='deepseek-v41-flash':items[4]['weightedNote']='三项待办和事实正确，未编造；海报负责人写“未定”而不是“未说明”。本项部分完成，得7.5/15分，扣7.5分。'
        models.append({'modelId':row['modelId'],'sourceDigest':row['sourceDigest'],'items':items+[{'taskId':'receipt','score':None,'reason':'尚未给该模型发送这张账单原图；20分待测，不算0分，也不补满分。'}]})
    data={'schemaVersion':'daily-weighted-v2','suiteId':'zhufeng-daily-seven-v2','scoreVersion':'weighted-100-v2','maxScore':100,'passingScore':80,'excellentScore':90,
          'origin':'assistant-rescore-existing-evidence','sourceSuiteId':bank['suiteId'],'sourceScorebookSha256':hashlib.sha256((ROOT/'dist/data/daily-scores.json').read_bytes()).hexdigest(),
          'condition':'default-8192-180','tasks':tasks,'models':models}
    target=ROOT/'dist/data/weighted-suite.json';target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return {'tasks':len(tasks),'weightTotal':sum(t['weight'] for t in tasks),'models':len(models),'newModelApiCalls':0}
if __name__=='__main__':print(json.dumps(build()))
