import {validateHighMeasurement} from './high-measurement.js?v=20261031-player6';
import {projectHighSuite} from './high-suite.js?v=20261031-player6';
export const expandedModels={
 'claude-sonnet55':{name:'Claude Sonnet 5.5',apiModel:'claude-sonnet-5-5',family:'Claude'},
 'claude-haiku55':{name:'Claude Haiku 5.5',apiModel:'claude-haiku-5-5',family:'Claude'},
 'gpt6-luna':{name:'GPT-6 Luna',apiModel:'gpt-6-luna',family:'GPT'},
 'gemini38-flash':{name:'Gemini 3.8 Flash',apiModel:'google/gemini-3.8-flash',family:'Gemini'},
 'mistral-large4':{name:'Mistral Large 4',apiModel:'mistral/mistral-large-4',family:'Mistral'}
};
export function mergeHighExpanded(base,doc,bank){
 validateHighMeasurement(doc,base.book,bank,expandedModels,'daily-high-expanded-v1');
 if(doc.collectionAuthorization!=='user-approved-existing-credits-20261031')throw Error('新增批次缺少授权标记');
 const source=base.book.highSource,byId=new Map(source.models.map(m=>[m.modelId,m]));
 for(const m of doc.models)byId.set(m.modelId,m);
 const rows=[...byId.values()],oldModels=new Map(base.data.models.map(m=>[m.id,m]));
 const seed={...base.data,models:rows.map(m=>({...oldModels.get(m.modelId),id:m.modelId,name:m.name,apiModel:m.apiModel,provider:m.provider,family:expandedModels[m.modelId]?.family||oldModels.get(m.modelId)?.family,referenceModel:true,pendingReason:m.items.some(x=>x.score===null)?'八项已实测；'+m.items.filter(x=>x.score===null).map(x=>doc.tasks.find(t=>t.id===x.taskId).name).join('、')+'评分待定，暂不列入总分排名。':m.eligibilityReason||oldModels.get(m.modelId)?.pendingReason}))};
 return projectHighSuite({...source,models:rows,updatedAt:doc.updatedAt,totalRequests:rows.reduce((n,m)=>n+m.requests,0),successfulRequests:rows.reduce((n,m)=>n+m.successfulRequests,0)},seed,base.book,bank);
}
