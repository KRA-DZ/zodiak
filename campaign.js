/* Three independent paths, twelve shared zodiac chapters. No network state. */
(function(root){
'use strict';
const modes=['memory','oracle','alchemy'],names=['Память','Оракул','Алхимия'],colors=['#c4a2f3','#85dfd4','#f1a9c9'];
function id(sign,mode,step){return sign*30+mode*10+step;}
function completed(save,sign,mode){return save.lvStars.slice(id(sign,mode,0),id(sign,mode,0)+10).filter(n=>n>0).length;}
function frontier(save){let chapter=0;while(chapter<11&&modes.some((_,m)=>completed(save,chapter,m)===10))chapter++;return chapter;}
function available(save,index){if(!Number.isInteger(index)||index<0||index>=360)return false;const sign=Math.floor(index/30),mode=Math.floor(index%30/10),step=index%10;return sign<=frontier(save)&&(step===0||save.lvStars[index-1]>0||save.lvStars[index]>0);}
function next(save,mode=0){const end=frontier(save);for(let sign=0;sign<=end;sign++)for(let step=0;step<10;step++){const k=id(sign,mode,step);if(!save.lvStars[k]&&available(save,k))return k;}return id(end,mode,9);}
function upgrade(save){
 if(save.campaignVersion!==1||!Array.isArray(save.lvStars)||save.lvStars.length!==360){
  save.lvStars=new Array(360).fill(0);save.lvOpen=new Array(12).fill(1);save.journeyVersion=2;save.campaignVersion=1;save.campaignMode=0;save.campaignChapter=0;save.pathRewards={};
  for(const key of ['newbie','collector','first_book','perfect_book','speed','immortal'])if(save.ach)delete save.ach[key];
  if(save.stats){save.stats.fast=[];save.stats.lowMissRun=0;}
 }
 if(!Array.isArray(save.lvStars)||save.lvStars.length!==360)save.lvStars=new Array(360).fill(0);
 save.lvStars=save.lvStars.map(n=>Number.isInteger(n)?Math.max(0,Math.min(3,n)):0);
 save.lvOpen=Array.from({length:12},(_,s)=>Math.max(1,...Array.from({length:30},(_,l)=>save.lvStars[s*30+l]?Math.min(30,l+2):1)));
 if(!Array.isArray(save.albumSeen))save.albumSeen=[];
 save.albumSeen=[...new Set(save.albumSeen.filter(n=>Number.isInteger(n)&&n>=0&&n<12))];
 if(!save.pathRewards||typeof save.pathRewards!=='object')save.pathRewards={};
 if(!Number.isInteger(save.campaignMode)||save.campaignMode<0||save.campaignMode>2)save.campaignMode=0;
 if(!Number.isInteger(save.campaignChapter)||save.campaignChapter<0||save.campaignChapter>11)save.campaignChapter=0;
 return save;
}
function collectCard(save,sign){
 if(!Number.isInteger(sign)||sign<0||sign>11||!save.lvStars.slice(sign*30,sign*30+30).every(n=>n>0))return false;
 if(!Array.isArray(save.albumSeen))save.albumSeen=[];
 if(save.albumSeen.includes(sign))return false;
 save.albumSeen.push(sign);return true;
}
function generate(){const levels=[];for(let sign=0;sign<12;sign++)for(let mode=0;mode<3;mode++)for(let step=0;step<10;step++){
 const n=step+1,boss=n%5===0,rest=[1,6].includes(n),tier=Math.min(3,Math.floor(sign/4));
 let cfg={campaignSign:sign,campaignMode:mode,campaignStep:step,campaignBoss:boss,rest,par:180};
 if(mode===0){const large=n>=7&&!rest,rows=large?6:4,cols=large?6:4,cells=rows*cols;Object.assign(cfg,{rows,cols,pairs:cells/2,par:boss?240:150+tier*15});if([7,9].includes(n)){cfg.trios=1;cfg.decoys=1;cfg.pairs=(cells-4)/2;}if(n===8){cfg.darks=1;cfg.pairs--;}if(boss)cfg.boss=true;}
 if(mode===1)Object.assign(cfg,{oracle:true,par:210,stages:Array.from({length:boss?3:rest?1:2},(_,j)=>({rows:3,cols:4,targets:rest?1:2,swaps:Math.min(12,4+Math.floor(n/2)+tier+j),dur:Math.max(420,700-tier*35-n*12),dual:boss&&sign>=4}))});
 if(mode===2){Object.assign(cfg,{match3:true,rows:6,cols:6,target:rest?42:60+tier*6+(boss?12:0),moves:rest?25:boss?27:24,par:240});
  if([3,7].includes(n)){cfg.goal={type:'collect',symbol:(sign+step)%6};cfg.target=rest?10:14+tier;}
  if([4,5,8,9,10].includes(n)){const cells=[7,10,14,21,25,28];cfg.goal={type:'seals',cells};cfg.target=6;const count=rest?0:Math.min(6,2+tier+(boss?1:0));cfg.obstacles=[8,9,26,27,13,22].slice(0,count).map((i,k)=>[i,k%2?2:1]);}
  if(sign>=2&&[5,9,10].includes(n))cfg.voids=sign%2?[15,20]:[13,22];
 }
 levels.push(cfg);
}return levels;}
const Campaign={modes,names,colors,id,completed,frontier,available,next,upgrade,generate,collectCard};root.Campaign=Campaign;if(typeof module!=='undefined')module.exports=Campaign;
})(typeof window==='undefined'?globalThis:window);
