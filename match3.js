/* «Алхимия звёзд»: чистая модель поля и браузерный контроллер. */
(function(root) {
    'use strict';
    const size = 6;
    function adjacent(a, b) {
        return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < 36 && b < 36 &&
            Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs(a % size - b % size) === 1;
    }
    function matches(board) {
        const out = new Set();
        for (let i = 0; i < 36; i++) {
            for (const step of [1, size]) {
                const run = [i];
                for (let j = i + step; j < 36 && (step !== 1 || Math.floor(j / size) === Math.floor(i / size)) && board[j] === board[i]; j += step) run.push(j);
                if (board[i] != null && run.length >= 3) run.forEach(j => out.add(j));
            }
        }
        return [...out];
    }
    function findMove(board, goal, remaining) {
        let best = null, priority = -1;
        const cells = remaining || new Set(goal?.cells || []);
        for (let i = 0; i < 36; i++) for (const j of [i + 1, i + size]) {
            if (!adjacent(i, j)) continue;
            const copy = board.slice();
            [copy[i], copy[j]] = [copy[j], copy[i]];
            const found = matches(copy);
            if (!found.length) continue;
            if (!goal) return [i, j];
            const progress = goal.type === 'collect' ? found.filter(k => copy[k] === goal.symbol).length : goal.type === 'seals' ? found.filter(k => cells.has(k)).length : found.length;
            const value = progress * 100 + found.length;
            if (value > priority) { priority = value; best = [i, j]; }
        }
        return best;
    }
    function newBoard(random = Math.random) {
        for (let attempt = 0; attempt < 200; attempt++) {
            const board = [];
            for (let i = 0; i < 36; i++) {
                const forbidden = new Set();
                if (i % size >= 2 && board[i - 1] === board[i - 2]) forbidden.add(board[i - 1]);
                if (i >= 12 && board[i - size] === board[i - 12]) forbidden.add(board[i - size]);
                const choices = [0, 1, 2, 3, 4, 5].filter(n => !forbidden.has(n));
                board.push(choices[Math.floor(random() * choices.length)]);
            }
            if (findMove(board)) return board;
        }
        // Детерминированная страховка для источника случайности с плохим распределением.
        return Array.from({ length: 36 }, (_, i) => (Math.floor(i / 6) + i % 6) % 6)
            .map((n, i) => ({ 0: 1, 1: 0, 2: 1, 7: 1 }[i] ?? n));
    }
    // Происхождение каждой фишки позволяет анимировать настоящее падение,
    // сохраняя порядок и DOM-элементы выживших символов.
    function collapsePlan(board, cleared, random = Math.random) {
        const removed = new Set(cleared), next = [], origins = [];
        for (let c = 0; c < size; c++) {
            const column = [];
            for (let r = size - 1; r >= 0; r--) if (!removed.has(r * size + c)) column.push(r * size + c);
            for (let r = size - 1; r >= 0; r--) {
                const i = r * size + c, origin = column.length ? column.shift() : null;
                origins[i] = origin;
                next[i] = origin == null ? Math.floor(random() * 6) : board[origin];
            }
        }
        return { board: next, origins };
    }
    function collapse(board, cleared, random = Math.random) {
        return collapsePlan(board, cleared, random).board;
    }
    function missionProgress(goal, board, found, remaining) {
        if (goal?.type === 'collect') return found.filter(i => board[i] === goal.symbol).length;
        if (goal?.type === 'seals') {
            let count = 0;
            found.forEach(i => { if (remaining.delete(i)) count++; });
            return count;
        }
        return found.length;
    }
    function mount(host, options) {
        const symbols = ['☉', '☽', '♀', '♃', '✦', '☿'];
        const names = ['Солнце', 'Луна', 'Венера', 'Юпитер', 'Звезда', 'Меркурий'];
        const goal = options.goal || { type: 'score' };
        const seals = new Set(goal.cells || []);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let board = newBoard(), tiles = [], selected = -1, score = 0, moves = options.moves;
        let busy = false, stopped = false, pointer = null, suppressClick = false;
        const timers = new Set(), animations = new Set(), effects = new Set();
        const duration = ms => reduced ? 20 : ms;
        const active = () => !stopped && options.active();
        function later(fn, ms) {
            const id = setTimeout(() => { timers.delete(id); if (active()) fn(); }, ms);
            timers.add(id);
            return id;
        }
        function animate(tile, frames, ms, delay = 0, hold = false) {
            if (reduced || !tile.animate) return;
            const animation = tile.animate(frames, { duration: ms, delay, easing: 'cubic-bezier(.22,.68,.26,1)', fill: hold ? 'forwards' : 'backwards' });
            animations.add(animation);
            animation.onfinish = () => { if (!hold) animations.delete(animation); };
            return animation;
        }
        function notify(message) {
            options.update({ score, moves, goal, message: message || 'Обменяйте соседние символы. Линия от трёх зажжёт созвездие.' });
        }
        function label() {
            if (goal.type === 'collect') return 'Соберите ' + options.target + ' символов «' + names[goal.symbol] + '»';
            if (goal.type === 'seals') return 'Снимите ' + options.target + ' лунных печатей: собирайте линии на отмеченных клетках';
            return 'Соберите ' + options.target + ' символов';
        }
        function refresh() {
            tiles.forEach((tile, i) => {
                tile.dataset.index = i;
                tile.classList.toggle('selected', i === selected);
                tile.classList.toggle('sealed', seals.has(i));
                tile.setAttribute('aria-pressed', String(i === selected));
                tile.setAttribute('aria-label', names[board[i]] + ', ряд ' + (Math.floor(i / 6) + 1) + ', столбец ' + (i % 6 + 1) + (seals.has(i) ? ', лунная печать' : ''));
            });
            host.classList.toggle('resolving', busy);
            host.setAttribute('aria-busy', String(busy));
        }
        function makeTile(value) {
            const tile = document.createElement('button');
            tile.className = 'gem gem-' + value;
            tile.innerHTML = '<span class="gem-symbol">' + symbols[value] + '</span><span class="gem-facet" aria-hidden="true"></span>';
            tile.type = 'button';
            tile.addEventListener('click', () => {
                if (suppressClick) { suppressClick = false; return; }
                select(+tile.dataset.index);
            });
            tile.addEventListener('pointerdown', e => {
                if (!active() || busy || e.button > 0) return;
                pointer = { index: +tile.dataset.index, x: e.clientX, y: e.clientY, id: e.pointerId };
                try { tile.setPointerCapture(e.pointerId); } catch (_) {}
            });
            tile.addEventListener('pointerup', e => {
                if (!pointer || pointer.id !== e.pointerId) return;
                const p = pointer; pointer = null;
                const dx = e.clientX - p.x, dy = e.clientY - p.y;
                if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
                const other = p.index + (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : (dy > 0 ? 6 : -6));
                if (!adjacent(p.index, other)) return;
                suppressClick = true;
                // Свайп всегда означает ровно один обмен, независимо от выбора до него.
                selected = p.index; select(other);
                later(() => { suppressClick = false; }, 300);
            });
            tile.addEventListener('pointercancel', () => { pointer = null; });
            tile.addEventListener('keydown', e => {
                const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 }[e.key];
                if (delta && adjacent(+tile.dataset.index, +tile.dataset.index + delta)) {
                    e.preventDefault(); tiles[+tile.dataset.index + delta].focus();
                }
            });
            return tile;
        }
        function rebuild(message) {
            const focus = host.contains(document.activeElement) ? +document.activeElement.dataset.index : -1;
            tiles = board.map(makeTile);
            host.replaceChildren(...tiles);
            refresh(); notify(message);
            if (focus >= 0) tiles[focus]?.focus({ preventScroll: true });
        }
        function praise(text) {
            if (reduced) return;
            const el = document.createElement('span');
            el.className = 'alchemy-praise'; el.textContent = text; el.setAttribute('aria-hidden', 'true');
            host.parentNode.appendChild(el); effects.add(el);
            later(() => { el.remove(); effects.delete(el); }, 1000);
        }
        function sparkle(found) {
            if (reduced) return;
            found.slice(0, 12).forEach(i => {
                const tile = tiles[i], box = tile.getBoundingClientRect(), zone = host.parentNode.getBoundingClientRect();
                for (let n = 0; n < 3; n++) {
                    const el = document.createElement('i');
                    el.className = 'alchemy-spark'; el.textContent = '✦'; el.setAttribute('aria-hidden', 'true');
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
        function drop(found, callback) {
            const focused = host.contains(document.activeElement) ? document.activeElement : null;
            const focusIndex = focused ? +focused.dataset.index : -1;
            const plan = collapsePlan(board, found), old = tiles.slice();
            const pitch = old[6].offsetTop - old[0].offsetTop || host.clientHeight / 6;
            board = plan.board;
            tiles = plan.origins.map((origin, i) => origin == null ? makeTile(board[i]) : old[origin]);
            old.forEach((tile, i) => { if (found.includes(i)) tile.getAnimations().forEach(a => { a.cancel(); animations.delete(a); }); });
            host.replaceChildren(...tiles);
            refresh();
            if (focused) (focused.isConnected ? focused : tiles[focusIndex])?.focus({ preventScroll: true });
            tiles.forEach((tile, i) => {
                const origin = plan.origins[i], row = Math.floor(i / 6);
                const from = origin == null ? -(row + 2) * pitch : (Math.floor(origin / 6) - row) * pitch;
                if (!from) return;
                animate(tile, [
                    { transform: 'translateY(' + from + 'px)', opacity: origin == null ? .15 : 1 },
                    { transform: 'translateY(3px)', opacity: 1, offset: .86 },
                    { transform: 'translateY(0)', opacity: 1 }
                ], 470, (i % 6) * 14);
            });
            later(callback, duration(560));
        }
        function settle(chain, extraMove) {
            const found = matches(board);
            if (!found.length) {
                if (score >= options.target) { options.win(); return; }
                if (moves <= 0) { options.lose(); return; }
                busy = false;
                if (!findMove(board)) {
                    board = newBoard();
                    rebuild('Небо обновило расклад. Перетасовка бесплатна.');
                    tiles.forEach((tile, i) => animate(tile, [{ opacity: .1, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }], 300, i * 4));
                } else { refresh(); notify('Хороший ход. ' + label() + '.'); }
                return;
            }
            if (found.length >= 4 && !extraMove) { moves++; extraMove = true; }
            const gained = missionProgress(goal, board, found, seals);
            score += gained;
            options.match(found.length, chain);
            sparkle(found);
            if (chain > 1) praise('Каскад ×' + chain);
            else if (found.length >= 4) praise('Созвездие! +1 ход');
            found.forEach(i => animate(tiles[i], [
                { transform: 'scale(1)', opacity: 1 },
                { transform: 'scale(1.13)', opacity: 1, offset: .35, filter: 'brightness(1.6)' },
                { transform: 'scale(.55)', opacity: 0, filter: 'brightness(2)' }
            ], 260, 0, true));
            refresh();
            notify(chain > 1 ? 'Каскад ×' + chain + ' · ' + label() : (extraMove ? 'Большое созвездие: +1 ход' : 'Созвездие собрано!'));
            later(() => drop(found, () => {
                // Предохранитель на аномально длинный случайный каскад.
                if (chain >= 20) { board = newBoard(); rebuild('Новый звёздный расклад'); }
                settle(chain + 1, extraMove);
            }), duration(270));
        }
        function select(i) {
            if (!active() || busy) return;
            if (selected === i) { selected = -1; refresh(); return; }
            if (selected < 0 || !adjacent(selected, i)) { selected = i; refresh(); return; }
            const a = selected;
            selected = -1; busy = true; refresh();
            [tiles[a], tiles[i]].forEach(tile => {
                animations.forEach(animation => { if (animation.effect?.target === tile) { animation.cancel(); animations.delete(animation); } });
            });
            const dx = tiles[i].offsetLeft - tiles[a].offsetLeft, dy = tiles[i].offsetTop - tiles[a].offsetTop;
            [board[a], board[i]] = [board[i], board[a]];
            const valid = matches(board).length > 0;
            if (valid) moves--;
            const frames = (x, y) => [{ transform: 'translate(0,0)' }, { transform: 'translate(' + x + 'px,' + y + 'px)' }];
            const swaps = [animate(tiles[a], frames(dx, dy), 240, 0, true), animate(tiles[i], frames(-dx, -dy), 240, 0, true)];
            const cancel = list => list.forEach(a => { if (a) { a.cancel(); animations.delete(a); } });
            notify(valid ? 'Звёзды меняются местами…' : 'Ищем созвездие…');
            later(() => {
                cancel(swaps);
                if (!valid) {
                    const returns = [animate(tiles[a], frames(dx, dy).reverse(), 220, 0, true), animate(tiles[i], frames(-dx, -dy).reverse(), 220, 0, true)];
                    later(() => {
                        cancel(returns);
                        [board[a], board[i]] = [board[i], board[a]];
                        busy = false; refresh(); notify('Линия не сложилась. Ход сохранён.');
                    }, duration(230));
                    return;
                }
                const focus = host.contains(document.activeElement) ? document.activeElement : null;
                [tiles[a], tiles[i]] = [tiles[i], tiles[a]];
                host.replaceChildren(...tiles); refresh();
                focus?.focus({ preventScroll: true });
                settle(1, false);
            }, duration(250));
        }
        rebuild(label() + ' за ' + moves + ' ходов. Можно нажимать или смахивать символы.');
        tiles.forEach((tile, i) => animate(tile, [{ transform: 'translateY(-18px) scale(.9)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], 380, i % 6 * 20));
        return {
            destroy() {
                stopped = true; pointer = null;
                timers.forEach(clearTimeout); timers.clear();
                animations.forEach(a => a.cancel()); animations.clear();
                effects.forEach(el => el.remove()); effects.clear();
                host.classList.remove('resolving'); host.removeAttribute('aria-busy');
            },
            hint() {
                if (busy || stopped) return;
                const pair = findMove(board, goal, seals);
                if (pair) pair.forEach(i => tiles[i].classList.add('gem-hint'));
                later(() => tiles.forEach(el => el.classList.remove('gem-hint')), 2200);
            },
            get board() { return board.slice(); },
            get busy() { return busy; },
            get moves() { return moves; }
        };
    }
    const Match3 = { adjacent, matches, findMove, newBoard, collapse, collapsePlan, missionProgress, mount };
    root.Match3 = Match3;
    if (typeof module !== 'undefined') module.exports = Match3;
})(typeof window === 'undefined' ? globalThis : window);
