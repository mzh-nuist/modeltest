const brands={
  deepseek:{family:'deepseek',icon:'deepseek'},
  kimi:{family:'kimi',icon:'kimi'},
  glm53:{family:'glm',icon:'zhipu'},
  minimax:{family:'minimax',icon:'minimax'},
  qwen38:{family:'qwen',icon:'qwen'},
  claude:{family:'claude',icon:'claude'},
  gpt61:{family:'openai',icon:'openai'},
  gpt6:{family:'openai',icon:'openai'},
  gemini38:{family:'gemini',icon:'gemini'},
  mistral:{family:'mistral',icon:'mistral'},
};
export function modelIdentity(id){
  const key=Object.keys(brands).find(k=>String(id).startsWith(k+'-'));
  return brands[key]||{family:'neutral',icon:null};
}
export function modelBadge(id){
  const {icon,family}=modelIdentity(id);
  return `<span class="model-badge brand-${family}" aria-hidden="true">${icon?`<img src="assets/brands/${icon}.svg?v=20261101-short1" width="24" height="24" alt="" decoding="async">`:'AI'}</span>`;
}
