/* One trail of 120 stars, three optional modes per star. Stable save IDs. */
(function(root){
'use strict';
const modes=['memory','oracle','alchemy'],names=['Память','Оракул','Алхимия'],colors=['#c4a2f3','#85dfd4','#f1a9c9'];
function id(sign,mode,step){return sign*30+mode*10+step;}
function completed(save,sign,mode){return save.lvStars.slice(id(sign,mode,0),id(sign,mode,0)+10).filter(n=>n>0).length;}
function visited(save,sign,step){return modes.some((_,m)=>save.lvStars[id(sign,m,step)]>0);}
function frontier(save){let chapter=0;while(chapter<11&&Array.from({length:10},(_,step)=>visited(save,chapter,step)).every(Boolean))chapter++;return chapter;}
function available(save,index){if(!Number.isInteger(index)||index<0||index>=360)return false;const sign=Math.floor(index/30),step=index%10;return save.lvStars[index]>0||(sign<=frontier(save)&&(step===0||visited(save,sign,step-1)||visited(save,sign,step)));}
function next(save,mode=0){const end=frontier(save);for(let sign=0;sign<=end;sign++)for(let step=0;step<10;step++)if(!visited(save,sign,step)&&available(save,id(sign,mode,step)))return id(sign,mode,step);for(let sign=0;sign<12;sign++)for(let step=0;step<10;step++)for(const m of [mode,...[0,1,2].filter(m=>m!==mode)]){const k=id(sign,m,step);if(!save.lvStars[k]&&available(save,k))return k;}return id(11,mode,9);}
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
function alchemyLayout(side,shape){
 const middle=(side-1)/2,voids=[];
 for(let r=0;r<side;r++)for(let c=0;c<side;c++){
  const corner=(r<2||r>=side-2)&&(c<2||c>=side-2);
  const absent=shape==='cross'?corner:shape==='diamond'?Math.abs(r-middle)+Math.abs(c-middle)>side*.68:shape==='hourglass'?Math.abs(r-middle)<1.5&&(c<2||c>=side-2):shape==='ring'?((r===Math.floor(middle)||r===Math.ceil(middle))&&(c===Math.floor(middle)||c===Math.ceil(middle))):shape==='stairs'?(r<2&&c>=side-2+r)||(r>=side-2&&c<r-(side-3)):shape==='wings'?(r<2||r>=side-2)&&(c===Math.floor(middle)||c===Math.ceil(middle)):shape==='corners'?(r===0||r===side-1)&&(c===0||c===side-1):false;
  if(absent)voids.push(r*side+c);
 }return voids;
}
function alchemyConfig(sign,step){
 const n=step+1,boss=n%5===0,rest=[1,6].includes(n),tier=Math.min(3,Math.floor(sign/3));
 const side=rest?6:sign===0?6:sign<4?(n>=7||sign>=2?7:6):sign<7?(boss||n>=7?8:7):8;
 const forms=['rectangle','corners','diamond','cross','hourglass','ring','stairs','wings'];
 const shape=rest||sign===0&&n<5?'rectangle':forms[(sign+step)%forms.length],voids=alchemyLayout(side,shape);
 const active=Array.from({length:side*side},(_,i)=>i).filter(i=>!voids.includes(i));
 const cfg={match3:true,rows:side,cols:side,shape,shapeLabel:{rectangle:'Открытое небо',corners:'Срезанные углы',diamond:'Кристальный ромб',cross:'Звёздный крест',hourglass:'Песочные часы',ring:'Лунное кольцо',stairs:'Небесные ступени',wings:'Крылья созвездия'}[shape],target:rest?42:Math.round(active.length*1.5)+tier*8+(boss?12:0),moves:rest?25:boss?32:26+Math.floor(sign/4),par:240};
 if(voids.length)cfg.voids=voids;
 if([3,7].includes(n)){cfg.goal={type:'collect',symbol:(sign+step)%6};cfg.target=14+tier*2+(side===8?3:0);}
 if([4,5,8,9,10].includes(n)){
  const candidates=active.filter(i=>Math.floor(i/side)>=Math.floor(side/2)&&i%side>0&&i%side<side-1),count=Math.min(candidates.length,2+tier+(boss?2:0));
  cfg.obstacles=Array.from({length:count},(_,k)=>[candidates[Math.floor((k+.5)*candidates.length/count)],(k+sign)%3===0?2:1]);
  const target=Math.min(9,6+Math.floor(sign/4)+(boss?1:0)),sealable=active.filter(i=>!cfg.obstacles.some(([j])=>j===i));
  cfg.goal={type:'seals',cells:Array.from({length:target},(_,k)=>sealable[Math.floor((k+.5)*sealable.length/target)])};cfg.target=target;
 }return cfg;
}
function generate(){const levels=[];for(let sign=0;sign<12;sign++)for(let mode=0;mode<3;mode++)for(let step=0;step<10;step++){
 const n=step+1,boss=n%5===0,rest=[1,6].includes(n),tier=Math.min(3,Math.floor(sign/4));
 let cfg={campaignSign:sign,campaignMode:mode,campaignStep:step,campaignBoss:boss,rest,par:180};
 if(mode===0){const large=n>=7&&!rest,rows=large?6:4,cols=large?6:4,cells=rows*cols;Object.assign(cfg,{rows,cols,pairs:cells/2,par:boss?240:150+tier*15});if([7,9].includes(n)){cfg.trios=1;cfg.decoys=1;cfg.pairs=(cells-4)/2;}if(n===8){cfg.darks=1;cfg.pairs--;}if(boss)cfg.boss=true;}
 if(mode===1)Object.assign(cfg,{oracle:true,par:210,stages:Array.from({length:boss?3:rest?1:2},(_,j)=>({rows:3,cols:4,targets:rest?1:2,swaps:Math.min(12,4+Math.floor(n/2)+tier+j),dur:Math.max(420,700-tier*35-n*12),dual:boss&&sign>=4}))});
 if(mode===2)Object.assign(cfg,alchemyConfig(sign,step));
 levels.push(cfg);
}return levels;}
const Campaign={nodesPerSign:10,visited,modes,names,colors,id,completed,frontier,available,next,upgrade,generate,collectCard,alchemyConfig,alchemyLayout};root.Campaign=Campaign;if(typeof module!=='undefined')module.exports=Campaign;
})(typeof window==='undefined'?globalThis:window);
