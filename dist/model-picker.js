import {modelBadge} from './model-identity.js?v=20261031-player6';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chevron='<svg class="picker-chevron" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function modelPicker(models,selected,side){
  const model=models.find(m=>m.id===selected);
  if(!model||![0,1].includes(side))throw Error('Invalid model picker');
  return `<div class="model-picker-field"><span class="picker-label">模型 ${side===0?'A':'B'}</span><details class="model-picker" data-model-picker="${side}" data-selected="${e(selected)}"><summary aria-label="选择模型${side===0?'A':'B'}，当前${e(model.name)}">${modelBadge(model.id)}<span class="picker-name">${e(model.name)}</span>${chevron}</summary><div class="model-options" role="group" aria-label="模型${side===0?'A':'B'}的可选型号">${models.map(m=>`<button type="button" data-pub-model-choice="${side}" data-model-id="${e(m.id)}" aria-pressed="${m.id===selected}">${modelBadge(m.id)}<span>${e(m.name)}</span><span class="picker-check" aria-hidden="true">${m.id===selected?'✓':''}</span></button>`).join('')}</div></details></div>`;
}
export function chooseComparison(models,current,side,id){
  if(![0,1].includes(side)||!models.some(m=>m.id===id)||models.length<2)throw Error('Invalid comparison choice');
  const next=[...current];next[side]=id;
  if(next[1-side]===id||!models.some(m=>m.id===next[1-side]))next[1-side]=models.find(m=>m.id!==id).id;
  return next;
}
export function bindModelPickers(main,{getModels,onPick}){
  const pickers=()=>[...main.querySelectorAll('[data-model-picker]')];
  const close=(except=null)=>pickers().forEach(p=>{if(p!==except)p.open=false;});
  const position=picker=>{
    const menu=picker.querySelector('.model-options'),summary=picker.querySelector('summary');
    if(!menu||!summary)return;
    const box=summary.getBoundingClientRect(),gap=8,edge=12;
    const below=innerHeight-box.bottom-gap-edge,above=box.top-gap-edge;
    const up=below<280&&above>below,space=up?above:below;
    const width=Math.min(box.width,innerWidth-edge*2);
    Object.assign(menu.style,{width:width+'px',left:Math.max(edge,Math.min(box.left,innerWidth-width-edge))+'px',maxHeight:Math.max(60,Math.min(320,space))+'px',top:up?'auto':box.bottom+gap+'px',bottom:up?innerHeight-box.top+gap+'px':'auto'});
  };
  main.addEventListener('toggle',ev=>{const p=ev.target;if(p.matches?.('[data-model-picker]')&&p.open){close(p);position(p);}},true);
  main.addEventListener('click',ev=>{
    const trigger=ev.target.closest('summary');
    if(trigger?.matches?.('[data-model-picker] > summary'))position(trigger.closest('[data-model-picker]'));
    const button=ev.target.closest('[data-pub-model-choice]');
    if(!button)return;
    const current=pickers().map(p=>p.dataset.selected),side=Number(button.dataset.pubModelChoice);
    const next=chooseComparison(getModels(),current,side,button.dataset.modelId);
    close();onPick(next,side);
  });
  main.addEventListener('keydown',ev=>{
    const picker=ev.target.closest('[data-model-picker]');if(!picker)return;
    const summary=picker.querySelector('summary');
    if(ev.key==='Escape'){ev.preventDefault();picker.open=false;summary.focus();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(ev.key))return;
    ev.preventDefault();picker.open=true;close(picker);position(picker);
    const buttons=[...picker.querySelectorAll('[data-pub-model-choice]')];
    if(!buttons.length)return;
    const current=buttons.indexOf(ev.target),selected=buttons.findIndex(b=>b.getAttribute('aria-pressed')==='true');
    const target=ev.key==='Home'?0:ev.key==='End'?buttons.length-1:current<0?Math.max(0,selected):(current+(ev.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    const button=buttons[target],menu=picker.querySelector('.model-options');
    button.focus({preventScroll:true});
    if(menu&&button.offsetTop<menu.scrollTop)menu.scrollTop=button.offsetTop;
    else if(menu&&button.offsetTop+button.offsetHeight>menu.scrollTop+menu.clientHeight)menu.scrollTop=button.offsetTop+button.offsetHeight-menu.clientHeight;
  });
  main.addEventListener('focusout',ev=>{const picker=ev.target.closest('[data-model-picker]');if(picker&&!picker.contains(ev.relatedTarget))picker.open=false;});
  main.ownerDocument?.addEventListener('click',ev=>{if(!ev.target.closest('[data-model-picker]'))close();});
  main.ownerDocument?.defaultView?.addEventListener('resize',()=>pickers().filter(p=>p.open).forEach(position));
  main.ownerDocument?.defaultView?.addEventListener('scroll',ev=>{if(!ev.target.closest?.('.model-options'))close();},true);
}
