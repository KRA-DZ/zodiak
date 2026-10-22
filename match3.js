/* «Алхимия звёзд»: чистая модель поля и браузерный контроллер. */
(function(root) {
    'use strict';
    const sideOf=board=>Math.sqrt(board.length);
    function adjacent(a,b,side=6){return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<side*side&&b<side*side&&Math.abs(Math.floor(a/side)-Math.floor(b/side))+Math.abs(a%side-b%side)===1;}
    function matches(board){return combinationPlan(board).found;}
    function findMove(board,goal,remaining,blocked=new Set(),specials=new Map()){
        const side=sideOf(board),cells=remaining||new Set(goal?.cells||[]);let best=null,priority=-1;
        for(let i=0;i<board.length;i++)for(const j of [i+1,i+side]){
            if(!adjacent(i,j,side)||blocked.has(i)||blocked.has(j)||board[i]==null||board[j]==null)continue;
            if(specials.has(i)||specials.has(j))return [i,j];
            const copy=board.slice();[copy[i],copy[j]]=[copy[j],copy[i]];
            const found=combinationPlan(copy,blocked).found;if(!found.length)continue;if(!goal)return [i,j];
            // Marked tiles travel with the swap before a candidate move is scored.
            const moved=swapMarks(cells,i,j);
            const progress=goal.type==='collect'?found.filter(k=>copy[k]===goal.symbol).length:goal.type==='seals'?found.filter(k=>moved.has(k)).length:found.length;
            const value=progress*100+found.length;if(value>priority){priority=value;best=[i,j];}
        }return best;
    }
    function newBoard(random=Math.random,side=6,voids=new Set(),blocked=voids){
        for(let attempt=0;attempt<200;attempt++){
            const board=[];
            for(let i=0;i<side*side;i++){
                if(voids.has(i)){board.push(null);continue;}
                const forbidden=new Set();
                if(i%side>=2&&board[i-1]===board[i-2])forbidden.add(board[i-1]);
                if(i>=2*side&&board[i-side]===board[i-2*side])forbidden.add(board[i-side]);
                const choices=[0,1,2,3,4,5].filter(n=>!forbidden.has(n));board.push(choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]);
            }if(findMove(board,null,null,blocked))return board;
        }
        const base=Array.from({length:side*side},(_,i)=>voids.has(i)?null:(Math.floor(i/side)+i%side)%6);
        for(let r=0;r<side-1;r++)for(let c=0;c<side-2;c++){
            const ids=[r*side+c,r*side+c+1,r*side+c+2,(r+1)*side+c,(r+1)*side+c+1,(r+1)*side+c+2];
            if(ids.some(i=>blocked.has(i)))continue;
            for(let offset=0;offset<6;offset++){
                const board=base.slice();ids.forEach((i,k)=>board[i]=([1,0,1,2,1,3][k]+offset)%6);
                if(!matches(board).length&&findMove(board,null,null,blocked))return board;
            }
        }
        throw new Error('В форме поля нет места для доступного хода.');
    }
    function collapsePlan(board,cleared,random=Math.random,blocked=new Set()){
        const side=sideOf(board),removed=new Set(cleared),next=[],origins=[];
        for(let c=0;c<side;c++){
            let bottom=side-1;
            while(bottom>=0){
                const fixed=bottom*side+c;
                if(blocked.has(fixed)){origins[fixed]=fixed;next[fixed]=board[fixed];bottom--;continue;}
                let top=bottom;while(top>0&&!blocked.has((top-1)*side+c))top--;
                const column=[];for(let r=bottom;r>=top;r--)if(!removed.has(r*side+c))column.push(r*side+c);
                for(let r=bottom;r>=top;r--){const i=r*side+c,origin=column.length?column.shift():null;origins[i]=origin;next[i]=origin==null?Math.floor(random()*6):board[origin];}
                bottom=top-1;
            }
        }return{board:next,origins};
    }
    function collapse(board,cleared,random=Math.random){return collapsePlan(board,cleared,random).board;}
    function moveMarks(marked,origins){return new Set(origins.flatMap((from,i)=>from!=null&&marked.has(from)?[i]:[]));}
    function swapMarks(marked,a,b){const next=new Set(marked),atA=marked.has(a),atB=marked.has(b);next.delete(a);next.delete(b);if(atA)next.add(b);if(atB)next.add(a);return next;}
    function missionProgress(goal,board,found,remaining){
        if(goal?.type==='collect')return found.filter(i=>board[i]===goal.symbol).length;
        if(goal?.type==='seals'){let count=0;new Set(found).forEach(i=>{if(remaining.delete(i))count++;});return count;}
        return found.length;
    }
    function combinationPlan(board,blocked=new Set(),preferred=[]){
        const side=sideOf(board),lines=[];
        for(const step of [1,side])for(let i=0;i<board.length;i++){
            if(blocked.has(i)||board[i]==null)continue;const prev=i-step;
            if(prev>=0&&(step===side||Math.floor(prev/side)===Math.floor(i/side))&&!blocked.has(prev)&&board[prev]===board[i])continue;
            const cells=[i];for(let j=i+step;j<board.length&&(step===side||Math.floor(j/side)===Math.floor(i/side))&&!blocked.has(j)&&board[j]===board[i];j+=step)cells.push(j);
            if(cells.length>=3)lines.push({cells,step});
        }
        const found=[...new Set(lines.flatMap(l=>l.cells))],spawns=new Map(),used=new Set();
        for(const line of lines.filter(l=>l.cells.length>=5)){const at=preferred.find(i=>line.cells.includes(i))??line.cells[Math.floor(line.cells.length/2)];spawns.set(at,'color');line.cells.forEach(i=>used.add(i));}
        for(const h of lines.filter(l=>l.step===1))for(const v of lines.filter(l=>l.step===side)){const at=h.cells.find(i=>v.cells.includes(i));if(at!=null&&!used.has(at)){spawns.set(at,'bomb');[...h.cells,...v.cells].forEach(i=>used.add(i));}}
        for(const line of lines.filter(l=>l.cells.length===4)){if(line.cells.some(i=>used.has(i)))continue;const at=preferred.find(i=>line.cells.includes(i))??line.cells[1];spawns.set(at,line.step===1?'row':'column');line.cells.forEach(i=>used.add(i));}
        return{found,spawns};
    }
    function blast(board,initial,specials,blocked=new Set(),color=null){
        const side=sideOf(board),valid=i=>i>=0&&i<board.length&&!blocked.has(i)&&board[i]!=null;
        const found=new Set(initial.filter(valid)),queue=[...found],activated=new Set();
        const add=i=>{if(valid(i)&&!found.has(i)){found.add(i);queue.push(i);}};
        while(queue.length){const i=queue.shift(),type=specials.get(i);if(!type||activated.has(i))continue;activated.add(i);
            if(type==='row')for(let c=0;c<side;c++)add(Math.floor(i/side)*side+c);
            if(type==='column')for(let r=0;r<side;r++)add(r*side+i%side);
            if(type==='bomb')for(let r=Math.max(0,Math.floor(i/side)-1);r<=Math.min(side-1,Math.floor(i/side)+1);r++)for(let c=Math.max(0,i%side-1);c<=Math.min(side-1,i%side+1);c++)add(r*side+c);
            if(type==='color')board.forEach((value,j)=>{if(color==='all'||value===(color??board[i]))add(j);});
        }return[...found];
    }
    function unlockAdjacent(locks,found,side=6){const hit=new Set();for(const i of found)for(const j of locks.keys())if(adjacent(i,j,side))hit.add(j);for(const i of hit){const layers=locks.get(i)-1;if(layers<=0)locks.delete(i);else locks.set(i,layers);}return[...hit];}
    function shufflePlan(board,blocked=new Set(),specials=new Map(),random=Math.random){
        const free=board.map((_,i)=>i).filter(i=>!blocked.has(i)),identity=board.map((_,i)=>i);
        for(let attempt=0;attempt<200;attempt++){
            const order=free.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
            const origins=identity.slice();free.forEach((at,k)=>origins[at]=order[k]);const next=origins.map(from=>board[from]),powers=new Map(origins.flatMap((from,i)=>specials.has(from)?[[i,specials.get(from)]]:[]));
            if(!combinationPlan(next,blocked).found.length&&findMove(next,null,null,blocked,powers))return{board:next,origins};
        }
        const voids=new Set(board.map((v,i)=>v==null?i:-1).filter(i=>i>=0));return{board:newBoard(random,sideOf(board),voids,blocked),origins:identity};
    }
    function mount(host, options) {
        const symbols = ['☉', '☽', '♀', '♃', '✦', '☿'];
        const names = ['Солнце', 'Луна', 'Роза', 'Кристалл', 'Звезда', 'Комета'];
        const side=options.cols||options.rows||6;
        const goal = options.goal || { type: 'score' };
        let seals = new Set(goal.cells || []);
        // Essential tile motion is always smooth; decorative particles respect the system.
        const reducedDecorations = window.Observatory ? Observatory.reducedMotion() : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let board = options.initialBoard ? options.initialBoard.slice() : [], tiles = [], selected = -1, score = 0, moves = options.moves;
        let busy = false, stopped = false, pointer = null, suppressClick = false;
        let specials=new Map(options.specials||[]);
        const voids=new Set(options.voids||[]);voids.forEach(i=>board[i]=null);
        const locks=new Map((options.obstacles||[]).filter(([i])=>!voids.has(i)));
        const barriers=()=>new Set([...locks.keys(),...voids]);
        if(!options.initialBoard)board=newBoard(Math.random,side,voids,barriers());
        seals=new Set([...seals].filter(i=>!voids.has(i)));
        host.dataset.size=side;host.dataset.shape=options.shape||(voids.size?'sculpted':'rectangle');
        if(!options.initialBoard)for(let attempt=0;attempt<50&&!findMove(board,goal,seals,barriers(),specials);attempt++)board=newBoard(Math.random,side,voids,barriers()).map((v,i)=>voids.has(i)?null:v);
        const specialNames={row:'Луч по горизонтали',column:'Луч по вертикали',bomb:'Звёздная бомба',color:'Призма цвета'};
        const timers = new Set(), animations = new Set(), effects = new Set();
        const active = () => !stopped && options.active();
        function later(fn, ms) {
            const id = setTimeout(() => { timers.delete(id); if (active()) fn(); }, ms);
            timers.add(id);
            return id;
        }
        function animate(tile, frames, ms, delay = 0, hold = false) {
            if (!tile.animate) return;
            const animation = tile.animate(frames, { duration: ms, delay, easing: 'cubic-bezier(.22,.68,.26,1)', fill: hold ? 'both' : 'backwards' });
            animations.add(animation);
            animation.onfinish = () => { if (!hold) animations.delete(animation); };
            return animation;
        }
        function waitForMotion(list, callback) {
            const running = list.filter(Boolean);
            if (!running.length) { later(callback, 20); return; }
            Promise.all(running.map(a => a.finished.catch(() => {}))).then(() => { if (active()) callback(); });
        }
        function placeTiles() {
            if (stopped) return;
            const css = getComputedStyle(host), gap = parseFloat(css.columnGap) || 8;
            const pad = parseFloat(css.paddingLeft) || 8;
            const width = ((host.clientWidth > 50 ? host.clientWidth : 360) - pad * 2 - gap * (side-1)) / side;
            const height = ((host.clientHeight > 50 ? host.clientHeight : 360) - pad * 2 - gap * (side-1)) / side;
            tiles.forEach((tile, i) => {
                tile.style.left = (pad + (i % side) * (width + gap)) + 'px';
                tile.style.top = (pad + Math.floor(i / side) * (height + gap)) + 'px';
                tile.style.width = width + 'px'; tile.style.height = height + 'px';
            });
        }
        function notify(message) {
            options.update({ score, moves, goal, message: message || '4 в ряд — луч; 5 — призма цвета; Т или Г — бомба. Обмен бонуса активирует его.' });
        }
        function label() {
            if (goal.type === 'collect') return 'Соберите ' + options.target + ' символов «' + names[goal.symbol] + '»';
            if (goal.type === 'seals') return 'Снимите ' + options.target + ' лунных печатей: собирайте комбинации с отмеченными фишками';
            return 'Соберите ' + options.target + ' символов';
        }
        function refresh() {
            tiles.forEach((tile, i) => {
                tile.dataset.index = i;
                tile.classList.toggle('selected', i === selected);
                tile.classList.toggle('sealed', seals.has(i));
                tile.dataset.void=String(voids.has(i));tile.dataset.special=specials.get(i)||'';tile.dataset.lock=locks.has(i)?(locks.get(i)>1?'ice':'lock'):'';
                let mark=tile.querySelector('.gem-power');if(!mark){mark=document.createElement('span');mark.className='gem-power';tile.appendChild(mark);}
                mark.textContent=locks.has(i)?(locks.get(i)>1?'❄':'🔒'):({row:'↔',column:'↕',bomb:'✹',color:'✺'}[specials.get(i)]||'');
                tile.setAttribute('aria-disabled',String(locks.has(i)||voids.has(i)));if(voids.has(i))tile.tabIndex=-1;
                tile.setAttribute('aria-pressed', String(i === selected));
                tile.setAttribute('aria-label', names[board[i]] + ', ряд ' + (Math.floor(i / side) + 1) + ', столбец ' + (i % side + 1) + (seals.has(i) ? ', лунная печать' : '') + (locks.has(i)?', заблокировано, слоёв: '+locks.get(i):specials.has(i)?', '+specialNames[specials.get(i)]:''));
            });
            host.classList.toggle('resolving', busy);
            host.setAttribute('aria-busy', String(busy));
        }
        function makeTile(value) {
            const tile = document.createElement('button');
            tile.className = 'gem gem-' + value;
            tile.innerHTML = '<span class="gem-symbol">' + symbols[value] + '</span><span class="gem-art" aria-hidden="true" style="--icon-x:' + (value % 3 * 50) + '%;--icon-y:' + (Math.floor(value / 3) * 100) + '%"></span>';
            tile.type = 'button';
            tile.addEventListener('click', () => {
                if (suppressClick) { suppressClick = false; return; }
                select(+tile.dataset.index);
            });
            tile.addEventListener('pointerdown', e => {
                if (!active() || busy || e.button > 0 || (locks.has(+tile.dataset.index)||voids.has(+tile.dataset.index))) return;
                pointer = { index: +tile.dataset.index, x: e.clientX, y: e.clientY, id: e.pointerId };
                try { tile.setPointerCapture(e.pointerId); } catch (_) {}
            });
            tile.addEventListener('pointerup', e => {
                if (!pointer || pointer.id !== e.pointerId) return;
                const p = pointer; pointer = null;
                const dx = e.clientX - p.x, dy = e.clientY - p.y;
                if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
                const other = p.index + (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : (dy > 0 ? side : -side));
                if (!adjacent(p.index, other,side)) return;
                suppressClick = true;
                // Свайп всегда означает ровно один обмен, независимо от выбора до него.
                selected = p.index; select(other);
                later(() => { suppressClick = false; }, 300);
            });
            tile.addEventListener('pointercancel', () => { pointer = null; });
            tile.addEventListener('keydown', e => {
                const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -side, ArrowDown: side }[e.key];
                if (delta && adjacent(+tile.dataset.index, +tile.dataset.index + delta,side)) {
                    e.preventDefault();let from=+tile.dataset.index,to=from+delta;while(adjacent(from,to,side)&&voids.has(to)){from=to;to+=delta;}if(adjacent(from,to,side))tiles[to].focus();
                }
            });
            return tile;
        }
        function reshuffle(){
            const plan=shufflePlan(board,barriers(),specials);
            seals=moveMarks(seals,plan.origins);specials=new Map(plan.origins.flatMap((from,i)=>specials.has(from)?[[i,specials.get(from)]]:[]));board=plan.board;
        }
        function rebuild(message) {
            const focus = host.contains(document.activeElement) ? +document.activeElement.dataset.index : -1;
            tiles = board.map(makeTile);
            host.replaceChildren(...tiles);
            host.dataset.phase = 'idle'; placeTiles(); refresh(); notify(message);
            if (focus >= 0) tiles[focus]?.focus({ preventScroll: true });
        }
        function praise(text) {
            if (reducedDecorations) return;
            const el = document.createElement('span');
            el.className = 'alchemy-praise'; el.textContent = text; el.setAttribute('aria-hidden', 'true');
            host.parentNode.appendChild(el); effects.add(el);
            later(() => { el.remove(); effects.delete(el); }, 1000);
        }
        function sparkle(found) {
            if (reducedDecorations) return;
            found.slice(0, 12).forEach(i => {
                const tile = tiles[i], box = tile.getBoundingClientRect(), zone = host.parentNode.getBoundingClientRect();
                for (let n = 0; n < 3; n++) {
                    const el = document.createElement('i');
                    el.className = 'alchemy-spark'; el.textContent = document.body.dataset.effect === 'petals' ? '❀' : '✦'; el.setAttribute('aria-hidden', 'true');
                    el.style.left = box.left - zone.left + box.width / 2 + 'px';
                    el.style.top = box.top - zone.top + box.height / 2 + 'px';
                    el.style.setProperty('--spark-x', ((n - 1) * 24) + 'px');
                    el.style.setProperty('--spark-y', (-20 - n * 12) + 'px');
                    el.style.color = getComputedStyle(tile).color;
                    host.parentNode.appendChild(el); effects.add(el);
                    later(() => { el.remove(); effects.delete(el); }, 650);
                }
            });
        }
        function specialFlash(found){
            if(reducedDecorations)return;
            const zone=host.parentNode.getBoundingClientRect(),area=host.getBoundingClientRect();
            found.filter(i=>specials.has(i)).slice(0,8).forEach(i=>{
                const r=tiles[i].getBoundingClientRect(),type=specials.get(i),el=document.createElement('span');
                el.className='power-wave wave-'+type;el.setAttribute('aria-hidden','true');
                const horizontal=type==='row',vertical=type==='column';
                Object.assign(el.style,{left:(horizontal?area.left:r.left)-zone.left+'px',top:(vertical?area.top:r.top)-zone.top+'px',width:(horizontal?area.width:r.width)+'px',height:(vertical?area.height:r.height)+'px'});
                host.parentNode.appendChild(el);effects.add(el);later(()=>{el.remove();effects.delete(el);},650);
            });
        }
        function drop(found, callback) {
            host.dataset.phase = 'fall';
            const focused = host.contains(document.activeElement) ? document.activeElement : null;
            const focusIndex = focused ? +focused.dataset.index : -1;
            const plan = collapsePlan(board, found, Math.random, barriers()), old = tiles.slice();
            const oldPositions = old.map(tile => ({ x: parseFloat(tile.style.left), y: parseFloat(tile.style.top) }));
            const pitch = oldPositions[side].y - oldPositions[0].y;
            const newPerColumn = Array.from({ length: side }, (_, col) => plan.origins.filter((from, i) => i % side === col && from == null).length);
            specials=new Map(plan.origins.flatMap((from,i)=>from!=null&&specials.has(from)?[[i,specials.get(from)]]:[]));
            seals=moveMarks(seals,plan.origins);
            board = plan.board;
            tiles = plan.origins.map((origin, i) => origin == null ? makeTile(board[i]) : old[origin]);
            old.forEach((tile, i) => { if (found.includes(i)) tile.getAnimations().forEach(a => { a.cancel(); animations.delete(a); }); });
            host.replaceChildren(...tiles); placeTiles(); refresh();
            if (focused) (focused.isConnected ? focused : tiles[focusIndex])?.focus({ preventScroll: true });
            const falling = [];
            tiles.forEach((tile, i) => {
                const origin = plan.origins[i];
                // Новые фишки начинают в разных клетках над полем, а не в одной точке.
                const from = origin == null ? -newPerColumn[i % side] * pitch : oldPositions[origin].y - parseFloat(tile.style.top);
                if (Math.abs(from) < .5) return;
                falling.push(animate(tile, [
                    { transform: 'translateY(' + from + 'px)', opacity: origin == null ? .35 : 1 },
                    { transform: 'translateY(3px)', opacity: 1, offset: .9 },
                    { transform: 'translateY(0)', opacity: 1 }
                ], 620 + Math.min(180, Math.abs(from) * .35), i % side * 22, true));
            });
            waitForMotion(falling, () => {
                falling.forEach(a => { if (a) { a.cancel(); animations.delete(a); } });
                callback();
            });
        }
        function settle(chain, extraMove, forced=[], chosenColor=null, preferred=[]) {
            const plan=combinationPlan(board,barriers(),preferred);
            // Existing bonuses detonate; newly created bonuses remain for a future turn.
            const found=blast(board,[...plan.found,...forced],specials,barriers(),chosenColor);
            const spawns=new Map([...plan.spawns].filter(([i])=>!specials.has(i)&&!forced.includes(i)));
            spawns.forEach((type,i)=>{const at=found.indexOf(i);if(at>=0)found.splice(at,1);});
            if (!found.length) {
                if (score >= options.target) { host.dataset.phase = 'complete'; options.win(); return; }
                if (moves <= 0) { host.dataset.phase = 'failed'; options.lose(); return; }
                busy = false; host.dataset.phase = 'idle';
                if (!findMove(board,goal,seals,barriers(),specials)) {
                    reshuffle();
                    rebuild('Небо обновило расклад. Перетасовка бесплатна.');
                    tiles.forEach((tile, i) => animate(tile, [{ opacity: .1, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }], 300, i * 4));
                } else { refresh(); notify('Хороший ход. ' + label() + '.'); }
                return;
            }
            host.dataset.phase = 'clear';
            if (Math.max(found.length,plan.found.length) >= 4 && !extraMove) { moves++; extraMove = true; }
            const unlocked=unlockAdjacent(locks,[...found,...spawns.keys()],side);
            unlocked.forEach(i=>{const tile=tiles[i];tile.classList.add('unlocking');later(()=>tile.classList.remove('unlocking'),500);});
            specialFlash(found);
            spawns.forEach((type,i)=>specials.set(i,type));
            found.forEach(i=>specials.delete(i));
            const gained = missionProgress(goal, board, [...new Set([...found,...spawns.keys()])], seals);
            score += gained;
            options.match(found.length, chain);
            sparkle(found);
            if (chain > 1) praise('Каскад ×' + chain);
            else if (found.length >= 4) praise('Созвездие! +1 ход');
            const vanishing = found.map(i => animate(tiles[i], [
                { transform: 'scale(1)', opacity: 1 },
                { transform: 'scale(1.13)', opacity: 1, offset: .35, filter: 'brightness(1.6)' },
                { transform: 'scale(.55)', opacity: 0, filter: 'brightness(2)' }
            ], 260, 0, true));
            refresh();
            notify(chain > 1 ? 'Каскад ×' + chain + ' · ' + label() : (extraMove ? 'Большое созвездие: +1 ход' : 'Созвездие собрано!'));
            waitForMotion(vanishing, () => drop(found, () => {
                // Предохранитель на аномально длинный случайный каскад.
                if (chain >= 20) { reshuffle(); rebuild('Новый звёздный расклад'); }
                settle(chain + 1, extraMove);
            }));
        }
        function select(i) {
            if (!active() || busy) return;
            if(voids.has(i))return;
            if(locks.has(i)){notify('Соберите комбинацию рядом: замок откроется за 1, лёд — за 2 попадания.');return;}
            if (selected === i) { selected = -1; refresh(); return; }
            if (selected < 0 || !adjacent(selected, i,side)) { selected = i; refresh(); return; }
            const a = selected;
            if(locks.has(a)||voids.has(a)){selected=-1;refresh();return;}
            selected = -1; busy = true; host.dataset.phase = 'swap'; refresh();
            [tiles[a], tiles[i]].forEach(tile => {
                animations.forEach(animation => { if (animation.effect?.target === tile) { animation.cancel(); animations.delete(animation); } });
            });
            const dx = tiles[i].offsetLeft - tiles[a].offsetLeft, dy = tiles[i].offsetTop - tiles[a].offsetTop;
            [board[a], board[i]] = [board[i], board[a]];
            const hasSpecial=specials.has(a)||specials.has(i),beforeA=specials.get(a),beforeI=specials.get(i);
            specials.delete(a);specials.delete(i);if(beforeA)specials.set(i,beforeA);if(beforeI)specials.set(a,beforeI);
            const forced=hasSpecial?[a,i]:[];
            const chosenColor=beforeA==='color'&&beforeI==='color'?'all':beforeA==='color'?board[a]:beforeI==='color'?board[i]:null;
            const valid = hasSpecial || combinationPlan(board,barriers()).found.length > 0;
            if (valid) moves--;
            const frames = (x, y) => [{ transform: 'translate(0,0)' }, { transform: 'translate(' + x + 'px,' + y + 'px)' }];
            const swaps = [animate(tiles[a], frames(dx, dy), 240, 0, true), animate(tiles[i], frames(-dx, -dy), 240, 0, true)];
            const cancel = list => list.forEach(a => { if (a) { a.cancel(); animations.delete(a); } });
            notify(valid ? 'Звёзды меняются местами…' : 'Ищем созвездие…');
            waitForMotion(swaps, () => {
                cancel(swaps);
                if (!valid) {
                    const returns = [animate(tiles[a], frames(dx, dy).reverse(), 220, 0, true), animate(tiles[i], frames(-dx, -dy).reverse(), 220, 0, true)];
                    waitForMotion(returns, () => {
                        cancel(returns);
                        [board[a], board[i]] = [board[i], board[a]];
                        busy = false; host.dataset.phase = 'idle'; refresh(); notify('Линия не сложилась. Ход сохранён.');
                    });
                    return;
                }
                const focus = host.contains(document.activeElement) ? document.activeElement : null;
                seals=swapMarks(seals,a,i);
                [tiles[a], tiles[i]] = [tiles[i], tiles[a]];
                host.replaceChildren(...tiles); placeTiles(); refresh();
                focus?.focus({ preventScroll: true });
                settle(1, false, forced, chosenColor, [i,a]);
            });
        }
        rebuild(label() + ' за ' + moves + ' ходов. Можно нажимать или смахивать символы.');
        tiles.forEach((tile, i) => animate(tile, [{ transform: 'translateY(-18px) scale(.9)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], 380, i % side * 20));
        const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(placeTiles) : null;
        resizeObserver?.observe(host);
        return {
            layout: placeTiles,
            destroy() {
                stopped = true; pointer = null; resizeObserver?.disconnect();
                timers.forEach(clearTimeout); timers.clear();
                animations.forEach(a => a.cancel()); animations.clear();
                effects.forEach(el => el.remove()); effects.clear();
                host.classList.remove('resolving'); host.removeAttribute('aria-busy'); delete host.dataset.phase;delete host.dataset.size;delete host.dataset.shape;
            },
            hint() {
                if (busy || stopped) return;
                const pair = findMove(board, goal, seals, barriers(), specials);
                if (pair) pair.forEach(i => tiles[i].classList.add('gem-hint'));
                later(() => tiles.forEach(el => el.classList.remove('gem-hint')), 2200);
            },
            get seals() { return new Set(seals); },
            get specials() { return new Map(specials); },
            get obstacles() { return new Map(locks); },
            get board() { return board.slice(); },
            get busy() { return busy; },
            get moves() { return moves; }
        };
    }
    const Match3 = { adjacent, matches, findMove, newBoard, collapse, collapsePlan, missionProgress, combinationPlan, blast, unlockAdjacent, moveMarks, swapMarks, shufflePlan, mount };
    root.Match3 = Match3;
    if (typeof module !== 'undefined') module.exports = Match3;
})(typeof window === 'undefined' ? globalThis : window);
