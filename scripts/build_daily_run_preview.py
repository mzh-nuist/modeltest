"""Render saved six-check answers locally; does not call or grade a model."""
import argparse
import html
import json
import re
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner.checkup import load_bank,previewable_svg,validate_report


def build(folder):
    folder=Path(folder);bank=load_bank();out=folder/'preview';out.mkdir(exist_ok=True)
    style='<style>body{max-width:1000px;margin:24px auto;padding:16px;background:#f4f2ec;color:#222;font:17px/1.7 sans-serif}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px}img{width:800px;max-width:100%;display:block}article{margin:24px 0}a{color:#24577c}</style>'
    cards=[];models_rendered=0
    for f in sorted(folder.glob('*/public.json')):
        report=json.loads(f.read_text(encoding='utf-8'));validate_report(report,bank);ident=f.parent.name
        models_rendered+=1
        name=html.escape(report['modelLabel']);parts=[]
        visual=report['runs'][-1];svg=visual['outputs'][0]
        if visual['status']=='complete' and previewable_svg(svg):
            (out/(ident+'.svg')).write_bytes(svg.encode('utf-8'))
            picture='<img src="'+ident+'.svg" alt="'+name+'实际返回的鹈鹕骑车图">'
        else:picture='<p>本次没有完整、可安全预览的 SVG。'+html.escape(visual['note'])+'</p>'
        drawing='<!doctype html><html lang="zh"><meta charset="utf-8"><title>'+name+' · 鹈鹕实测</title>'+style+'<h1>'+name+' · 实际画面</h1><p>要求：两只脚踩踏板、身体坐车座、翅膀扶车把、车轮与车架连接合理。模型原始图形未修改。</p>'+picture+'</html>'
        (out/(ident+'-visual.html')).write_text(drawing,encoding='utf-8')
        for task,row in zip(bank['tasks'],report['runs']):
            text=''.join('<h3>第'+str(i+1)+'轮</h3><p>'+html.escape(prompt)+'</p><pre>'+html.escape(answer or '尚无回答')+'</pre>' for i,(prompt,answer) in enumerate(zip(task['prompts'],row['outputs']))) if task['id']!='visual' else picture
            parts.append('<article><h2>'+html.escape(task['title'])+'</h2><p>采集状态：'+html.escape(row['status'])+' '+html.escape(row['note'])+'</p>'+text+'</article>')
        page='<!doctype html><html lang="zh"><meta charset="utf-8"><title>'+name+' · 六项真实回答</title>'+style+'<h1>'+name+'</h1><p>真实 API 采集；这里展示原文，采集完成不代表回答正确，尚未冒充用户人工评分。</p>'+''.join(parts)+'</html>'
        (out/(ident+'.html')).write_text(page,encoding='utf-8')
        complete=sum(r['status']=='complete' for r in report['runs'])
        cards.append('<li><a href="'+ident+'.html">'+name+'</a>：'+str(complete)+'/6 项采集完整；<a href="'+ident+'-visual.html">看画图</a></li>')
    for f in sorted((folder/'visual-low').glob('*.json')):
        row=json.loads(f.read_text(encoding='utf-8'))
        if not isinstance(row,dict) or 'apiModel' not in row or row.get('status')!='success':continue
        svg=row['output'];note='原始独立SVG；图形未修改。'
        fence=re.fullmatch(r'\s*```(?:svg|xml)?\s*([\s\S]*?)\s*```\s*',svg,re.I)
        if fence:svg=fence.group(1);note='仅为显示移除了外层代码围栏，图形未修改；原始答卷未遵守不加围栏的格式要求。'
        if not previewable_svg(svg):continue
        ident=row['modelId']+'-low';name=html.escape(row['modelName'])
        (out/(ident+'.svg')).write_bytes(svg.encode('utf-8'))
        page='<!doctype html><html lang="zh"><meta charset="utf-8"><title>'+name+' · 低推理档画图</title>'+style+'<h1>'+name+' · 低推理档补测</h1><p>同一道鹈鹕题；低推理档，输出上限32768。</p><p>'+note+'</p><img src="'+ident+'.svg" alt="模型实际生成的鹈鹕骑自行车"></html>'
        (out/(ident+'.html')).write_text(page,encoding='utf-8')
        cards.append('<li><a href="'+ident+'.html">'+name+'：低推理档画图补测</a></li>')
    (out/'index.html').write_text('<!doctype html><html lang="zh"><meta charset="utf-8"><title>五模型六项实测 · 原始答卷</title>'+style+'<h1>五模型六项实测 · 原始答卷</h1><p>采集完整与答对分别判断。不使用综合总分。</p><ul>'+''.join(cards)+'</ul></html>',encoding='utf-8')
    return models_rendered


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');a=p.parse_args()
    print(json.dumps({'modelsRendered':build(a.folder),'modelApiCalls':0}))
