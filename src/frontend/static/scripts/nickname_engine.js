/**
 * NicknameEngine — generates realistic email usernames
 * Ported from Python NicknameEngine
 */
const NicknameEngine = (() => {
    // ==================== DATA ====================

    const firstNames = [
        "james","john","robert","michael","david","william","richard","joseph","thomas","charles",
        "christopher","daniel","matthew","anthony","mark","donald","steven","paul","andrew","joshua",
        "kenneth","kevin","brian","george","timothy","ronald","edward","jason","jeffrey","ryan",
        "jacob","gary","nicholas","eric","jonathan","stephen","larry","justin","scott","brandon",
        "benjamin","samuel","raymond","greg","frank","alex","patrick","jack","dennis","jerry",
        "tyler","aaron","jose","adam","nathan","henry","peter","zachary","douglas","harold",
        "kyle","noah","carl","gerald","keith","roger","arthur","terry","sean","austin",
        "christian","albert","joe","ethan","jesse","willie","billy","bruce","ralph","roy",
        "jordan","dylan","eugene","russell","louis","philip","randy","johnny","harry","vincent",
        "bobby","cole","logan","luke","oscar","caleb","mason","hunter","connor","elijah",
        "mary","patricia","jennifer","linda","barbara","elizabeth","susan","jessica","sarah","karen",
        "lisa","nancy","betty","sandra","ashley","dorothy","kimberly","emily","donna","michelle",
        "carol","amanda","melissa","deborah","stephanie","rebecca","sharon","laura","cynthia","kathleen",
        "amy","angela","shirley","anna","brenda","pamela","emma","nicole","helen","samantha",
        "katherine","christine","debra","rachel","carolyn","janet","catherine","maria","heather","diane",
        "ruth","julie","olivia","joyce","virginia","victoria","kelly","lauren","christina","joan",
        "evelyn","judith","megan","andrea","cheryl","hannah","jacqueline","martha","gloria","teresa",
        "ann","sara","madison","frances","kathryn","janice","jean","abigail","alice","julia",
        "grace","amber","denise","ruby","diana","natalie","sophia","alexis","brittany","charlotte",
        "vanessa","tiffany","kayla","hailey","jasmine","zoey","chloe","riley","leah","brooklyn",
    ];

    const lastNames = [
        "smith","johnson","williams","brown","jones","garcia","miller","davis","rodriguez","martinez",
        "hernandez","lopez","gonzalez","wilson","anderson","thomas","taylor","moore","jackson","martin",
        "lee","perez","thompson","white","harris","sanchez","clark","ramirez","lewis","robinson",
        "walker","young","allen","king","wright","scott","torres","nguyen","hill","flores",
        "green","adams","nelson","baker","hall","rivera","campbell","mitchell","carter","roberts",
        "gomez","phillips","evans","turner","diaz","parker","cruz","edwards","collins","reyes",
        "stewart","morris","morales","murphy","cook","rogers","gutierrez","ortiz","morgan","cooper",
        "peterson","bailey","reed","kelly","howard","ramos","kim","cox","ward","richardson",
        "watson","brooks","chavez","wood","james","bennett","gray","mendoza","ruiz","hughes",
        "price","alvarez","castillo","sanders","patel","myers","long","ross","foster","jimenez",
    ];

    const adjectives = [
        "big","little","old","young","hot","cool","cold","wild","crazy","lazy","happy","sad",
        "mad","bad","rad","sick","epic","real","true","pure","raw","deep","fast","slow",
        "loud","dark","bright","sweet","fresh","crispy","salty","spicy","funky","chill","slick",
        "smooth","bold","brave","fierce","gentle","frosty","icy","sunny","stormy","cloudy","misty",
        "golden","silver","purple","crimson","royal","rusty","amber","ivory","neon","shiny",
        "lucky","fancy","sneaky","tricky","witty","clever","edgy","moody","jolly","sassy",
        "goofy","silly","wacky","fuzzy","tiny","huge","giant","mega","super","hyper",
        "electric","cosmic","stellar","atomic","awesome","great","grand","mighty","strong","solid",
        "perfect","elite","rogue","rebel","retro","vintage","classic","modern","digital","quiet",
    ];

    const nouns = [
        "wolf","tiger","bear","eagle","hawk","shark","fox","lion","dragon","cobra",
        "viper","falcon","raven","panther","mustang","bull","ram","goat","horse","spider",
        "leopard","jaguar","puma","lynx","coyote","badger","otter","moose","elk","stag",
        "penguin","owl","osprey","crow","swan","dove","whale","dolphin","phoenix","griffin",
        "star","nova","nebula","comet","meteor","storm","thunder","lightning","blizzard","fire",
        "ice","flame","blaze","ember","frost","glacier","forest","ocean","river","mountain",
        "cube","sphere","crystal","hammer","blade","sword","shield","crown","rocket","arrow",
        "tower","castle","fort","rock","stone","steel","iron","gold","diamond","jade",
        "pearl","king","queen","boss","chief","captain","master","ghost","shadow","phantom",
        "ninja","knight","wizard","pixel","byte","matrix","laser","cyber","turbo","ace",
    ];

    const actionWords = [
        "burn","crush","blast","smash","dash","flash","grind","push","kick","slam",
        "rip","break","shake","flip","spin","roll","drop","pop","bang","boom",
        "rider","runner","walker","killer","chiller","slap","hack","slash",
        "launch","boost","charge","strike","surge","rush","creep","sneak","prowl",
        "roar","howl","spark","flare","beam","builder","maker","breaker","finder","seeker",
    ];

    const interestWords = [
        "golf","surf","skate","bike","ride","race","drift","game","play","cook",
        "fish","hunt","camp","hike","climb","swim","dive","run","lift","box",
        "tech","code","hack","build","art","draw","paint","photo","film","music",
        "dance","rock","punk","jazz","yoga","gym","soccer","football","baseball",
        "hockey","tennis","gaming","streaming","travel","explore","garden","craft","read","write",
    ];

    const slangWords = [
        "noob","pro","leet","yolo","swag","dank","lit","savage","goat","based",
        "chad","sigma","alpha","omega","vibe","flex","drip","fire","gg","ez",
        "bruh","fam","slay","bussin","stan","cringe","stonks","mood","bet","valid",
    ];

    const prefixFragments = [
        "mc","mac","el","the","mr","ms","sir","doc","dj","lil",
        "big","ol","young","og","don","von","da","de","la","le",
        "king","lord","duke","cap","boss","papa",
    ];

    const dotPrefixes = [
        "sr","mr","dr","el","la","le","de","da","do","di",
        "mc","st","dj","lil","big","ol","don","sir","prof",
        "the","my","its","im","ur","no","oh","hey","yo",
        "real","just","only","not","so","too","very",
        "king","lord","duke","cap","boss","chief","papa",
        "baby","lil","young","old","bad","mad","sad",
    ];

    const dotWords = [
        "wolf","tiger","fire","ice","storm","shadow","flame","ghost","blade","stone",
        "steel","frost","raven","eagle","cobra","viper","falcon","panther","bull",
        "king","duke","boss","chief","knight","prince","lion","smooth","slick","chill",
        "cool","wild","dark","real","savage","beast","phantom","ninja","rocket","thunder",
        "blaze","flash","spark","pulse","sugar","honey","spice","juice","sauce",
        "smith","jones","brown","garcia","miller","davis","torres","vargas","silva","costa",
        "fox","hawk","bear","drake","crow","dove","swan","nova","star","moon",
        "sun","sky","rain","snow","cash","gold","diamond","ruby","jade","pearl",
        "phoenix","dragon","griffin","titan","maverick","rebel","rogue","outlaw",
        "dream","vision","spirit","soul","mind","heart","zen","pixel","cyber","glitch",
        "karma","destiny","fate","fortune","legacy","legend","waves","vibes","flow","drift",
    ];

    const suffixWords = [
        "man","boy","kid","guy","bro","dude","ster","ator","inator","zilla",
        "meister","o","ito","owski","ski","ton","son","berg","master","lord",
        "king","boss","matic","tron","bot","ian","ist",
    ];

    const syllables = [
        "ba","be","bi","bo","bu","ca","ce","ci","co","cu",
        "da","de","di","do","du","fa","fe","fi","fo","fu",
        "ga","ge","gi","go","gu","ha","he","hi","ho","hu",
        "ja","je","ji","jo","ju","ka","ke","ki","ko","ku",
        "la","le","li","lo","lu","ma","me","mi","mo","mu",
        "na","ne","ni","no","nu","pa","pe","pi","po","pu",
        "ra","re","ri","ro","ru","sa","se","si","so","su",
        "ta","te","ti","to","tu","va","ve","vi","vo","vu",
        "wa","we","wi","wo","za","ze","zi","zo","zu",
        "cha","che","chi","cho","sha","she","shi","sho",
        "bla","ble","bro","bru","cra","cre","dra","dre",
        "fla","flo","fra","fre","gra","gre","gro",
        "pra","pre","pro","sta","ste","sto","stra","stre",
        "tra","tre","tri","tro",
    ];

    // ==================== HELPERS ====================

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function randomDigits(min, max) {
        if (min <= 0 && Math.random() < 0.3) return "";
        const count = min + Math.floor(Math.random() * (max - min + 1));
        if (count <= 0) return "";
        let s = "";
        for (let i = 0; i < count; i++) s += Math.floor(Math.random() * 10);
        return s;
    }

    function randomLetter() {
        return String.fromCharCode(97 + Math.floor(Math.random() * 26));
    }

    function nonsenseWord(syllableCount) {
        let w = "";
        for (let i = 0; i < syllableCount; i++) w += pick(syllables);
        return w;
    }

    // ==================== PATTERNS ====================

    // dave7254, sarah92, mike381
    function patFirstnameNumbers() {
        return pick(firstNames) + randomDigits(1, 4);
    }

    // adamjackson49, sarahwilson, mikebrown3
    function patFirstnameLastname() {
        let r = pick(firstNames) + pick(lastNames);
        if (Math.random() < 0.5) r += randomDigits(1, 3);
        return r;
    }

    // hotcube1, coolwolf, darkstorm7
    function patAdjectiveNoun() {
        let r = pick(adjectives) + pick(nouns);
        if (Math.random() < 0.5) r += randomDigits(1, 2);
        return r;
    }

    // gremlin47, tiger321
    function patNounNumbers() {
        return pick([...nouns, ...adjectives]) + randomDigits(1, 4);
    }

    // bananavampire, coolcontact5
    function patCompoundWord() {
        const lists = [adjectives, nouns, actionWords, interestWords];
        let r = pick(pick(lists)) + pick(pick(lists));
        if (Math.random() < 0.4) r += randomDigits(1, 3);
        return r;
    }

    // jordan_love7, cool_dragon, fast_runner
    function patUnderscorePhrase() {
        const patterns = [
            () => pick(firstNames) + "_" + pick([...nouns, ...adjectives]) + (Math.random() < 0.4 ? randomDigits(1, 2) : ""),
            () => pick(adjectives) + "_" + pick(firstNames) + (Math.random() < 0.4 ? randomDigits(1, 2) : ""),
            () => pick(firstNames) + "_" + pick(interestWords) + (Math.random() < 0.3 ? "_" + pick(firstNames) : randomDigits(1, 2)),
            () => pick(nouns) + "_" + pick(nouns),
            () => pick(adjectives) + "_" + pick(nouns) + (Math.random() < 0.4 ? randomDigits(1, 2) : ""),
            () => pick(firstNames) + "_" + pick(lastNames) + (Math.random() < 0.3 ? randomDigits(1, 2) : ""),
        ];
        return pick(patterns)();
    }

    // grantg7, georgejr718, martynh
    function patNameInitialNumbers() {
        let r = pick(firstNames) + randomLetter();
        if (Math.random() < 0.6) r += randomDigits(1, 3);
        return r;
    }

    // osheeki, gamahra
    function patGibberishWord() {
        let word;
        const rand = Math.random();
        if (rand < 0.6) {
            word = nonsenseWord(2 + Math.floor(Math.random() * 3));
        } else if (rand < 0.8) {
            let w = "";
            const len = 4 + Math.floor(Math.random() * 4);
            for (let i = 0; i < len; i++) w += randomLetter();
            word = w;
        } else {
            word = nonsenseWord(2);
            word += word.charAt(word.length - 1);
        }
        if (Math.random() < 0.25) word += randomDigits(1, 3);
        return word;
    }

    // mac_daddy34, sir_wolf2
    function patPrefixName() {
        const prefix = pick(prefixFragments);
        const name = pick([...firstNames, ...nouns]);
        const sep = Math.random() < 0.5 ? "_" : "";
        let r = prefix + sep + name;
        if (Math.random() < 0.5) r += randomDigits(1, 2);
        return r;
    }

    // kelvanator, johnster
    function patNameSuffix() {
        let r = pick(firstNames) + pick(suffixWords);
        if (Math.random() < 0.3) r += randomDigits(1, 2);
        return r;
    }

    // gatorgolf69, wolfhunt24
    function patInterestNameNumber() {
        let r = pick([...interestWords, ...nouns]) + pick([...interestWords, ...nouns, ...actionWords]);
        if (Math.random() < 0.6) r += randomDigits(1, 2);
        return r;
    }

    // hunterwilson, jessstone42
    function patTwoWordsFused() {
        let r = pick(firstNames) + pick([...lastNames, ...nouns, ...actionWords]);
        if (Math.random() < 0.4) r += randomDigits(1, 4);
        return r;
    }

    // dankwolf, litfire22
    function patSlangCombo() {
        let r = pick([...slangWords, ...adjectives]) + pick([...nouns, ...actionWords, ...interestWords]);
        if (r.endsWith("s") && Math.random() < 0.3) r = r.slice(0, -1) + "z";
        if (Math.random() < 0.4) r += randomDigits(1, 2);
        return r;
    }

    // dimeburn, billyrock123
    function patNameAction() {
        let r = pick(firstNames) + pick([...actionWords, ...interestWords]);
        if (Math.random() < 0.4) r += randomDigits(1, 3);
        return r;
    }

    // sr.gravata, j.smith, alex.smith, cool.tiger
    function patDotSeparated() {
        const rand = Math.random();
        let r;
        if (rand < 0.35) {
            // firstname.lastname — alex.smith
            r = pick(firstNames) + "." + pick(lastNames);
        } else if (rand < 0.55) {
            // prefix.word — sr.wolf, mr.fire
            r = pick(dotPrefixes) + "." + pick(dotWords);
        } else if (rand < 0.70) {
            // initial.lastname — j.smith
            r = randomLetter() + "." + pick([...lastNames, ...dotWords]);
        } else if (rand < 0.82) {
            // adjective.noun — cool.tiger
            r = pick(adjectives) + "." + pick(nouns);
        } else if (rand < 0.92) {
            // word.word+numbers — real.king, big.boss99
            r = pick([...dotPrefixes, ...adjectives.slice(0, 15)]) + "." + pick([...dotWords, ...nouns.slice(0, 20)]);
            if (Math.random() < 0.3) r += randomDigits(1, 3);
        } else {
            // firstname.lastname+numbers
            r = pick(firstNames) + "." + pick(lastNames) + randomDigits(1, 3);
        }
        return r;
    }

    // de18285, ab12345, jk77291
    function patShortPrefixNumbers() {
        const rand = Math.random();
        let prefix, nums;
        if (rand < 0.50) {
            prefix = randomLetter() + randomLetter();
            nums = randomDigits(4, 6);
        } else if (rand < 0.75) {
            prefix = randomLetter() + randomLetter() + randomLetter();
            nums = randomDigits(3, 5);
        } else if (rand < 0.90) {
            prefix = randomLetter() + randomLetter();
            nums = randomDigits(2, 3);
        } else {
            prefix = randomLetter();
            nums = randomDigits(5, 7);
        }
        return prefix + nums;
    }

    // south12345, jbone01233
    function patLongNumberSuffix() {
        let name = pick([...firstNames, ...nouns, ...adjectives]);
        if (name.length < 6 && Math.random() < 0.3) {
            name += pick([...nouns, ...adjectives, ...actionWords]);
        }
        return name + randomDigits(3, 6);
    }

    // b5b5s, fr2a3nk456
    function patNumbersMixed() {
        const patterns = [
            () => randomLetter() + randomDigits(1, 1) + nonsenseWord(1) + randomDigits(0, 3),
            () => Math.floor(Math.random() * 10) + nonsenseWord(2),
            () => nonsenseWord(1) + randomDigits(1, 2) + nonsenseWord(1) + randomDigits(0, 3),
        ];
        return pick(patterns)();
    }

    // ==================== PATTERN TABLE ====================

    // Weighted patterns — higher weight = more likely
    // Email-realistic patterns are weighted higher
    const patterns = [
        [patFirstnameNumbers,      14],   // dave7254
        [patFirstnameLastname,     12],   // adamjackson49
        [patDotSeparated,          12],   // alex.smith, j.smith
        [patUnderscorePhrase,      10],   // jordan_love7
        [patNameInitialNumbers,     9],   // grantg7
        [patTwoWordsFused,          8],   // hunterwilson
        [patShortPrefixNumbers,     7],   // de18285
        [patLongNumberSuffix,       6],   // south12345
        [patAdjectiveNoun,          5],   // coolwolf
        [patNounNumbers,            5],   // tiger321
        [patCompoundWord,           4],   // coolcontact5
        [patNameAction,             4],   // billyrock123
        [patPrefixName,             3],   // sir_wolf2
        [patNameSuffix,             3],   // johnster
        [patInterestNameNumber,     3],   // wolfhunt24
        [patGibberishWord,          3],   // osheeki
        [patSlangCombo,             2],   // dankwolf
        [patNumbersMixed,           2],   // b5ba23
    ];

    // Build cumulative weights
    const totalWeight = patterns.reduce((sum, p) => sum + p[1], 0);

    // ==================== PUBLIC API ====================

    function generate() {
        // Pick a pattern using weighted random selection
        let r = Math.random() * totalWeight;
        let fn = patterns[0][0];
        for (const [func, weight] of patterns) {
            r -= weight;
            if (r <= 0) { fn = func; break; }
        }

        // Generate, clean, validate
        for (let attempt = 0; attempt < 20; attempt++) {
            let name = fn().toLowerCase();
            // Clean: only a-z, 0-9, dots, underscores
            name = name.replace(/[^a-z0-9._]/g, "");
            // No leading/trailing dots or underscores
            name = name.replace(/^[._]+|[._]+$/g, "");
            // No consecutive dots
            name = name.replace(/\.{2,}/g, ".");
            // Length check (3-20 for email local part)
            if (name.length >= 3 && name.length <= 20) {
                return name;
            }
            // If too long, truncate intelligently
            if (name.length > 20) {
                name = name.substring(0, 20).replace(/[._]+$/g, "");
                if (name.length >= 3) return name;
            }
            // Try another pattern on failure
            r = Math.random() * totalWeight;
            for (const [func, weight] of patterns) {
                r -= weight;
                if (r <= 0) { fn = func; break; }
            }
        }
        // Fallback: simple firstname + digits
        return pick(firstNames) + randomDigits(2, 4);
    }

    return { generate };
})();
