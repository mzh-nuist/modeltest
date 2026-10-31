// Local-only rendering aid; writes no files to the deployed tree.
import fs from 'node:fs';import path from 'node:path';
import {extractDrawing} from '../dist/completed-suite.js';
import {previewableCheckupSVG} from '../dist/checkup-data.js';
import {checkupSVG} from '../dist/checkup-view.js';
const matrix=JSON.parse(fs.readFileSync(process.argv[2]||'dist/data/effort-matrix.json','utf8'));
const root='results/effort-review-public';fs.mkdirSync(root,{recursive:true});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let count=0;
for(const m of matrix.models)for(const p of m.profiles||[{effort:m.effort,items:m.items}]){
 const cards=[5,7].map(i=>{const a=p.items[i].measurement,pic=extractDrawing(a?.output);return `<article><h2>${esc(matrix.tasks[i].name)}</h2><p>${esc(a?.status||'not_run')} · ${esc(a?.error||'')}</p>${a?.status==='success'&&previewableCheckupSVG(pic.svg)?`${pic.fenced?'<p class="warning">原回答有说明或围栏，仅提取唯一SVG；图形未修改。</p>':''}${checkupSVG(pic.svg,i===7?'看条纹、奔跑、草原、交付。':'看两脚踏板、身体车座、翅膀车把和车轮车架。')}`:'<p>本条件未交付完整、安全可预览的图形。</p>'}</article>`;}).join('');
 const html=`<!doctype html><meta charset="utf-8"><title>${esc(m.name)} ${p.effort} 实图复核</title><style>body{font:16px/1.5 system-ui;margin:24px;background:#f6f5f1;color:#222}h1{font-size:24px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{background:white;padding:16px;min-width:0}iframe{width:100%;height:500px;border:1px solid #ddd}h2{font-size:19px}.warning{background:#fff1d6;padding:8px}</style><h1>${esc(m.name)} / ${p.effort} / 原始实测图</h1><main>${cards}</main>`;
 fs.writeFileSync(path.join(root,m.modelId+'-'+p.effort+'.html'),html);count++;
}
console.log(JSON.stringify({reviewPages:count,output:root}));
