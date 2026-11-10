/* Shared card-back catalog: stable IDs for shop, wardrobe, rewards and save validation. */
(function(root){
'use strict';
const catalog=[
{id:'classic',name:'Классика',price:0,desc:'Бумажная гравюра звёздной астролябии'},
{id:'gold',name:'Золото',price:300,desc:'Литое золото и объёмное солнце'},
{id:'silver',name:'Серебро',price:300,desc:'Серебряная луна на тёмном металле'},
{id:'neon',name:'Неон',price:300,desc:'Светящийся портал в розовых и синих тонах'},
{id:'celestial',name:'Небесный',price:null,desc:'Акварельная туманность на бумаге',unlock:'Трофей «Коллекционер»'},
{id:'dawn',name:'Заря',price:null,desc:'Тёплый рассвет в стиле ретро',unlock:'Календарь · день 7'},
{id:'moss',name:'Мох',price:null,desc:'Резное дерево и лесной мох',unlock:'Календарь · день 14'},
{id:'abyss',name:'Бездна',price:null,desc:'Обсидиан со светящейся трещиной',unlock:'Календарь · день 28'},
{id:'moonlace',name:'Лунное кружево',price:180,desc:'Белое вязаное кружево на лаванде'},
{id:'roseglass',name:'Розовый кварц',price:null,desc:'Прозрачные грани розового кристалла',unlock:'Трофей «Первый урок»'},
{id:'ravenfeather',name:'Воронье перо',price:180,desc:'Контрастная гравюра чёрных перьев'},
{id:'dragonseal',name:'Печать дракона',price:340,desc:'Красный лак с рельефным драконом'},
{id:'moongarden',name:'Лунный сад',price:220,desc:'Многослойный сад из цветной бумаги'},
{id:'oracleheart',name:'Сердце Оракула',price:240,desc:'Бархатное сердце с ручной вышивкой'},
{id:'icecrown',name:'Ледяная корона',price:300,desc:'Морозное стекло и ледяные узоры'},
{id:'pumpkin',name:'Тыквенная ночь',price:220,desc:'Тыква и листья из полимерной глины'}
];
function image(id){return 'assets/backs/'+(catalog.some(d=>d.id===id)?id:'classic')+'.webp';}
function preview(id,cls='back-preview'){const d=catalog.find(d=>d.id===id)||catalog[0];return '<img class="back-image '+cls+'" src="'+image(d.id)+'" alt="'+d.name+'" width="240" height="360" loading="lazy" decoding="async">';}
const api={catalog,image,preview};root.CardBacks=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
