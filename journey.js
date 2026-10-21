/* Данные и миграция путешествия. Не содержит сетевых запросов. */
(function(root) {
    'use strict';
    const Journey = {
        perSign: 9,
        upgrade(save) {
            if (save.journeyVersion !== 1) {
                const old = Array.isArray(save.lvStars) ? save.lvStars : [];
                if (old.length === 84) {
                    save.lvStars = Array.from({ length: 108 }, (_, i) => i % 9 < 7 ? old[Math.floor(i / 9) * 7 + i % 9] || 0 : 0);
                    save.stats.fast = (save.stats.fast || []).map(i => Math.floor(i / 7) * 9 + i % 7);
                    for (let s = 0; s < 12; s++) {
                        if (old[s * 7 + 6] > 0) save.lvOpen[s] = Math.max(8, save.lvOpen[s]);
                    }
                }
                save.journeyVersion = 1;
            }
            if (!Array.isArray(save.lvStars) || save.lvStars.length !== 108) save.lvStars = new Array(108).fill(0);
            save.lvStars = save.lvStars.map(n => Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : 0);
            save.lvOpen = save.lvOpen.map(n => Number.isFinite(n) ? Math.max(1, Math.min(9, Math.floor(n))) : 1);
            if (!Array.isArray(save.journal)) save.journal = [];
            save.journal = save.journal.filter(p => p && typeof p.text === 'string' && typeof p.day === 'string').slice(-100);
            if (!Number.isFinite(save.omens) || save.omens < 0) save.omens = 0;
            if (!save.endless || typeof save.endless !== 'object') save.endless = {};
            for (const key of ['round', 'best']) {
                const n = save.endless[key];
                save.endless[key] = Number.isSafeInteger(n) && n >= (key === 'round' ? 1 : 0) ? n : (key === 'round' ? 1 : 0);
            }
            if (!Number.isSafeInteger(save.loginStreak) || save.loginStreak < 0) save.loginStreak = 0;
            return save;
        },
        extendLevels(levels) {
            const expanded = [];
            for (let s = 0; s < 12; s++) {
                expanded.push(...levels.slice(s * 7, s * 7 + 7));
                expanded.push({ match3: true, rows: 6, cols: 6, target: 75, moves: 18, par: 180 });
                expanded.push({ match3: true, rows: 6, cols: 6, target: 108, moves: 22, par: 240 });
            }
            return expanded;
        },
        dayNumber(iso) {
            const p = iso.split('-').map(Number);
            return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000;
        },
        endlessConfig(round) {
            const tier = Math.min(5, Math.floor((round - 1) / 3));
            if (round % 3 === 0) return { match3: true, rows: 6, cols: 6, target: 60 + tier * 12, moves: 20, par: 240 };
            if (round % 3 === 2) return {
                oracle: true, par: 180,
                stages: [{ rows: 3, cols: 4, targets: Math.min(3, 1 + tier), swaps: 5 + tier, dur: Math.max(360, 620 - tier * 40), dual: tier > 2 }]
            };
            const pairs = 6 + tier * 2;
            return { rows: Math.ceil(pairs * 2 / 4), cols: 4, pairs, par: 100 + tier * 20 };
        }
    };
    root.Journey = Journey;
    if (typeof module !== 'undefined') module.exports = Journey;
})(typeof window === 'undefined' ? globalThis : window);
