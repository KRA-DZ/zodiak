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
    function findMove(board) {
        for (let i = 0; i < 36; i++) for (const j of [i + 1, i + size]) {
            if (!adjacent(i, j)) continue;
            const copy = board.slice();
            [copy[i], copy[j]] = [copy[j], copy[i]];
            if (matches(copy).length) return [i, j];
        }
        return null;
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
    function collapse(board, cleared, random = Math.random) {
        const removed = new Set(cleared);
        const next = board.slice();
        for (let c = 0; c < size; c++) {
            const column = [];
            for (let r = size - 1; r >= 0; r--) if (!removed.has(r * size + c)) column.push(board[r * size + c]);
            for (let r = size - 1; r >= 0; r--) next[r * size + c] = column.length ? column.shift() : Math.floor(random() * 6);
        }
        return next;
    }
    function mount(host, options) {
        const symbols = ['☉', '☽', '♀', '♃', '✦', '☿'];
        const names = ['Солнце', 'Луна', 'Венера', 'Юпитер', 'Звезда', 'Меркурий'];
        let board = newBoard(), selected = -1, score = 0, moves = options.moves, busy = false, stopped = false;
        const timers = new Set();
        function later(fn, ms) {
            const id = setTimeout(() => { timers.delete(id); if (!stopped && options.active()) fn(); }, ms);
            timers.add(id);
        }
        function render(message) {
            host.replaceChildren();
            board.forEach((value, i) => {
                const tile = document.createElement('button');
                tile.className = 'gem gem-' + value + (i === selected ? ' selected' : '');
                tile.textContent = symbols[value];
                tile.type = 'button';
                tile.setAttribute('aria-label', names[value] + ', ряд ' + (Math.floor(i / 6) + 1) + ', столбец ' + (i % 6 + 1));
                tile.setAttribute('aria-pressed', String(i === selected));
                tile.addEventListener('click', () => select(i));
                host.appendChild(tile);
            });
            options.update({ score, moves, message: message || 'Выберите два соседних символа. Соберите линию из трёх.' });
        }
        function settle(chain, extraMove) {
            const found = matches(board);
            if (!found.length) {
                if (score >= options.target) { busy = true; options.win(); return; }
                if (moves <= 0) { busy = true; options.lose(); return; }
                let message = 'Хороший ход. Ищите следующее созвездие.';
                if (!findMove(board)) { board = newBoard(); message = 'Ходов не осталось — звёзды перемешаны бесплатно.'; }
                busy = false;
                render(message);
                return;
            }
            // Один дополнительный ход за комбинацию 4+ в течение хода игрока.
            if (found.length >= 4 && !extraMove) { moves++; extraMove = true; }
            score += found.length;
            options.match(found.length, chain);
            found.forEach(i => host.children[i]?.classList.add('vanish'));
            options.update({ score, moves, message: chain > 1 ? 'Звёздный каскад ×' + chain : (extraMove ? 'Большое созвездие: +1 ход' : 'Созвездие собрано!') });
            later(() => {
                board = collapse(board, found);
                // Ограничиваем цепь, чтобы случайный генератор не мог заблокировать игру.
                if (chain >= 20) board = newBoard();
                render('Звёзды занимают новые места…');
                later(() => settle(chain + 1, extraMove), 180);
            }, 260);
        }
        function select(i) {
            if (stopped || busy || !options.active()) return;
            if (selected === i) { selected = -1; render(); return; }
            if (selected < 0 || !adjacent(selected, i)) { selected = i; render(); return; }
            const a = selected;
            selected = -1;
            [board[a], board[i]] = [board[i], board[a]];
            if (!matches(board).length) {
                [board[a], board[i]] = [board[i], board[a]];
                render('Линия не сложилась. Ход сохранён — попробуйте другую пару.');
                return;
            }
            moves--;
            busy = true;
            render();
            settle(1, false);
        }
        render('Соберите ' + options.target + ' символов за ' + moves + ' ходов. Комбинация 4+ дарит дополнительный ход.');
        return {
            destroy() { stopped = true; timers.forEach(clearTimeout); timers.clear(); },
            hint() {
                if (busy || stopped) return;
                const pair = findMove(board);
                if (pair) pair.forEach(i => host.children[i].classList.add('gem-hint'));
                later(() => host.querySelectorAll('.gem-hint').forEach(el => el.classList.remove('gem-hint')), 2200);
            },
            get board() { return board.slice(); },
            get busy() { return busy; },
            get moves() { return moves; }
        };
    }
    const Match3 = { adjacent, matches, findMove, newBoard, collapse, mount };
    root.Match3 = Match3;
    if (typeof module !== 'undefined') module.exports = Match3;
})(typeof window === 'undefined' ? globalThis : window);
