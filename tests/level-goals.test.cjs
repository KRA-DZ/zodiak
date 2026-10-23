const{test}=require('node:test'),assert=require('node:assert/strict'),Goals=require('../level-goals');
test('live conditions agree with final ratings at every time, error and move boundary',()=>{
 for(const cfg of [{par:150},{oracle:true,par:210},{match3:true,moves:26}])for(const elapsed of [0,104,105,106,147,148,150,151,210,211])for(const misses of [0,1,8])for(const moves of [0,1,7,8,26]){
  const snapshot=Goals.snapshot({cfg,elapsed,misses,moves,cleared:6,needed:6});
  const original=cfg.match3?(moves>=Math.ceil(cfg.moves*.3)?3:moves>0?2:1):elapsed<=cfg.par?(misses===0||elapsed<=cfg.par*.7?3:2):1;
  assert.equal(snapshot.forecast,original);assert.equal(snapshot.forecast,snapshot.rows[2].met?3:snapshot.rows[1].met?2:1);
 }
});
test('progress follows the mission and uncompleted victory stays unlit',()=>{
 const game={cfg:{match3:true,moves:26,goal:{type:'seals'}},elapsed:0,misses:0,moves:10,cleared:2,needed:6};
 const v=Goals.snapshot(game);assert.equal(v.complete,false);assert.equal(v.rows[0].met,false);assert.match(v.target,/печати/);assert.equal(v.current,2);assert.equal(v.forecast,3);
 game.moves=7;assert.equal(Goals.snapshot(game).forecast,2);game.moves=0;game.cleared=6;assert.equal(Goals.snapshot(game).forecast,1);
});
