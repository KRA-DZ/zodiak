/* Проверка переносимых сохранений до любой записи в localStorage. */
(function(root) {
    'use strict';
    const fail = () => { throw new Error('Файл не похож на корректную копию прогресса этой игры.'); };
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const int = (n, max = 1e9) => Number.isSafeInteger(n) && n >= 0 && n <= max;
    const date = s => {
        if (s === '') return true;
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const d = new Date(s + 'T12:00:00Z');
        return !isNaN(d) && d.toISOString().slice(0, 10) === s;
    };
    const text = (v, max = 5000) => typeof v === 'string' && v.length <= max;
    const flags = o => object(o) && Object.values(o).every(v => typeof v === 'boolean');
    const safeKeys = o => {
        if (!o || typeof o !== 'object') return;
        for (const key of Object.keys(o)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) fail();
            safeKeys(o[key]);
        }
    };
    function parse(source) {
        if (typeof source !== 'string' || source.length > 1024 * 1024) throw new Error('Размер копии должен быть не больше 1 МБ.');
        let packet;
        try { packet = JSON.parse(source); } catch (_) { throw new Error('Не удалось прочитать JSON. Выберите файл, сохранённый из книги предсказаний.'); }
        if (!object(packet) || packet.format !== 'zodiac-memory' || packet.version !== 1 || !object(packet.save)) fail();
        // Ограничение глубины заодно защищает проверку вложенных объектов.
        const depth = (o, n = 0) => {
            if (n > 12) fail();
            if (o && typeof o === 'object') Object.values(o).forEach(v => depth(v, n + 1));
        };
        depth(packet); safeKeys(packet);
        const s = packet.save;
        if (!(s.sign === null || int(s.sign, 11)) || !int(s.dust)) fail();
        if (!Array.isArray(s.lvStars) || ![84,108,360].includes(s.lvStars.length) || !s.lvStars.every(n => int(n, 3))) fail();
        if (!Array.isArray(s.lvOpen) || s.lvOpen.length !== 12 || !s.lvOpen.every(n => int(n, 30) && n >= 1)) fail();
        if (s.journeyVersion != null && (![1,2].includes(s.journeyVersion) || (s.journeyVersion===1?s.lvStars.length!==108:s.lvStars.length!==360))) fail();
        if (!object(s.inv) || !['hint','freeze','map'].every(k => int(s.inv[k], 1000000))) fail();
        for (const k of ['created','omens','loginStreak']) if (s[k] != null && !int(s[k], Number.MAX_SAFE_INTEGER)) fail();
        for (const k of ['birth','daily','predDay','calStart','calLast','loginLast']) if (s[k] != null && !date(s[k])) fail();
        for (const k of ['skins','ach']) if (s[k] != null && !flags(s[k])) fail();
        const skins = ['classic','gold','silver','neon','celestial','dawn','moss','abyss','moonlace','roseglass'];
        if (s.skin != null && (!skins.includes(s.skin) || !s.skins?.[s.skin])) fail();
        if (s.wheelBonus != null && typeof s.wheelBonus !== 'boolean') fail();
        if (s.calTaken != null && (!Array.isArray(s.calTaken) || s.calTaken.length > 31 || !s.calTaken.every(n => int(n,31) && n > 0) || new Set(s.calTaken).size !== s.calTaken.length)) fail();
        if (s.stats != null) {
            if (!object(s.stats)) fail();
            for (const [k,v] of Object.entries(s.stats)) {
                if (k === 'fast') { if (!Array.isArray(v) || v.length > 360 || !v.every(n => int(n,359))) fail(); }
                else if (k === 'fastMaskLo' || k === 'fastMaskHi') { if (!Number.isInteger(v) || v < -2147483648 || v > 4294967295) fail(); }
                else if (!int(v)) fail();
            }
        }
        if (s.traits != null && (!Array.isArray(s.traits) || s.traits.length !== 12 || !s.traits.every(row => Array.isArray(row) && row.length === 10 && row.every(v => typeof v === 'boolean')))) fail();
        if (s.horoUsed != null && (!object(s.horoUsed) || !Object.values(s.horoUsed).every(v => Array.isArray(v) && v.length < 10000 && v.every(n => (typeof n === 'string' && /^\d{1,5}$/.test(n)) || int(n,99999))))) fail();
        if (s.preds != null) {
            if (!object(s.preds)) fail();
            for (const c of ['love','career','fin','health']) {
                const p = s.preds[c];
                if (!object(p) || !int(p.count,1) || !(p.last === '' || int(p.last,99999) || (typeof p.last === 'string' && /^\d{1,5}$/.test(p.last))) || (p.text != null && !text(p.text))) fail();
            }
        }
        if (s.predSign != null && !int(s.predSign,11)) fail();
        if (s.journal != null && (!Array.isArray(s.journal) || s.journal.length > 100 || !s.journal.every(p => object(p) && date(p.day) && p.day !== '' && int(p.sign,11) && ['love','career','fin','health'].includes(p.cat) && text(p.text)))) fail();
        if (s.endless != null && (!object(s.endless) || !int(s.endless.round, 1e7) || s.endless.round < 1 || !int(s.endless.best,1e7))) fail();
        if (s.ritual != null && (!object(s.ritual) || !date(s.ritual.day) || !int(s.ritual.wins,3) || typeof s.ritual.claimed !== 'boolean')) fail();
        if (s.observatory != null) {
            const o=s.observatory;
            const groups={outfits:['apprentice','astral','moon','forest'],pets:['none','cat','owl','dog','dragon'],backgrounds:['original','garden','candles'],effects:['starlight','aurora','petals','comets']};
            if(!object(o)||o.version!==1||!(o.hero===null||['female','male'].includes(o.hero))||!['system','full','minimal'].includes(o.motion)||!object(o.owned)||!object(o.stats)||typeof o.collectorGift!=='boolean')fail();
            if(!Object.keys(o.owned).every(kind=>Object.hasOwn(groups,kind)))fail();
            for(const [kind,ids] of Object.entries(groups)) {
                if(!flags(o.owned[kind])||!Object.keys(o.owned[kind]).every(id=>ids.includes(id)))fail();
                const field={outfits:'outfit',pets:'pet',backgrounds:'background',effects:'effect'}[kind];
                if(!ids.includes(o[field])||o.owned[kind][o[field]]!==true)fail();
            }
            const stats=['tutorial','wardrobeBuys','backgroundChanges','bestCascade','gems','alchemyWins','oracleWins','memoryWins','predictions'];
            if(!Object.keys(o.stats).every(k=>stats.includes(k)&&int(o.stats[k])))fail();
        }
        if(s.levelGuides!=null&&(!flags(s.levelGuides)||!Object.keys(s.levelGuides).every(k=>['memory','oracle','alchemy'].includes(k))))fail();
        if(s.journeyVersion===2&&s.campaignVersion!==1)fail();
        if(s.campaignVersion!=null&&(s.campaignVersion!==1||s.lvStars.length!==360||!int(s.campaignMode,2)||!int(s.campaignChapter,11)))fail();
        if(s.pathRewards!=null&&(!flags(s.pathRewards)||!Object.keys(s.pathRewards).every(k=>/^(?:[0-9]|1[01]):[012]$/.test(k))))fail();
        const fields = ['created','sign','birth','dust','inv','skins','skin','lvOpen','lvStars','ach','stats','horoUsed','daily','preds','predDay','predSign','wheelBonus','traits','calStart','calLast','calTaken','journeyVersion','journal','omens','endless','loginStreak','loginLast','ritual','frag','stars','observatory','levelGuides','campaignVersion','campaignMode','campaignChapter','pathRewards'];
        const save = {};
        fields.forEach(k => { if (Object.hasOwn(s,k)) save[k] = s[k]; });
        for (const k of ['frag','stars']) if (save[k] != null && (!Array.isArray(save[k]) || save[k].length > 108 || !save[k].every(n => int(n)))) fail();
        return save;
    }
    const SaveFiles = { parse };
    root.SaveFiles = SaveFiles;
    if (typeof module !== 'undefined') module.exports = SaveFiles;
})(typeof window === 'undefined' ? globalThis : window);
