/* Данные и миграция путешествия. Не содержит сетевых запросов. */
(function(root) {
    'use strict';
    const Campaign = root.Campaign || (typeof require==='function'?require('./campaign.js'):null);
    const Journey = {
        perSign: 30,
        upgrade(save) {
            Campaign.upgrade(save);
            if(!save.levelGuides||typeof save.levelGuides!=='object')save.levelGuides={};
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
            return Campaign.generate();
        },
        alchemyConfig(sign, variant = 0) {
            const config = { match3: true, rows: 6, cols: 6, target: 70, moves: 20, par: 180 };
            if (variant === 1) {
                const shift = sign % 3;
                const cells = [7, 10, 14, 21, 25, 28].map(i => i + (shift === 1 ? 1 : shift === 2 ? -1 : 0));
                return { ...config, target: cells.length, moves: 24, par: 240, goal: { type: 'seals', cells }, obstacles:[[8,1],[9,2],[26,2],[27,1]] };
            }
            if (sign % 2) return { ...config, target: 16, moves: 24, goal: { type: 'collect', symbol: sign % 6 } };
            return config;
        },
        dayNumber(iso) {
            const p = iso.split('-').map(Number);
            return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000;
        },
        endlessConfig(round) {
            const tier = Math.min(5, Math.floor((round - 1) / 3));
            if (round % 3 === 0) {
                const variant = Math.floor((round - 1) / 3) % 3;
                if (variant === 1) return { ...this.alchemyConfig(round % 12, 0), goal: { type: 'collect', symbol: tier % 6 }, target: 12 + tier, moves: 24 };
                if (variant === 2) return this.alchemyConfig(round % 12, 1);
                return { match3: true, rows: 6, cols: 6, target: 60 + tier * 8, moves: 22, par: 240 };
            }
            if (round % 3 === 2) return {
                oracle: true, par: 180,
                stages: [{ rows: 3, cols: 4, targets: Math.min(2, 1 + tier), swaps: 5 + tier, dur: Math.max(360, 620 - tier * 40), dual: tier > 2 }]
            };
            const pairs = 6 + tier * 2;
            return { rows: Math.ceil(pairs * 2 / 4), cols: 4, pairs, par: 100 + tier * 20 };
        }
    };
    root.Journey = Journey;
    if (typeof module !== 'undefined') module.exports = Journey;
})(typeof window === 'undefined' ? globalThis : window);
