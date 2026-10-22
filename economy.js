/* Economy v2: earned currency only, disclosed odds, atomic cosmetic drops. */
(function(root){
'use strict';
const VERSION=2;
const rarities={
 common:{name:'Обычный',color:'#b7bac5',chance:70,refund:.12},
 rare:{name:'Редкий',color:'#79b5ff',chance:23,refund:.22},
 epic:{name:'Эпический',color:'#c891ff',chance:6,refund:.4},
 legendary:{name:'Легендарный',color:'#f2cb70',chance:1,refund:.65},
 unique:{name:'Уникальный',color:'#f3a7ca',chance:0,refund:0}
};
const cases={outfits:{name:'Ларец облачений',price:180},pets:{name:'Колыбель спутников',price:140}};
const artwork={
  "assets/costumes-0.webp": {
    "width": 1261,
    "height": 1247,
    "cuts": [
      622,
      613
    ]
  },
  "assets/costumes-1.webp": {
    "width": 1262,
    "height": 1246,
    "cuts": [
      641,
      643
    ]
  },
  "assets/costumes-2.webp": {
    "width": 1268,
    "height": 1241,
    "cuts": [
      620,
      620
    ]
  },
  "assets/costumes-3.webp": {
    "width": 1268,
    "height": 1241,
    "cuts": [
      591,
      591
    ]
  },
  "assets/familiars-0.webp": {
    "width": 1536,
    "height": 1024,
    "cuts": [
      512,
      512,
      512
    ]
  },
  "assets/familiars-1.webp": {
    "width": 1536,
    "height": 1024,
    "cuts": [
      512,
      513,
      513
    ]
  }
};
const additions={outfits:[
 ['blackwitch','Ночная ведьмочка','female','common',0,0,'Чёрный бархат, остроконечная шляпа и метла'],
 ['fairystudent','Фея первого цветка','female','common',0,1,'Мятное платье, крылышки и цветочная палочка'],
 ['herbalist','Хранительница трав','female','common',0,2,'Тёплая накидка и флакон лесного зелья'],
 ['snowwitch','Снежная ученица','female','common',0,3,'Лавандовый плащ и снежный жезл'],
 ['warlock','Сумеречный колдун','male','common',1,0,'Угольный камзол, шляпа и книга заклинаний'],
 ['ambermage','Янтарный маг','male','common',1,1,'Медовая мантия и янтарный посох'],
 ['traveler','Лесной странник','male','common',1,2,'Походная накидка и резной деревянный посох'],
 ['icewizard','Ученик льда','male','common',1,3,'Голубой капюшон и посох снежинок'],
 ['rosefairy','Фея розового сада','female','rare',2,0,'Розовые крылья, цветочный венец и волшебная роза'],
 ['lunarwitch','Ведьма лунной ночи','female','rare',2,1,'Широкая шляпа и серебряный полумесяц'],
 ['runemage','Чародей рун','male','rare',2,2,'Бордовая мантия и книга сияющих рун'],
 ['stormwizard','Повелитель гроз','male','rare',2,3,'Бирюзовая мантия и посох молний'],
 ['aurorafairy','Фея северного сияния','female','epic',3,0,'Кристальные крылья и переливы полярного неба'],
 ['voidmage','Маг межзвездной тишины','male','epic',3,1,'Обсидиановый посох и кольца далёких галактик'],
 ['sunempress','Солнечная императрица','female','legendary',3,2,'Золотой венец, лучистый плащ и солнечный скипетр'],
 ['archmage','Небесный архимаг','male','legendary',3,3,'Золотая корона и мантия живых созвездий']
].map(([id,name,hero,rarity,sheet,cell,desc])=>({id,name,hero,rarity,image:'assets/costumes-'+sheet+'.webp?v=figures-8',cell,columns:2,rows:2,desc,price:null,case:true})),pets:[
 ['snowcat','Котёнок Облачко','common',0,0,'Белый пушистый хранитель'],['tawnyowl','Совёнок Дрёма','common',0,1,'Любитель тихих вечерних сказок'],
 ['bunny','Кролик Корица','common',0,2,'Мягкие ушки и голубой шарфик'],['fox','Лисёнок Листик','common',0,3,'Хитрый лесной спутник'],
 ['hedgehog','Ёжик Шалфей','common',0,4,'Маленький колючий волшебник'],['puppy','Щенок Искорка','common',0,5,'Тёплый комочек радости'],
 ['moonfox','Лиса Лунница','rare',1,0,'Серебряный мех и знак Луны'],['raven','Ворон Чар','rare',1,1,'Пернатый знаток заклинаний'],
 ['unicorn','Единорожка Роза','rare',1,2,'Розовые крылышки и маленькое чудо'],['stardeer','Оленёнок Небула','epic',1,3,'Созвездия на шёрстке и хрустальные рожки'],
 ['crystaldragon','Дракончик Аквамарин','epic',1,4,'Бирюзовые чешуйки и кристальные крылья'],['phoenix','Феникс Злато','legendary',1,5,'Солнечная корона и золотые перья']
].map(([id,name,rarity,sheet,cell,desc])=>({id,name,rarity,image:'assets/familiars-'+sheet+'.webp?v=figures-8',cell,columns:3,rows:2,desc,price:null,case:true}))};
const achievementRewards={newbie:8,master:30,collector:180,speed:15,immortal:20,tutorial:3,first_book:60,dresser:5,new_sky:5,familiar:5,endless10:25,endless25:45,endless50:90,cascade3:8,cascade5:20,alchemy10:20,oracle10:20,memory25:30,archive12:25,four_topics:10,seven_visits:20,perfect_book:100};
function upgrade(save,defaults){if(save.economyVersion===VERSION)return false;for(const key of Object.keys(save))delete save[key];Object.assign(save,JSON.parse(JSON.stringify(defaults)),{economyVersion:VERSION});return true;}
function counters(o){o.cases=o.cases&&typeof o.cases==='object'?o.cases:{};for(const kind of Object.keys(cases)){const previous=o.cases[kind]||{};o.cases[kind]={};for(const k of ['opens','rare','epic','legend'])o.cases[kind][k]=Number.isSafeInteger(previous[k])&&previous[k]>=0?previous[k]:0;}return o.cases;}
function pool(catalog,kind,hero){return (catalog[kind]||[]).filter(d=>d.case&&(!d.hero||d.hero===hero));}
function random(){if(root.crypto?.getRandomValues){const n=new Uint32Array(1);root.crypto.getRandomValues(n);return n[0]/4294967296;}return Math.random();}
function open(save,catalog,kind,hero,rng=random){
 const box=cases[kind],o=save.observatory;
 if(!box||!o||!['female','male'].includes(hero)||save.dust<box.price)return null;
 const items=pool(catalog,kind,hero);if(!items.length)return null;
 const c=counters(o)[kind],order=['common','rare','epic','legendary'];
 let tier=0,roll=rng()*100;for(let i=0;i<4;i++){roll-=rarities[order[i]].chance;if(roll<0){tier=i;break;}}
 if(c.legend>=59)tier=3;else if(c.epic>=19)tier=Math.max(tier,2);else if(c.rare>=7)tier=Math.max(tier,1);
 const eligible=items.filter(d=>d.rarity===order[tier]);if(!eligible.length)return null;
 const item=eligible[Math.min(eligible.length-1,Math.floor(rng()*eligible.length))],duplicate=!!o.owned[kind][item.id],refund=duplicate?Math.floor(box.price*rarities[item.rarity].refund):0;
 save.dust-=box.price;save.dust+=refund;o.owned[kind][item.id]=true;
 c.opens++;c.rare=tier>=1?0:c.rare+1;c.epic=tier>=2?0:c.epic+1;c.legend=tier>=3?0:c.legend+1;
 o.stats.wardrobeBuys++;return {kind,id:item.id,rarity:item.rarity,duplicate,refund,price:box.price};
}
const Economy={artwork,VERSION,rarities,cases,additions,achievementRewards,upgrade,counters,pool,open};root.Economy=Economy;if(typeof module!=='undefined')module.exports=Economy;
})(typeof window==='undefined'?globalThis:window);
