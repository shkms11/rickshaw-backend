const transliteration = new Map<string, string>([
    ["অ", "o"], ["আ", "a"], ["ই", "i"], ["ঈ", "i"], ["উ", "u"], ["ঊ", "u"],
    ["ঋ", "ri"], ["এ", "e"], ["ঐ", "oi"], ["ও", "o"], ["ঔ", "ou"],
    ["ক", "k"], ["খ", "kh"], ["গ", "g"], ["ঘ", "gh"], ["ঙ", "ng"],
    ["চ", "ch"], ["ছ", "chh"], ["জ", "j"], ["ঝ", "jh"], ["ঞ", "ny"],
    ["ট", "t"], ["ঠ", "th"], ["ড", "d"], ["ঢ", "dh"], ["ণ", "n"],
    ["ত", "t"], ["থ", "th"], ["দ", "d"], ["ধ", "dh"], ["ন", "n"],
    ["প", "p"], ["ফ", "ph"], ["ব", "b"], ["ভ", "bh"], ["ম", "m"],
    ["য", "j"], ["র", "r"], ["ল", "l"], ["শ", "sh"], ["ষ", "sh"],
    ["স", "s"], ["হ", "h"], ["ড়", "r"], ["ঢ়", "rh"], ["য়", "y"],
    ["ৎ", "t"], ["ং", "ng"], ["ঃ", "h"], ["ঁ", "n"],
    ["া", "a"], ["ি", "i"], ["ী", "i"], ["ু", "u"], ["ূ", "u"],
    ["ৃ", "ri"], ["ে", "e"], ["ৈ", "oi"], ["ো", "o"], ["ৌ", "ou"],
    ["্", ""], ["়", ""],
]);
const consonants = new Set(
    "কখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহড়ঢ়য়ৎ".split(""),
);
const vowelSigns = new Set("ািীুূৃেৈোৌ্".split(""));
const locationWords = /\b(?:where\s+is|where'?s|where\s+am\s+i|current\s+location(?:\s+of)?|location\s+of|locate|find|track|kothay|kothai|kothae|kuthay|kuthai|kotae|kotay|kothay\s+ache|kothay\s+ase)\b|কোথায়|কোথায়|কোথায় আছে|কোথায় আছে|কোথায় আছেন|কোথায় আছেন|কোথায় আছে রে|কোথায় পাব|অবস্থান কোথায়|লোকেশন কোথায়/i;
const roleWords = /\b(?:the|my|our|assigned|driver|drivers|chalok|chalak|rikshaw|rickshaw|rickshaws|where|is|ache|ase|ekhon|location|kothay|kothai|kothae|kuthay|kuthai|kotae|kotay|please|bolen|bolo|koi)\b|চালক|চালকের|ড্রাইভার|রিকশা|অবস্থান|লোকেশন|কোথায়|কোথায়|আছে|আছেন|এখন|আমার|দয়া করে|বলুন|বলেন/gi;

export function isLocationQuestion(question: string) {
    return locationWords.test(question);
}

export function extractDriverSearchTerm(question: string) {
    return question
        .replace(locationWords, " ")
        .replace(roleWords, " ")
        .replace(/[?!.,،؛:]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function isBanglaInput(question: string) {
    return /[\u0980-\u09FF]/.test(question) ||
        /\b(?:chalok|chalak|kothay|kothai|kothae|kuthay|kuthai|kotay|ache|ase|ki|kemon|bolen|bolo|amar|apni|dhonnobad)\b/i.test(question);
}

function addAdjacentVowelConsonantSwaps(candidates: string[]) {
    const variants = new Set(candidates);
    for (const candidate of candidates) {
        for (let index = 1; index < candidate.length - 1; index += 1) {
            const left = candidate[index - 1]!.toLowerCase();
            const right = candidate[index]!.toLowerCase();
            if ("aeiou".includes(left) !== "aeiou".includes(right)) {
                variants.add(
                    candidate.slice(0, index - 1) +
                    candidate[index] +
                    candidate[index - 1] +
                    candidate.slice(index + 1),
                );
            }
        }
    }
    return [...variants];
}

export function getDriverSearchTerms(term: string) {
    const trimmed = term.trim();
    if (!/[\u0980-\u09FF]/.test(trimmed)) {
        return addAdjacentVowelConsonantSwaps([trimmed]).slice(0, 12);
    }

    let expanded = "";
    const inherentVowelPositions: number[] = [];
    const characters = Array.from(trimmed);
    for (let index = 0; index < characters.length; index += 1) {
        const character = characters[index]!;
        const mapped = transliteration.get(character);
        if (mapped !== undefined) {
            expanded += mapped;
            if (
                consonants.has(character) &&
                !vowelSigns.has(characters[index + 1] ?? "") &&
                index < characters.length - 1
            ) {
                inherentVowelPositions.push(expanded.length);
                expanded += "o";
            }
        } else if (/\s/.test(character)) {
            expanded += " ";
        }
    }

    const variants = new Set<string>();
    const positions = inherentVowelPositions.slice(0, 5);
    for (let mask = 0; mask < 2 ** positions.length; mask += 1) {
        let candidate = expanded;
        for (let bit = positions.length - 1; bit >= 0; bit -= 1) {
            if ((mask & (1 << bit)) !== 0) {
                const position = positions[bit];
                if (position !== undefined) {
                    candidate = candidate.slice(0, position) + candidate.slice(position + 1);
                }
            }
        }
        const normalized = candidate.replace(/\s+/g, " ").trim();
        if (normalized.length >= 2 && normalized !== trimmed) variants.add(normalized);
    }
    return addAdjacentVowelConsonantSwaps([trimmed, ...variants].slice(0, 8)).slice(0, 24);
}

export function isCapabilitiesQuestion(question: string) {
    return /\b(?:what can you do|what do you do|what can this assistant do|your capabilities|how can you help|help me)\b|আপনি কী করতে পারেন|আপনি কি করতে পারেন|কী কী করতে পারেন|কি কি করতে পারেন|\b(?:tumi|apni)\s+(?:ki|ki ki)\s+(?:korte paro|korte paren)\b/i.test(question);
}
