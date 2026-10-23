/* Earned, voluntary rewards. One chosen outfit, then disclosed random targets. */
(function(root){
'use strict';
const ids=['academycartographer','academyherbalist','academyrunes','academyorbits','starreader','merlin','vampirecountess','rosegentleman'];
const limits={hint:5,dust:3,outfit:3};
function hydrate(save,day){let a=save.adRewards;if(!a||typeof a!=='object'||Array.isArray(a))a={};if(!/^\d{4}-\d{2}-\d{2}$/.test(a.day||''))a.day=day;if(a.day<day){a.day=day;a.counts={};}a.counts=a.counts&&typeof a.counts==='object'&&!Array.isArray(a.counts)?a.counts:{};for(const k of Object.keys(limits))if(!Number.isSafeInteger(a.counts[k])||a.counts[k]<0)a.counts[k]=0;a.chosenUsed=!!a.chosenUsed;if(!ids.includes(a.target))a.target=null;if(!Number.isSafeInteger(a.progress)||a.progress<0)a.progress=0;save.adRewards=a;return a;}
function pool(catalog){return catalog.outfits.filter(d=>ids.includes(d.id)&&['rare','epic'].includes(d.rarity)&&d.case);}
function needed(d){return d.rarity==='epic'?5:3;}
function target(save,catalog,day,rng=Math.random){const a=hydrate(save,day);if(a.target)return catalog.outfits.find(d=>d.id===a.target);if(!a.chosenUsed)return null;const items=pool(catalog);const d=items[Math.min(items.length-1,Math.floor(rng()*items.length))];a.target=d.id;a.progress=0;return d;}
function choose(save,catalog,id,day){const a=hydrate(save,day);if(save.observatory.owned.outfits[id]||a.chosenUsed||a.progress>0||!pool(catalog).some(d=>d.id===id))return false;a.target=id;return true;}
function grant(save,catalog,kind,day){const a=hydrate(save,day);if(!Object.hasOwn(limits,kind)||a.counts[kind]>=limits[kind])return null;let d;if(kind==='outfit'){d=catalog.outfits.find(d=>d.id===a.target);if(!d||!ids.includes(d.id)||a.progress>=needed(d))return null;}a.counts[kind]++;
 if(kind==='hint'){save.inv.hint++;return{message:'+1 подсказка'};}
 if(kind==='dust'){save.dust+=25;return{message:'+25 ★ звёздной пыли'};}
 a.progress++;if(a.progress<needed(d))return{message:d.name+' · '+a.progress+' / '+needed(d)};
 const duplicate=!!save.observatory.owned.outfits[d.id],refund=duplicate?Math.floor((d.seasonal?220:180)*(d.rarity==='epic'?.4:.22)):0;
 save.observatory.owned.outfits[d.id]=true;save.dust+=refund;a.chosenUsed=true;a.target=null;a.progress=0;
 return{message:duplicate?'Повтор «'+d.name+'»: +'+refund+' ★':'Получен наряд «'+d.name+'»',id:d.id,duplicate,refund};
}
const api={ids,limits,hydrate,pool,needed,target,choose,grant};root.AdRewards=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
