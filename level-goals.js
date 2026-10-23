/* Shared live forecast and final campaign star rules. No change to saved ratings. */
(function(root){
'use strict';
function rating(cfg,elapsed,misses,moves){
 if(cfg.match3)return moves>=Math.ceil(cfg.moves*.3)?3:moves>0?2:1;
 return elapsed<=cfg.par?(misses===0||elapsed<=cfg.par*.7?3:2):1;
}
function snapshot(game){
 const c=game.cfg,elapsed=Math.round(game.elapsed),moves=game.moves??c.moves,complete=game.cleared>=game.needed;
 const target=c.match3?(c.goal?.type==='seals'?'Снимите лунные печати':c.goal?.type==='collect'?'Соберите нужное светило':'Соберите символы'):c.oracle?'Найдите все отмеченные карты':'Найдите все группы карт';
 return {complete,forecast:rating(c,elapsed,game.misses,moves),current:Math.min(game.cleared,game.needed),total:game.needed,target,rows:c.match3?[
  {text:'Выполнить цель расклада',met:complete,detail:Math.min(game.cleared,game.needed)+' / '+game.needed},
  {text:'Победить с ходом в запасе',met:moves>0,detail:'Осталось ходов: '+moves},
  {text:'Сохранить минимум '+Math.ceil(c.moves*.3)+' ходов',met:moves>=Math.ceil(c.moves*.3),detail:'Осталось ходов: '+moves}
 ]:[
  {text:target,met:complete,detail:Math.min(game.cleared,game.needed)+' / '+game.needed},
  {text:'Уложиться в '+c.par+' с',met:elapsed<=c.par,detail:'Прошло: '+elapsed+' с'},
  {text:'Без ошибок за '+c.par+' с или за '+Math.floor(c.par*.7)+' с',met:elapsed<=c.par&&(game.misses===0||elapsed<=c.par*.7),detail:'Ошибок: '+game.misses+' · '+elapsed+' с'}
 ]};
}
const api={rating,snapshot};root.LevelGoals=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
