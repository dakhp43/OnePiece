const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Digits in a note sentence: "BP 138/88, lisinopril 20 mg" -> ["138", "88", "20"]. */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(canonical);
}

const canonical = (n: string) => String(Number(n));

/** Parses a 1–99 value starting at words[i] ("thirty eight", "eighty", "fifteen"). */
function parseUnder100(words: string[], i: number): { value: number; used: number } | null {
  const w = words[i];
  if (w in TENS) {
    const next = words[i + 1];
    if (next && next in UNITS && UNITS[next] > 0 && UNITS[next] < 10) return { value: TENS[w] + UNITS[next], used: 2 };
    return { value: TENS[w], used: 1 };
  }
  if (w in UNITS) return { value: UNITS[w], used: 1 };
  return null;
}

/** Converts spelled numbers 0–200 in speech to digits (e.g. "one thirty-eight" -> 138, "a hundred and ten" -> 110). */
export function spelledToDigits(text: string): string {
  const words = text.toLowerCase().replace(/-/g, " ").split(/\s+/);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const raw = words[i];
    const w = raw.replace(/[^a-z]/g, "");
    const clean = words.slice(i).map((x) => x.replace(/[^a-z]/g, ""));

    // "one hundred (and) X" / "a hundred (and) X" / "two hundred"
    if ((w === "one" || w === "a" || w === "two") && clean[1] === "hundred") {
      const base = w === "two" ? 200 : 100;
      let j = 2;
      if (clean[j] === "and") j++;
      const rest = base === 100 ? parseUnder100(clean, j) : null;
      out.push(String(base + (rest?.value ?? 0)));
      i += rest ? j + rest.used : 2;
      continue;
    }
    // BP idiom: "one thirty eight" = 138, "one twenty" = 120, "one fifteen" = 115
    if (w === "one" && clean[1] && (clean[1] in TENS || (clean[1] in UNITS && UNITS[clean[1]] >= 10))) {
      const rest = parseUnder100(clean, 1)!;
      out.push(String(100 + rest.value));
      i += 1 + rest.used;
      continue;
    }
    const n = parseUnder100(clean, 0);
    if (n && w !== "a" && w !== "oh") {
      out.push(String(n.value));
      i += n.used;
      continue;
    }
    out.push(raw);
    i++;
  }
  return out.join(" ");
}

/** Normalizes source speech: spelled numbers -> digits, "130s" -> "130", "over" -> "/". */
export function normalizeSource(text: string): string {
  return spelledToDigits(text).replace(/\bover\b/g, "/").replace(/(\d+)'?s\b/g, "$1");
}

/** Numbers in the sentence that don't appear anywhere in the cited source text. */
export function missingNumbers(sentence: string, sourceTexts: string[]): string[] {
  const found = new Set(sourceTexts.flatMap((t) => extractNumbers(normalizeSource(t))));
  return [...new Set(extractNumbers(sentence))].filter((n) => !found.has(n));
}
