import type { SearchChunk } from "./types";

// ── Porter Stemmer ────────────────────────────────────────────────────────────
// Implements steps 1a–5b of the Porter (1980) stemming algorithm.

/** Return true if position i in word is a consonant. */
function isConsonant(word: string, i: number): boolean {
  const c = word[i];
  if ("aeiou".includes(c)) return false;
  if (c === "y") return i === 0 || !isConsonant(word, i - 1);
  return true;
}

/**
 * Measure m: the count of VC sequences in word[0..j].
 * A "VC" is a run of one-or-more consonants followed by one-or-more vowels.
 */
function measure(word: string, j: number): number {
  let m = 0;
  let i = 0;
  // Skip leading consonants
  while (i <= j && isConsonant(word, i)) i++;
  while (i <= j) {
    // Skip vowels
    while (i <= j && !isConsonant(word, i)) i++;
    // Skip consonants
    if (i <= j) {
      m++;
      while (i <= j && isConsonant(word, i)) i++;
    }
  }
  return m;
}

function containsVowel(word: string, j: number): boolean {
  for (let i = 0; i <= j; i++) {
    if (!isConsonant(word, i)) return true;
  }
  return false;
}

function endsDoubleConsonant(word: string, j: number): boolean {
  if (j < 1) return false;
  return word[j] === word[j - 1] && isConsonant(word, j);
}

/** *o* condition: stem ends cvc where final c is not w, x, or y. */
function cvcSuffix(word: string, j: number): boolean {
  if (j < 2) return false;
  return (
    isConsonant(word, j) &&
    !isConsonant(word, j - 1) &&
    isConsonant(word, j - 2) &&
    !"wxy".includes(word[j])
  );
}

// ── Step data ─────────────────────────────────────────────────────────────────

const step2map: Record<string, string> = {
  ational: "ate",
  tional: "tion",
  enci: "ence",
  anci: "ance",
  izer: "ize",
  abli: "able",
  alli: "al",
  entli: "ent",
  eli: "e",
  ousli: "ous",
  ization: "ize",
  ation: "ate",
  ator: "ate",
  alism: "al",
  iveness: "ive",
  fulness: "ful",
  ousness: "ous",
  aliti: "al",
  iviti: "ive",
  biliti: "ble",
};

const step3map: Record<string, string> = {
  icate: "ic",
  ative: "",
  alize: "al",
  iciti: "ic",
  ical: "ic",
  ful: "",
  ness: "",
};

const step4suffixes = [
  "al",
  "ance",
  "ence",
  "er",
  "ic",
  "able",
  "ible",
  "ant",
  "ement",
  "ment",
  "ent",
  "ion",
  "ou",
  "ism",
  "ate",
  "iti",
  "ous",
  "ive",
  "ize",
];

// ── Porter algorithm steps ────────────────────────────────────────────────────

function step1a(word: string): string {
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ies")) return word.slice(0, -2);
  if (word.endsWith("ss")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function step1b(word: string): string {
  if (word.endsWith("eed")) {
    const stem = word.slice(0, -3);
    if (measure(stem, stem.length - 1) > 0) return stem + "ee";
    return word;
  }
  let flag = false;
  if (word.endsWith("ed")) {
    const stem = word.slice(0, -2);
    if (containsVowel(stem, stem.length - 1)) {
      word = stem;
      flag = true;
    }
  } else if (word.endsWith("ing")) {
    const stem = word.slice(0, -3);
    if (containsVowel(stem, stem.length - 1)) {
      word = stem;
      flag = true;
    }
  }
  if (flag) {
    if (word.endsWith("at") || word.endsWith("bl") || word.endsWith("iz")) {
      word += "e";
    } else if (
      endsDoubleConsonant(word, word.length - 1) &&
      !"lsz".includes(word[word.length - 1])
    ) {
      word = word.slice(0, -1);
    } else if (
      measure(word, word.length - 1) === 1 &&
      cvcSuffix(word, word.length - 1)
    ) {
      word += "e";
    }
  }
  return word;
}

function step1c(word: string): string {
  if (word.endsWith("y") && containsVowel(word.slice(0, -1), word.length - 2)) {
    return word.slice(0, -1) + "i";
  }
  return word;
}

function step2(word: string): string {
  for (const suffix of Object.keys(step2map)) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measure(stem, stem.length - 1) > 0) {
        return stem + step2map[suffix];
      }
      break;
    }
  }
  return word;
}

function step3(word: string): string {
  for (const suffix of Object.keys(step3map)) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measure(stem, stem.length - 1) > 0) {
        return stem + step3map[suffix];
      }
      break;
    }
  }
  return word;
}

function step4(word: string): string {
  for (const suffix of step4suffixes) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      const m = measure(stem, stem.length - 1);
      if (suffix === "ion") {
        // additional condition: stem must end in s or t
        if (m > 1 && (stem.endsWith("s") || stem.endsWith("t"))) {
          return stem;
        }
      } else if (m > 1) {
        return stem;
      }
      break;
    }
  }
  return word;
}

function step5a(word: string): string {
  if (word.endsWith("e")) {
    const stem = word.slice(0, -1);
    const m = measure(stem, stem.length - 1);
    if (m > 1) return stem;
    if (m === 1 && !cvcSuffix(stem, stem.length - 1)) return stem;
  }
  return word;
}

function step5b(word: string): string {
  if (
    measure(word, word.length - 1) > 1 &&
    endsDoubleConsonant(word, word.length - 1) &&
    word.endsWith("l")
  ) {
    return word.slice(0, -1);
  }
  return word;
}

/** Porter stemmer: reduce an English word to its stem. */
export function stem(word: string): string {
  word = word.toLowerCase();
  if (word.length <= 2) return word;
  word = step1a(word);
  word = step1b(word);
  word = step1c(word);
  word = step2(word);
  word = step3(word);
  word = step4(word);
  word = step5a(word);
  word = step5b(word);
  return word;
}

// ── SearchIndex ───────────────────────────────────────────────────────────────

interface IndexedChunk {
  chunk: SearchChunk;
  stemmedKeywords: Set<string>;
}

function tokenize(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((t) => t.length > 0);
  return [...new Set(tokens)];
}

export class SearchIndex {
  private indexed: IndexedChunk[];

  constructor(chunks: SearchChunk[]) {
    this.indexed = chunks.map((chunk) => ({
      chunk,
      stemmedKeywords: new Set(chunk.keywords.map(stem)),
    }));
  }

  search(query: string, limit = 3): SearchChunk[] {
    const tokens = tokenize(query);
    const stemmedTokens = tokens.map(stem);

    const scored: { chunk: SearchChunk; score: number }[] = [];

    for (const { chunk, stemmedKeywords } of this.indexed) {
      let score = 0;
      for (const token of stemmedTokens) {
        for (const kw of stemmedKeywords) {
          if (kw === token) {
            score += 1;
          } else if (token.length >= 3 && kw.startsWith(token)) {
            score += 0.5;
          } else if (token.length >= 3 && token.startsWith(kw)) {
            score += 0.5;
          }
        }
      }
      if (score > 0) {
        scored.push({ chunk, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, limit)
      .map((s) => s.chunk);
  }

  listTopics(): { id: string; title: string; category: string }[] {
    return this.indexed.map(({ chunk }) => ({
      id: chunk.id,
      title: chunk.title,
      category: chunk.category,
    }));
  }
}
