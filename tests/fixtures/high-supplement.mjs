// Historical preflight fixture; unavailable candidates are not published.
import {projectHighSuite} from '../../dist/high-suite.js';
import {validateHighMeasurement} from '../../dist/high-measurement.js';
export const supplementalModels={
 'qwen38-max':{name:'Qwen 3.8 Max',apiModel:'Qwen/Qwen3.8-Max',family:'Qwen'},
 'claude-sonnet55':{name:'Claude Sonnet 5.5',apiModel:'claude-sonnet-5-5',family:'Claude'},
 'gpt61-sol':{name:'GPT-6.1 Sol',apiModel:'gpt-6.1-sol',family:'GPT'}
};
export const validateHighSupplement=(doc,book,bank)=>validateHighMeasurement(doc,book,bank,supplementalModels,'daily-high-supplement-v1');
export function mergeHighSupplement(base,doc,bank){
 validateHighSupplement(doc,base.book,bank);
 const source=base.book.highSource;
 const combined={...source,models:[...source.models,...doc.models],updatedAt:doc.updatedAt,totalRequests:source.totalRequests+doc.totalRequests,successfulRequests:source.successfulRequests+doc.successfulRequests};
 const seed={...base.data,models:[...base.data.models,...doc.models.map(m=>({id:m.modelId,name:m.name,apiModel:m.apiModel,provider:m.provider,family:supplementalModels[m.modelId].family,referenceModel:m.modelId!=='qwen38-max',pendingReason:m.eligibilityReason}))]};
 return projectHighSuite(combined,seed,base.book,bank);
}
