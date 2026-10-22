/* Extra costumes only: existing artwork and inventory IDs remain unchanged. */
(function(root){
'use strict';
const rows=[
 ['greyapprentice','Серая ученица','female','common','classic-simple-0',0,'Простая серая мантия, верёвочный пояс и деревянная палочка'],
 ['noviceastronomer','Начинающий звездочёт','male','common','classic-simple-0',1,'Серый плащ, скромный колпак и маленькая подзорная труба'],
 ['villagewitch','Деревенская ведьмочка','female','common','classic-simple-0',2,'Коричневое платье, простая шляпа и верная метла'],
 ['villagewizard','Деревенский колдун','male','common','classic-simple-0',3,'Неприметный камзол и первая книга заклинаний'],
 ['youngalchemist','Юная зельеварка','female','common','classic-simple-1',0,'Синий фартук и колба первого зелья'],
 ['libraryscribe','Библиотечный писарь','male','common','classic-simple-1',1,'Простая синяя мантия, перо и книга'],
 ['villagehealer','Сельская целительница','female','common','classic-simple-1',2,'Оливковая накидка и пучок лечебных трав'],
 ['candlekeeper','Хранитель фонаря','male','common','classic-simple-1',3,'Скромный зелёный плащ и тёплый свет фонаря'],
 ['academycartographer','Картограф академии','male','rare','classic-academy',0,'Бронзовые очки, небесный компас и журнал путешествий'],
 ['academyherbalist','Травник академии','male','rare','classic-academy',1,'Медные волосы, оливковый камзол и солнечное зелье'],
 ['academyrunes','Хранительница рун','female','rare','classic-academy',2,'Косы, бирюзовая мантия и светящаяся книга рун'],
 ['academyorbits','Чтица орбит','female','rare','classic-academy',3,'Светлые волосы, аметистовый плащ и небесный глобус'],
 ['starreader','Чтица созвездий','female','epic','classic-masters',0,'Звёздная вышивка и серебряная астролябия'],
 ['merlin','Мерлин','male','epic','classic-masters',1,'Белая борода, синий колпак и хрустальный посох'],
 ['constellationqueen','Владычица созвездий','female','legendary','classic-masters',2,'Золотая корона и небесная мантия живых звёзд'],
 ['phoenixmaster','Мастер феникса','male','legendary','classic-masters',3,'Богатый алый наряд, золотые перья и солнечный посох'],
 ['pumpkinapprentice','Тыквенная ученица','female','common','season-halloween-simple',0,'Хеллоуин · простое оранжевое платье и тыквенный колпак'],
 ['friendlyghost','Дружелюбное привидение','male','common','season-halloween-simple',1,'Хеллоуин · белый костюм с узнаваемыми чёрными глазами'],
 ['clownwitch','Ведьмочка-клоун','female','common','season-halloween-simple',2,'Хеллоуин · белый грим, красный нос и лоскутный костюм'],
 ['scarecrow','Колдун-пугало','male','common','season-halloween-simple',3,'Хеллоуин · заплатки, солома и простая шляпа'],
 ['winterstudent','Зимняя ученица','female','common','season-winter-love-simple',0,'Новый год · красный свитер, варежки и маленький подарок'],
 ['snowmanwizard','Волшебник-снеговик','male','common','season-winter-love-simple',1,'Новый год · белый костюм, чёрный цилиндр и нос-морковка'],
 ['valentinestudent','Ученица Валентина','female','common','season-winter-love-simple',2,'День влюблённых · розовый кардиган и палочка-сердечко'],
 ['cupidstudent','Ученик Купидона','male','common','season-winter-love-simple',3,'День влюблённых · маленькие крылья и игрушечный лук'],
 ['vampirecountess','Графиня полуночи','female','rare','season-rare',0,'Хеллоуин · алый плащ и чёрное платье с высоким воротником'],
 ['pumpkinprince','Тыквенный принц','male','rare','season-rare',1,'Хеллоуин · тыквенная голова и нарядный чёрно-оранжевый костюм'],
 ['winterfairy','Зимняя фея','female','rare','season-rare',2,'Новый год · голубое платье, крылышки и снежная диадема'],
 ['rosegentleman','Кавалер роз','male','rare','season-rare',3,'День влюблённых · бордовый камзол и букет красных роз'],
 ['snowqueen','Снежная королева','female','epic','season-grand',0,'Новый год · ледяная корона и бело-голубой парадный наряд'],
 ['santa','Санта-волшебник','male','epic','season-grand',1,'Новый год · красная шуба, белая борода и мешок подарков'],
 ['queenofhearts','Королева сердец','female','legendary','season-grand',2,'День влюблённых · золотая корона и роскошное алое платье'],
 ['midnightlord','Владыка ночи','male','legendary','season-grand',3,'Хеллоуин · тёмная корона, лиловый плащ и крылья летучей мыши']
];
const outfits=rows.map(([id,name,hero,rarity,sheet,cell,desc])=>({id,name,hero,rarity,image:'assets/'+sheet+'.webp',cell,columns:2,rows:2,desc,price:null,case:true,seasonal:sheet.startsWith('season-')}));
const artwork={"assets/classic-simple-0.webp":{"width":1254,"height":1254,"cuts":[631,631]},"assets/classic-simple-1.webp":{"width":1254,"height":1254,"cuts":[627,627]},"assets/classic-academy.webp":{"width":1254,"height":1254,"cuts":[627,627]},"assets/classic-masters.webp":{"width":1254,"height":1254,"cuts":[626,627]},"assets/season-halloween-simple.webp":{"width":1254,"height":1254,"cuts":[626,626]},"assets/season-winter-love-simple.webp":{"width":1254,"height":1254,"cuts":[634,634]},"assets/season-rare.webp":{"width":1254,"height":1254,"cuts":[627,627]},"assets/season-grand.webp":{"width":1254,"height":1254,"cuts":[625,625]}};
const content={outfits,artwork};root.WardrobeContent=content;if(typeof module!=='undefined')module.exports=content;
})(typeof window==='undefined'?globalThis:window);
