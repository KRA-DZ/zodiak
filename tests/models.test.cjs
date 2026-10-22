const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match3.js');
const J = require('../journey.js');

test('match3 generation has no initial matches and always has a legal move', () => {
    for (let i = 0; i < 200; i++) {
        const b = M.newBoard();
        assert.equal(b.length, 36);
        assert.deepEqual(M.matches(b), []);
        assert.ok(M.findMove(b));
        assert.ok(b.every(v => Number.isInteger(v) && v >= 0 && v < 6));
    }
    const fallback = M.newBoard(() => 0);
    assert.deepEqual(M.matches(fallback), []);
    assert.ok(M.findMove(fallback));
});

test('match3 does not wrap rows and matches both directions', () => {
    assert.equal(M.adjacent(5, 6), false);
    assert.equal(M.adjacent(4, 5), true);
    assert.equal(M.adjacent(2, 8), true);
    assert.equal(M.adjacent(-1, 0), false);
    const b = Array.from({length:36}, (_,i) => (Math.floor(i/6) + i%6)%6);
    b[0] = b[1] = b[2] = 5;
    b[8] = b[14] = 5;
    b[20] = 4;
    assert.deepEqual(new Set(M.matches(b)), new Set([0,1,2,8,14]));
});

test('collapse preserves the order of survivors and refills every hole', () => {
    const b = Array.from({length:36}, (_,i) => i);
    const next = M.collapse(b, [0,12,24], () => .5);
    assert.deepEqual([0,6,12,18,24,30].map(i => next[i]), [3,3,3,6,18,30]);
    assert.equal(next[1], b[1]);
});

test('the authorized new campaign reset is idempotent and keeps cosmetics and predictions',()=>{
 const save={lvStars:new Array(108).fill(3),lvOpen:new Array(12).fill(9),stats:{fast:[1]},skins:{classic:true},dust:120,journal:[],ach:{collector:true}};
 J.upgrade(save);assert.equal(save.lvStars.length,360);assert.ok(save.lvStars.every(n=>n===0));assert.equal(save.dust,120);assert.equal(save.skins.classic,true);
 const same=JSON.stringify(save);J.upgrade(save);assert.equal(JSON.stringify(save),same);
});
test('360 campaign configs are bounded, with two guardians and recovery levels per chapter',()=>{
 const levels=J.extendLevels([]);assert.equal(levels.length,360);
 for(let s=0;s<12;s++)for(let m=0;m<3;m++){
  const path=levels.slice(s*30+m*10,s*30+m*10+10);assert.equal(path.length,10);assert.deepEqual(path.filter(c=>c.campaignBoss).map(c=>c.campaignStep),[4,9]);assert.ok(path[0].rest&&path[5].rest);
  for(const c of path){if(c.oracle)assert.ok(c.stages.every(st=>st.targets<=2&&st.swaps<=12&&st.dur>=420));if(c.match3){assert.ok(c.obstacles?.length<=6||!c.obstacles);assert.ok(c.moves>=24);assert.ok((c.goal?.cells||[]).every(i=>!c.voids?.includes(i)));}else if(!c.oracle)assert.equal(c.rows*c.cols,c.pairs*2+(c.trios||0)*3+(c.darks||0)*2+(c.decoys||0));}
 }
 for(let n=1;n<=120;n++){const c=J.endlessConfig(n);assert.ok(c.par>0);}
});

const Saves = require('../save-files.js');
const packet = () => ({format:'zodiac-memory',version:1,save:{
    sign:0,dust:120,inv:{hint:2,freeze:1,map:0},
    lvStars:new Array(108).fill(0),lvOpen:new Array(12).fill(1),
    journeyVersion:1,skins:{classic:true},skin:'classic',
    stats:{fast:[],matchesTotal:1},calTaken:[1],calLast:'2026-10-22',
    journal:[{day:'2026-10-22',sign:0,cat:'love',text:'Звёзды оставляют место для встречи.'}]
}});

test('fall plan maps each surviving tile to its original location without duplicates',()=>{
    const board=Array.from({length:36},(_,i)=>i);
    const p=M.collapsePlan(board,[0,12,24],()=>.5);
    assert.deepEqual([0,6,12,18,24,30].map(i=>p.origins[i]),[null,null,null,6,18,30]);
    const origins=p.origins.filter(i=>i!=null);
    assert.equal(new Set(origins).size,33);
    origins.forEach(i=>assert.ok(![0,12,24].includes(i)));
    p.origins.forEach((from,i)=>{if(from!=null)assert.equal(p.board[i],board[from]);});
});

test('collection only counts the chosen symbol and lunar seals are removed once',()=>{
    const board=[1,1,1,2,2,2], found=[0,1,2,3,4,5], seals=new Set([1,3,7]);
    assert.equal(M.missionProgress({type:'collect',symbol:1},board,found,seals),3);
    assert.equal(M.missionProgress({type:'seals'},board,found,seals),2);
    assert.equal(M.missionProgress({type:'seals'},board,found,seals),0);
    assert.deepEqual([...seals],[7]);
});

test('campaign and endless include three supported mission types with valid seal locations',()=>{
    const types=new Set();
    for(let s=0;s<12;s++)for(let v=0;v<2;v++){
        const cfg=J.alchemyConfig(s,v);types.add(cfg.goal?.type||'score');
        if(cfg.goal?.cells){
            assert.equal(new Set(cfg.goal.cells).size,cfg.target);
            assert.ok(cfg.goal.cells.every(n=>n>=0&&n<36));
        }
    }
    assert.deepEqual([...types].sort(),['collect','score','seals']);
    assert.deepEqual([3,6,9].map(n=>J.endlessConfig(n).goal?.type||'score'),['score','collect','seals']);
});

test('save parser round-trips valid progress and retains archived messages',()=>{
    const p=packet(),s=Saves.parse(JSON.stringify(p));
    assert.deepEqual(s,p.save);
    const legacy=packet();delete legacy.save.journeyVersion;legacy.save.lvStars=new Array(84).fill(1);
    assert.equal(Saves.parse(JSON.stringify(legacy)).lvStars.length,84);
});

test('save parser rejects malformed, oversized, future-version and dangerous files',()=>{
    assert.throws(()=>Saves.parse('not-json'));
    assert.throws(()=>Saves.parse(' '.repeat(1024*1024+1)));
    const mutations=[
        p=>p.version=42,
        p=>p.save.dust=-1,
        p=>p.save.lvStars.pop(),
        p=>p.save.lvOpen[0]=100,
        p=>p.save.journal[0].cat='unknown',
        p=>p.save.calLast='2026-02-31',
        p=>p.save.inv.hint='5',
        p=>p.save.skins.classic='yes',
        p=>p.save.stats.fast=[999],
        p=>p.save.traits=['bad'],
        p=>p.save.calTaken=[1,1],
        p=>p.save.horoUsed={bad:'not-an-array'}
    ];
    for(const mutate of mutations){const p=packet();mutate(p);assert.throws(()=>Saves.parse(JSON.stringify(p)));}
    assert.throws(()=>Saves.parse(JSON.stringify(packet()).replace('"dust":120','"__proto__":{"polluted":true},"dust":120')));
    assert.equal({}.polluted,undefined);
});

test('mission hints choose the strongest immediate contribution to the objective',()=>{
    for(let n=0;n<40;n++){
        const board=M.newBoard(),goal={type:'collect',symbol:n%6};
        const pair=M.findMove(board,goal),copy=board.slice();[copy[pair[0]],copy[pair[1]]]=[copy[pair[1]],copy[pair[0]]];
        const score=b=>{const found=M.matches(b);return found.filter(i=>b[i]===goal.symbol).length*100+found.length;};
        const chosen=score(copy);
        for(let i=0;i<36;i++)for(const j of[i+1,i+6]){
            if(!M.adjacent(i,j))continue;
            const candidate=board.slice();[candidate[i],candidate[j]]=[candidate[j],candidate[i]];
            if(M.matches(candidate).length)assert.ok(chosen>=score(candidate));
        }
    }
});

const Observatory=require('../observatory.js');
test('older saves gain a free hero wardrobe without changing existing progress',()=>{
    const save=packet().save,stars=save.lvStars.slice(),dust=save.dust;
    Observatory.hydrate(save);
    assert.equal(save.dust,dust);assert.deepEqual(save.lvStars,stars);
    assert.equal(save.observatory.outfit,'apprentice');assert.equal(save.observatory.hero,null);
    assert.equal(save.observatory.owned.outfits.apprentice,true);
    const once=JSON.stringify(save);Observatory.hydrate(save);assert.equal(JSON.stringify(save),once);
    assert.deepEqual(Saves.parse(JSON.stringify({format:'zodiac-memory',version:1,save})).observatory,save.observatory);
});

test('import accepts owned cosmetics and rejects unowned equipment or unknown items',()=>{
    const base=packet();Observatory.hydrate(base.save);
    base.save.observatory.owned.outfits.astral=true;base.save.observatory.outfit='astral';
    base.save.skins.moonlace=true;base.save.skin='moonlace';
    assert.equal(Saves.parse(JSON.stringify(base)).observatory.outfit,'astral');
    for(const mutate of[
        s=>s.observatory.outfit='moon',s=>s.observatory.pet='dragon',
        s=>s.observatory.motion='evil',s=>s.observatory.owned.unknown={},s=>s.observatory.owned.backgrounds.unknown=true,
        s=>s.observatory.stats.gems=-1,s=>s.observatory.hero='unknown'
    ]){const p=JSON.parse(JSON.stringify(base));mutate(p.save);assert.throws(()=>Saves.parse(JSON.stringify(p)));}
});

test('four-lines create oriented rays, five creates a prism and intersections create bombs',()=>{
    const base=()=>Array.from({length:36},(_,i)=>(Math.floor(i/6)+i%6)%6);
    let b=base();[6,7,8,9].forEach(i=>b[i]=5);b[10]=2;
    assert.equal(M.combinationPlan(b,new Set(),[9]).spawns.get(9),'row');
    b=base();[2,8,14,20].forEach(i=>b[i]=5);
    assert.equal(M.combinationPlan(b,new Set(),[20]).spawns.get(20),'column');
    b=base();[6,7,8,9,10].forEach(i=>b[i]=5);
    assert.equal(M.combinationPlan(b,new Set(),[9]).spawns.get(9),'color');
    b=base();[6,7,8,13,19].forEach(i=>b[i]=5);
    assert.equal(M.combinationPlan(b).spawns.get(7),'bomb');
    b=base();[0,1,2,24,25,26].forEach(i=>b[i]=4);
    assert.equal(M.combinationPlan(b).spawns.size,0,'separate triples must not create a prism');
});

test('special effects chain without wrapping, choose a color and respect locked cells',()=>{
    const b=Array.from({length:36},(_,i)=>i%6);
    const rays=M.blast(b,[7],new Map([[7,'row'],[10,'column'],[22,'bomb']]));
    for(const i of[6,7,8,9,10,11,4,16,22,28,34,21,23,27,29])assert.ok(rays.includes(i),'missing '+i);
    assert.equal(new Set(rays).size,rays.length);
    assert.deepEqual(M.blast(b,[0],new Map([[0,'bomb']])).sort((a,b)=>a-b),[0,1,6,7]);
    const colors=M.blast(b,[7],new Map([[7,'color']]),new Set([10]),4);
    for(const i of[4,16,22,28,34])assert.ok(colors.includes(i));assert.ok(!colors.includes(10));
    assert.equal(M.blast(b,[7],new Map([[7,'color']]),new Set(),'all').length,36);
});

test('locks take one adjacent hit per cascade, ice takes two and gravity stays in segments',()=>{
    const locks=new Map([[7,1],[10,2]]);
    M.unlockAdjacent(locks,[6,8,9,11]);assert.equal(locks.has(7),false);assert.equal(locks.get(10),1);
    M.unlockAdjacent(locks,[9]);assert.equal(locks.has(10),false);
    const board=Array.from({length:36},(_,i)=>i%6);
    const drop=M.collapsePlan(board,[0,18],()=>.5,new Set([12]));
    assert.equal(drop.origins[12],12);assert.equal(drop.origins[6],6);assert.equal(drop.origins[0],null);
    assert.equal(drop.origins[30],30);assert.equal(drop.origins[24],24);assert.equal(drop.origins[18],null);
    const b=Array.from({length:36},(_,i)=>(Math.floor(i/6)+i%6)%6);[0,1,2].forEach(i=>b[i]=5);
    assert.equal(M.combinationPlan(b,new Set([1])).found.length,0);
    const move=M.findMove(b,null,null,new Set([0]),new Map([[0,'row'],[7,'bomb']]));
    assert.ok(move&&!move.includes(0));
});

test('portable saves retain only valid visual-guide completion flags',()=>{
    const save=packet();save.save.levelGuides={memory:true,oracle:false,alchemy:true};
    assert.deepEqual(Saves.parse(JSON.stringify(save)).levelGuides,save.save.levelGuides);
    save.save.levelGuides.unknown=true;assert.throws(()=>Saves.parse(JSON.stringify(save)));
    delete save.save.levelGuides.unknown;save.save.levelGuides.memory='true';assert.throws(()=>Saves.parse(JSON.stringify(save)));
});

const C=require('../campaign.js');
test('paths unlock independently and a completed path unlocks a shared next zodiac chapter',()=>{
 const save={stats:{},ach:{}};C.upgrade(save);
 assert.ok(C.available(save,0)&&C.available(save,10)&&C.available(save,20));assert.equal(C.available(save,1),false);assert.equal(C.available(save,30),false);
 save.lvStars[0]=1;assert.ok(C.available(save,1));assert.equal(C.available(save,11),false);
 for(let i=20;i<30;i++)save.lvStars[i]=1;
 assert.equal(C.frontier(save),1);assert.ok(C.available(save,30)&&C.available(save,40)&&C.available(save,50));assert.equal(C.available(save,60),false);
 assert.equal(C.next(save,2),50);assert.equal(C.completed(save,0,2),10);assert.equal(C.completed(save,0,0),1);
});
test('new campaign saves round-trip all 360 stars, chapter selection and claimed seal gifts',()=>{
 const p=packet();C.upgrade(p.save);p.save.lvStars[359]=3;p.save.pathRewards['11:2']=true;
 assert.deepEqual(Saves.parse(JSON.stringify(p)).lvStars,p.save.lvStars);
 p.save.pathRewards['12:3']=true;assert.throws(()=>Saves.parse(JSON.stringify(p)));
});
test('voids remain empty barriers to matching and split gravity into separate segments',()=>{
 const b=Array.from({length:36},(_,i)=>i%6);b[12]=null;
 const plan=M.collapsePlan(b,[0,18],()=>.5,new Set([12]));assert.equal(plan.board[12],null);assert.equal(plan.origins[12],12);assert.equal(plan.origins[18],null);assert.equal(plan.origins[0],null);
 assert.ok(!M.combinationPlan(b,new Set([12])).found.includes(12));
});
