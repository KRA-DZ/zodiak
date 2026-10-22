/* Обсерватория, гардероб и единая выдача косметических наград. */
(function(root) {
    'use strict';
    const Economy=root.Economy||(typeof require==='function'?require('./economy.js'):null);
    const catalog = {
        outfits: [
            {id:'apprentice',name:'Ученик звёзд',price:0,art:[0,1],desc:'Лавандовая мантия и книга тайн'},
            {id:'astral',name:'Звёздный чародей',price:180,art:[2,3],desc:'Мантия, волшебный колпак и звёздная палочка'},
            {id:'moon',name:'Хранитель Луны',price:null,art:[4,5],desc:'Лунная корона, светлый наряд и скипетр',unlock:'Трофей «Первая книга»'},
            {id:'forest',name:'Лесной волшебник',price:300,art:[6,7],desc:'Изумрудная мантия с капюшоном и лесной посох'}
        ],
        pets: [
            {id:'none',name:'Без спутника',price:0},
            {id:'cat',name:'Кот Сумрак',price:120,art:8,desc:'Верный хранитель маленьких тайн'},
            {id:'owl',name:'Сова Селена',price:null,art:9,desc:'Мудрая спутница звёздного пути',unlock:'Трофей «Первая книга»'},
            {id:'dog',name:'Корги Лучик',price:180,art:10,desc:'Маленький источник большого тепла'},
            {id:'dragon',name:'Дракончик Астра',price:null,art:11,desc:'Хранитель всего зодиакального круга',unlock:'Трофей «Коллекционер» или «За горизонтом»'}
        ],
        backgrounds: [
            {id:'original',name:'Звёздный берег',price:0,desc:'Ваше первое небо',image:'fon.png'},
            {id:'garden',name:'Лунный сад',price:240,desc:'Тихое озеро и цветущая обсерватория',image:'assets/moon-garden.png'},
            {id:'candles',name:'Комната предсказаний',price:160,desc:'Тёплое сияние свечей и старинных тайн',image:'table.jpg'}
        ],
        effects: [
            {id:'starlight',name:'Звёздные искры',price:0,desc:'Мягкое золотое мерцание'},
            {id:'aurora',name:'Северное сияние',price:140,desc:'Бирюзовое свечение совпадений'},
            {id:'petals',name:'Лунные лепестки',price:200,desc:'Розовые цветочные искорки'},
            {id:'comets',name:'Кометный след',price:null,desc:'Холодное сияние и летящие звёзды',unlock:'Трофей «Звёздная лавина»'}
        ],
        backs: [
            {id:'moonlace',name:'Лунное кружево',price:180,desc:'Серебряные узоры на ночном бархате'},
            {id:'roseglass',name:'Розовый кварц',price:null,desc:'Розовое стекло и тонкие золотые линии',unlock:'Трофей «Первый урок»'}
        ]
    };
    catalog.outfits.push(...Economy.additions.outfits);
    catalog.pets.push(...Economy.additions.pets);
    for(const kind of ['outfits','pets'])for(const d of catalog[kind]){
        if(['moon','owl','dragon'].includes(d.id)){d.rarity='unique';d.price=null;}
        else if(!['apprentice','none'].includes(d.id)&&!d.case){d.case=true;d.rarity=d.id==='forest'?'epic':d.id==='astral'||d.id==='dog'?'rare':'common';d.price=null;}
        else if(!d.rarity)d.rarity='common';
    }
    const names={cases:'Ларцы',outfits:'Образы',pets:'Питомцы',backgrounds:'Фоны',effects:'Эффекты',backs:'Рубашки'};
    const statKeys=['tutorial','wardrobeBuys','backgroundChanges','bestCascade','gems','alchemyWins','oracleWins','memoryWins','predictions'];
    let ZM, hooks={}, recentWin=false;
    function hydrate(save) {
        const s=save.observatory && typeof save.observatory==='object' && !Array.isArray(save.observatory)?save.observatory:{};
        const defaults={outfits:'apprentice',pets:'none',backgrounds:'original',effects:'starlight'};
        s.version=1;
        if(!['female','male'].includes(s.hero))s.hero=null;
        if(!['system','full','minimal'].includes(s.motion))s.motion='system';
        s.owned=s.owned&&typeof s.owned==='object'&&!Array.isArray(s.owned)?s.owned:{};
        for(const [kind,free] of Object.entries(defaults)){
            const old=s.owned[kind]||{};
            s.owned[kind]=Object.fromEntries(catalog[kind].filter(d=>d.id===free||old[d.id]===true).map(d=>[d.id,true]));
            const field={outfits:'outfit',pets:'pet',backgrounds:'background',effects:'effect'}[kind];
            if(!s.owned[kind][s[field]])s[field]=free;
        }
        const oldStats=s.stats||{};s.stats={};
        statKeys.forEach(k=>s.stats[k]=Number.isSafeInteger(oldStats[k])&&oldStats[k]>=0?oldStats[k]:0);
        s.stats.predictions=Math.max(s.stats.predictions,(save.journal||[]).length);
        s.collectorGift=!!s.collectorGift;
        Economy.counters(s);
        const look=catalog.outfits.find(d=>d.id===s.outfit);if(look?.hero&&look.hero!==s.hero)s.outfit='apprentice';
        save.observatory=s;
        return s;
    }
    function state(){return ZM.save.observatory || hydrate(ZM.save);}
    function definition(kind,id){return catalog[kind]?.find(d=>d.id===id);}
    function owned(kind,id){return kind==='backs'?!!ZM.save.skins[id]:!!state().owned[kind]?.[id];}
    function reducedMotion(){const m=ZM?.save.observatory?.motion||'system';return m==='minimal'||(m==='system'&&root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);}
    function sprite(index,label,extra=''){
        const row=Math.floor(index/4),col=index%4,heights=[398,366,322],starts=[0,398,764];
        const h=heights[row],y=starts[row]/(1086-h)*100;
        return '<span class="figure-art '+extra+'" role="img" aria-label="'+label+'" style="--art-x:'+(col/3*100)+'%;--art-y:'+y+'%;--art-size:'+(1086/h*100)+'%;--art-ratio:362/'+h+'"></span>';
    }
    function figure(d,hero,extra=''){
        if(d.image)return '<span class="figure-art sheet-art '+extra+'" role="img" aria-label="'+d.name+'" style="--sheet:url('+d.image+');--sheet-size:'+d.columns*100+'% '+d.rows*100+'%;--sheet-x:'+(d.cell%d.columns)/(d.columns-1)*100+'%;--sheet-y:'+Math.floor(d.cell/d.columns)/(d.rows-1)*100+'%"></span>';
        return sprite(Array.isArray(d.art)?d.art[hero==='male'?1:0]:d.art,d.name,extra);
    }
    function portrait(s){
        const look=definition('outfits',s.outfit),pet=definition('pets',s.pet);
        return '<div class="observatory-display'+(recentWin?' celebrating':'')+'"><div class="figure-platform"></div>'+figure(look,s.hero,'hero-figure')+(pet.id!=='none'?figure(pet,s.hero,'pet-figure'):'')+'</div>';
    }
    function achievementArt(id,done){
        const types={master:7,speed:8,immortal:6,seven_visits:6,collector:0,first_book:0,perfect_book:0,archive12:1,four_topics:3,dresser:4,new_sky:6,familiar:5,endless10:8,endless25:8,endless50:8,cascade3:7,cascade5:7,alchemy10:7,oracle10:1,tutorial:0};
        return '<span class="achievement-medallion'+(done?' earned':'')+'"><span class="mystic-icon" style="--icon-x:'+((types[id]??2)%3*50)+'%;--icon-y:'+Math.floor((types[id]??2)/3)*50+'%" aria-hidden="true"></span><span class="medallion-state">'+(done?'✦':'◇')+'</span></span>';
    }
    function render(){
        if(!ZM)return;
        const s=state(),host=document.getElementById('observatoryHost');
        if(host){
            host.innerHTML='<div class="observatory-top"><span class="eyebrow">ЛИЧНАЯ ОБСЕРВАТОРИЯ</span><button class="observatory-help" id="editHero" aria-label="Выбрать героя">✎</button></div>'+portrait(s)+'<div class="observatory-caption"><b>'+(s.hero?'Ваш хранитель созвездий':'Кто будет хранить ваше небо?')+'</b><span>'+(!s.hero?'Выберите героя — его можно бесплатно изменить позже':definition('outfits',s.outfit).name+(s.pet!=='none'?' · '+definition('pets',s.pet).name:''))+'</span><small class="observatory-progress">'+(ZM.save.sign==null?'Ваш путь начинается':ZM.SIGNS[ZM.save.sign].name+' · '+ZM.save.lvStars.reduce((a,b)=>a+b,0)+' звёзд')+'</small></div><button class="btn primary" id="openWardrobe">'+(s.hero?'Гардероб и спутники':'Выбрать героя')+'</button>';
            document.getElementById('editHero').onclick=()=>openWardrobe('cases');
            document.getElementById('openWardrobe').onclick=()=>openWardrobe('cases');
            if(document.getElementById('s_hub')?.classList.contains('active'))recentWin=false;
        }
        const setup=document.getElementById('setupHero');
        if(setup){
            setup.innerHTML='<div class="lbl">Ваш герой — меняется бесплатно</div><div class="setup-heroes">'+['female','male'].map((hero,i)=>'<button type="button" class="setup-hero'+((s.hero||'female')===hero?' selected':'')+'" data-hero="'+hero+'">'+sprite(i,hero==='female'?'Волшебница':'Волшебник')+'<span>'+(hero==='female'?'Волшебница':'Волшебник')+'</span></button>').join('')+'</div>';
            setup.querySelectorAll('[data-hero]').forEach(b=>b.onclick=()=>setHero(b.dataset.hero));
        }
    }
    function applyPreferences(){
        const s=state();document.body.dataset.effect=s.effect;document.body.dataset.motion=reducedMotion()?'minimal':'full';document.body.dataset.scene=s.background;
        document.body.style.setProperty('--chosen-background','url("'+backgroundImage(false)+'")');
        render();
    }
    function backgroundImage(portrait=false){const s=state();return s.background==='original'?(portrait?'fonvert.png':'fon.png'):definition('backgrounds',s.background).image;}
    function setHero(hero){if(!['female','male'].includes(hero))return false;state().hero=hero;const look=definition('outfits',state().outfit);if(look.hero&&look.hero!==hero)state().outfit='apprentice';ZM.persist();render();return true;}
    function equipped(kind,id){const s=state();return kind==='backs'?ZM.save.skin===id:s[{outfits:'outfit',pets:'pet',backgrounds:'background',effects:'effect'}[kind]]===id;}
    function equip(kind,id){
        if(!definition(kind,id)||!owned(kind,id))return false;
        if(kind==='outfits'&&definition(kind,id).hero&&definition(kind,id).hero!==state().hero)return false;
        const s=state(),before=s.background;
        if(kind==='backs'){ZM.save.skin=id;hooks.applySkin?.();}
        else s[{outfits:'outfit',pets:'pet',backgrounds:'background',effects:'effect'}[kind]]=id;
        if(kind==='backgrounds'&&before!==id){if(id!=='original')s.stats.backgroundChanges++;hooks.background?.();}
        ZM.persist();applyPreferences();check();return true;
    }
    function buy(kind,id){
        const d=definition(kind,id);if(!d)return false;
        if(['outfits','pets'].includes(kind))return owned(kind,id)?equip(kind,id):false;
        if(owned(kind,id))return equip(kind,id);
        if(d.price==null||ZM.save.dust<d.price)return false;
        ZM.save.dust-=d.price;
        if(kind==='backs')ZM.save.skins[id]=true;else state().owned[kind][id]=true;
        state().stats.wardrobeBuys++;ZM.persist();ZM.renderDust();equip(kind,id);return true;
    }
    function describeReward(r){
        if(!r)return '';
        const lines=[];if(r.dust)lines.push(r.dust+' ★');if(r.omens)lines.push(r.omens+' '+ZM.plural(r.omens,['печать','печати','печатей'])+' Оракула');
        for(const [id,count] of Object.entries(r.inv||{}))lines.push(count+'× '+({hint:'подсказка',freeze:'стужа',map:'астро-карта'}[id]||id));
        if(r.skin)lines.push('рубашка «'+(definition('backs',r.skin)?.name||r.skin)+'»');
        for(const c of r.cosmetics||[])lines.push(definition(c.kind,c.id)?.name||'косметическая награда');
        return lines.join(' · ');
    }
    function giveReward(r){
        const lines=[];if(!r)return lines;
        if(r.dust){ZM.save.dust+=r.dust;lines.push('+'+r.dust+' ★');}
        if(r.omens){ZM.save.omens+=r.omens;lines.push('+'+r.omens+' '+ZM.plural(r.omens,['печать','печати','печатей'])+' Оракула');}
        for(const [key,n] of Object.entries(r.inv||{})){ZM.save.inv[key]+=n;lines.push(n+'× '+({hint:'подсказка',freeze:'стужа',map:'астро-карта'}[key]));}
        const gifts=[...(r.cosmetics||[]),...(r.skin?[{kind:'backs',id:r.skin}]:[])];
        for(const gift of gifts){
            const d=definition(gift.kind,gift.id);if(!d)continue;
            if(owned(gift.kind,gift.id)){const refund=d.case?Math.floor(Economy.cases[gift.kind].price*Economy.rarities[d.rarity].refund):5;ZM.save.dust+=refund;lines.push('Повтор «'+d.name+'»: +'+refund+' ★');}
            else{if(gift.kind==='backs')ZM.save.skins[gift.id]=true;else state().owned[gift.kind][gift.id]=true;lines.push(d.name);}
        }
        ZM.persist();ZM.renderDust();render();return lines;
    }
    function progressOf(def){try{return def.progress?def.progress():'';}catch(_){return '';}}
    function check(){
        if(!hooks.grantAch)return;
        for(const d of ZM.ACHDEFS){if(ZM.save.ach[d.id])continue;try{if(d.test())hooks.grantAch(d);}catch(_){}}
        const counter=document.getElementById('stAch');if(counter)counter.textContent=ZM.ACHDEFS.filter(d=>ZM.save.ach[d.id]).length+'/'+ZM.ACHDEFS.length;
    }
    function record(event,payload={}){
        const s=state();
        if(event==='tutorial')s.stats.tutorial=1;
        if(event==='purchase')s.stats.wardrobeBuys++;
        if(event==='prediction')s.stats.predictions++;
        if(event==='win'){s.stats[({memory:'memoryWins',oracle:'oracleWins',alchemy:'alchemyWins'})[payload.mode]||'memoryWins']++;recentWin=true;}
        if(event==='cascade'){s.stats.bestCascade=Math.max(s.stats.bestCascade,payload.chain||0);s.stats.gems+=payload.count||0;}
        ZM.persist();check();
    }
    function productArt(kind,d){
        const s=state();if(kind==='outfits')return figure(d,s.hero,'product-art');
        if(kind==='pets')return d.id==='none'?'<span class="empty-pet">✧</span>':figure(d,s.hero,'product-art');
        if(kind==='backgrounds')return '<span class="scene-preview" style="background-image:url(\''+d.image+'\')"></span>';
        if(kind==='effects')return '<span class="effect-preview preview-'+d.id+'" aria-hidden="true">✦ <i>✧</i> ✦</span>';
        return '<span class="back-preview preview-'+d.id+'" aria-hidden="true">☾<small>✦</small></span>';
    }
    function rewardArt(r){
        const gifts=[...(r?.cosmetics||[]),...(r?.skin?[{kind:'backs',id:r.skin}]:[])].slice(0,2);
        return gifts.length?'<div class="reward-showcase">'+gifts.map(g=>{const d=definition(g.kind,g.id);return d?'<div>'+productArt(g.kind,d)+'<b>'+d.name+'</b></div>':'';}).join('')+'</div>':'';
    }
    function caseMarkup(){
        const hero=state().hero||'female';
        return '<div class="case-intro">Ларцы открываются только за заработанную звёздную пыль. Каждый содержит одну вещь. Наряды подбираются для выбранного героя.</div><div class="case-grid">'+Object.entries(Economy.cases).map(([kind,box])=>{
            const c=state().cases[kind],pool=Economy.pool(catalog,kind,hero);
            return '<article class="case-card"><div class="case-orb" aria-hidden="true">'+(kind==='outfits'?'✧':'☾')+'</div><h3>'+box.name+'</h3><p>'+pool.length+' предметов · '+(kind==='outfits'?(hero==='male'?'для Волшебника':'для Волшебницы'):'для обоих героев')+'</p><button class="btn primary" data-case="'+kind+'" '+(ZM.save.dust<box.price?'disabled':'')+'>Открыть · '+box.price+' ★</button><small>Редкий или лучше: не позднее '+(8-c.rare)+' открытий<br>Эпический или лучше: '+(20-c.epic)+' · легендарный: '+(60-c.legend)+'</small><details><summary>Содержимое ларца</summary><div class="case-contents">'+pool.map(d=>'<div style="--rarity:'+Economy.rarities[d.rarity].color+'">'+productArt(kind,d)+'<span>'+d.name+'</span></div>').join('')+'</div></details></article>';
        }).join('')+'</div><div class="case-odds"><b>Базовые шансы на редкость</b><div>'+Object.entries(Economy.rarities).filter(([k])=>k!=='unique').map(([key,r])=>'<span style="--rarity:'+r.color+'">'+r.name+' · '+r.chance+'%<small>Повтор: возврат '+Math.round(r.refund*100)+'% цены ларца</small></span>').join('')+'</div><p>Внутри редкости все вещи равновероятны. На 8-м открытии без редкого предмета редкость повышается минимум до редкой, на 20-м без эпического — минимум до эпической, на 60-м без легендарного — до легендарной. Счётчики отдельные для двух ларцов, общие для героев. Получение более высокой редкости сбрасывает соответствующие счётчики. Шансы выше указаны без гарантий. Возврат округляется вниз. Уникальные вещи за достижения в ларцы не входят.</p></div>';
    }
    function openCase(kind){
        if(!state().hero)setHero('female');
        const result=Economy.open(ZM.save,catalog,kind,state().hero);if(!result)return null;
        // Commit currency, ownership and guarantees before showing any animation.
        ZM.persist();ZM.renderDust();render();check();
        const d=definition(kind,result.id),r=Economy.rarities[d.rarity],box=Economy.cases[kind];
        ZM.modalOpen('<h2>'+box.name+'</h2><div class="case-reveal" style="--rarity:'+r.color+'"><div class="case-opening" aria-hidden="true">✦</div><div class="case-prize">'+productArt(kind,d)+'<span class="rarity-badge">'+r.name+'</span><h3>'+d.name+'</h3><p role="status">'+(result.duplicate?'Уже в коллекции · возвращено '+result.refund+' ★ ('+Math.round(r.refund*100)+'%)':'Новый предмет в вашей коллекции')+'</p></div></div><div class="m-actions"><button class="btn primary" id="caseEquip">Применить</button><button class="btn" id="caseAgain" '+(ZM.save.dust<box.price?'disabled':'')+'>Ещё ларец · '+box.price+' ★</button><button class="btn" id="caseBack">К гардеробу</button></div>',{cls:'case-result-modal'});
        document.getElementById('caseEquip').onclick=()=>{equip(kind,d.id);openWardrobe(kind);};
        document.getElementById('caseAgain').onclick=()=>openCase(kind);
        document.getElementById('caseBack').onclick=()=>openWardrobe('cases');return result;
    }
    function openWardrobe(tab='cases'){
        if(!Object.hasOwn(names,tab))tab='cases';
        const s=state(),hero=s.hero||'female';
        const body=tab==='cases'?caseMarkup():'<div class="wardrobe-grid">'+catalog[tab].filter(d=>!d.hero||d.hero===hero).map(d=>{
            const has=owned(tab,d.id),active=equipped(tab,d.id),isCase=d.case,label=active?'Выбрано':has?'Применить':isCase?'Из ларца':d.price==null?d.unlock:d.price+' ★',rarity=d.rarity&&Economy.rarities[d.rarity];
            return '<article class="wardrobe-item'+(active?' equipped':'')+'" '+(rarity?'style="--rarity:'+rarity.color+'"':'')+'>'+productArt(tab,d)+(rarity?'<span class="rarity-badge">'+rarity.name+'</span>':'')+'<b>'+d.name+'</b><p>'+(d.desc||'Без изменений')+'</p><button class="btn'+(active?'':' primary')+'" data-item="'+d.id+'" '+(active||(!has&&(isCase||d.price==null||ZM.save.dust<d.price))?'disabled':'')+'>'+label+'</button></article>';
        }).join('')+'</div>';
        ZM.modalOpen('<h2>Гардероб созвездий</h2><div class="msub">'+ZM.save.dust+' ★ звёздной пыли · коллекция и волшебные ларцы</div><div class="hero-switch" aria-label="Выбор героя">'+['female','male'].map(h=>'<button class="btn'+(hero===h?' primary':'')+'" data-switch-hero="'+h+'">'+(h==='female'?'Волшебница':'Волшебник')+'</button>').join('')+'</div><div class="wardrobe-preview">'+portrait(s)+'</div><div class="wardrobe-tabs">'+Object.keys(names).map(k=>'<button class="btn'+(k===tab?' primary':'')+'" data-tab="'+k+'">'+names[k]+'</button>').join('')+'</div>'+body+'<p class="journey-note">Героя можно менять бесплатно. Общие образы доступны обоим героям; особые наряды отмечены в коллекции выбранного героя. Редкие награды сложных достижений нельзя получить из ларцов.</p><div class="m-actions"><button class="btn primary" data-close>Вернуться к звёздам</button></div>',{cls:'wardrobe-modal'+(tab==='cases'?' wardrobe-cases':'')});
        ZM.qa('[data-switch-hero]').forEach(b=>b.onclick=()=>{setHero(b.dataset.switchHero);openWardrobe(tab);});
        ZM.qa('[data-tab]').forEach(b=>b.onclick=()=>openWardrobe(b.dataset.tab));
        ZM.qa('[data-case]').forEach(b=>b.onclick=()=>openCase(b.dataset.case));
        ZM.qa('[data-item]').forEach(b=>b.onclick=()=>{if(!state().hero)setHero('female');if(buy(tab,b.dataset.item))openWardrobe(tab);else ZM.toast('Предмет пока недоступен',{ic:'i-warn'});});
    }
    function init(zm){
        ZM=zm;hydrate(ZM.save);
        if(!catalog.backs.some(d=>d.id==='classic')) {
            const calendar={dawn:7,moss:14,abyss:28};
            catalog.backs.unshift(...ZM.SKINS.map(d=>({id:d.id,name:d.name,price:d.price,desc:'Рубашка карт для поиска пар и Оракула',unlock:calendar[d.id]?'Календарь · день '+calendar[d.id]:'Трофей «Коллекционер»'})));
        }
        ZM.SKINS.push({id:'moonlace',name:'Лунное кружево',price:180},{id:'roseglass',name:'Розовый кварц',price:null});
        const completed=()=>Array.from({length:12},(_,i)=>ZM.save.lvStars.slice(i*30,i*30+30).every(n=>n>0)).filter(Boolean).length;
        const stat=(k,n)=>()=>state().stats[k]>=n;
        const definitions=[
            ['tutorial','Первый урок','Дочитайте правила и нажмите «Обучение просмотрено»',25,stat('tutorial',1),{inv:{hint:2},skin:'roseglass'}],
            ['first_book','Первая книга','Пройдите все 30 глав одного знака',100,()=>completed()>=1,{cosmetics:[{kind:'outfits',id:'moon'},{kind:'pets',id:'owl'}]}],
            ['dresser','Маленькое преображение','Откройте ларец или купите первое оформление',35,stat('wardrobeBuys',1),{omens:1}],
            ['new_sky','Новое небо','Примените другой фон',25,stat('backgroundChanges',1),{cosmetics:[{kind:'effects',id:'aurora'}]}],
            ['familiar','Добрый спутник','Выберите любого питомца',20,()=>state().pet!=='none',{inv:{hint:2}}],
            ['endless10','За звёздной рекой','Пройдите 10 этапов бесконечного неба',75,()=>ZM.save.endless.best>=10,{omens:2}],
            ['endless25','Дальний свет','Пройдите 25 этапов бесконечного неба',100,()=>ZM.save.endless.best>=25,{skin:'moonlace',inv:{map:1}}],
            ['endless50','За горизонтом','Пройдите 50 этапов бесконечного неба',150,()=>ZM.save.endless.best>=50,{cosmetics:[{kind:'pets',id:'dragon'}]}],
            ['cascade3','Танец созвездий','Запустите каскад из трёх совпадений',40,stat('bestCascade',3),{inv:{hint:2}}],
            ['cascade5','Звёздная лавина','Запустите каскад из пяти совпадений',60,stat('bestCascade',5),{cosmetics:[{kind:'effects',id:'comets'}],omens:1}],
            ['alchemy10','Алхимик','Победите в алхимии 10 раз',80,stat('alchemyWins',10),{inv:{map:1}}],
            ['oracle10','Сквозь завесу','Победите в Оракуле 10 раз',80,stat('oracleWins',10),{inv:{freeze:2}}],
            ['memory25','Хранитель памяти','Победите в поиске пар 25 раз',75,stat('memoryWins',25),{skin:'moonlace'}],
            ['archive12','Архивариус','Откройте 12 платных предсказаний за пыль или печати',60,stat('predictions',12),{omens:2}],
            ['four_topics','Четыре дороги','Сохраните в книге предсказания всех четырёх категорий',40,()=>new Set(ZM.save.journal.map(p=>p.cat)).size>=4,{omens:1}],
            ['seven_visits','Неделя под звёздами','Получайте ежедневный дар 7 дней подряд',60,()=>ZM.save.loginStreak>=7,{cosmetics:[{kind:'effects',id:'petals'}]}],
            ['perfect_book','Тридцать огней','Соберите три звезды во всех главах одного знака',125,()=>Array.from({length:12},(_,i)=>ZM.save.lvStars.slice(i*30,i*30+30).every(n=>n===3)).some(Boolean),{omens:3}]
        ];
        definitions.forEach(([id,name,desc,reward,test,extra])=>ZM.ACHDEFS.push({id,name,desc,reward,test,extra}));
        const metrics={
            tutorial:()=>[state().stats.tutorial,1],first_book:()=>[completed(),1],dresser:()=>[state().stats.wardrobeBuys,1],
            new_sky:()=>[state().stats.backgroundChanges,1],familiar:()=>[state().pet==='none'?0:1,1],
            endless10:()=>[ZM.save.endless.best,10],endless25:()=>[ZM.save.endless.best,25],endless50:()=>[ZM.save.endless.best,50],
            cascade3:()=>[state().stats.bestCascade,3],cascade5:()=>[state().stats.bestCascade,5],alchemy10:()=>[state().stats.alchemyWins,10],
            oracle10:()=>[state().stats.oracleWins,10],memory25:()=>[state().stats.memoryWins,25],archive12:()=>[state().stats.predictions,12],
            four_topics:()=>[new Set(ZM.save.journal.map(p=>p.cat)).size,4],seven_visits:()=>[ZM.save.loginStreak,7],
            perfect_book:()=>[Math.max(...Array.from({length:12},(_,i)=>ZM.save.lvStars.slice(i*30,i*30+30).filter(n=>n===3).length)),30]
        };
        ZM.ACHDEFS.forEach(d=>{if(metrics[d.id])d.progress=()=>{const [n,total]=metrics[d.id]();return Math.min(n,total)+'/'+total;};});
        const collector=ZM.ACHDEFS.find(d=>d.id==='collector');collector.extra={cosmetics:[{kind:'pets',id:'dragon'},{kind:'backgrounds',id:'garden'}]};
        collector.desc='Заполните все 12 книг зодиака: по 30 глав в каждой';

        const gifts={2:{omens:1},3:{inv:{hint:1}},5:{cosmetics:[{kind:'effects',id:'aurora'}]},7:{dust:25},10:{inv:{freeze:1}},12:{skin:'moonlace'},16:{omens:1},18:{inv:{map:1}},21:{dust:35},24:{inv:{hint:2}},28:{skin:'roseglass'},31:{cosmetics:[{kind:'backgrounds',id:'garden'}],omens:2}};
        ZM.CAL.forEach(r=>{r.dust=Math.min(25,5+Math.floor((r.d-1)/7)*5);delete r.extra;if(gifts[r.d])r.extra=gifts[r.d];});
        for(const d of ZM.ACHDEFS)if(Economy.achievementRewards[d.id]!=null)d.reward=Economy.achievementRewards[d.id];
        if(ZM.save.ach.collector&&!state().collectorGift){giveReward(collector.extra);state().collectorGift=true;}
        ZM.persist();
    }
    const Observatory={catalog,statKeys,hydrate,init,connect(h){hooks=h;applyPreferences();check();},state,render,setHero,equip,buy,owned,giveReward,describeReward,rewardArt,record,check,openWardrobe,openCase,backgroundImage,reducedMotion,progressOf,achievementArt};
    root.Observatory=Observatory;
    if(typeof module!=='undefined')module.exports=Observatory;
})(typeof window==='undefined'?globalThis:window);
