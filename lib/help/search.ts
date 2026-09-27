import { HELP_ARTICLES, type HelpArticle } from "./articles";

const STOP = new Set(
  "a an and are be can could do does for from get go how i if in into is it me my of on or should the there this to use using what when where which who why will with would you your".split(" "),
);

/** "Recording" and "records" both become "record", so simple word matching still finds the article. */
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w);

export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

/**
 * Keyword search over the help articles, used when Snowflake isn't set up or doesn't answer. A word in the
 * title counts three times; repeats in the body count up to three times.
 */
export function searchArticles(query: string, limit = 3, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  const words = [...new Set(terms(query))];
  if (words.length === 0) return [];
  return articles
    .map((article) => {
      const title = new Set(terms(article.title));
      const body = terms(article.body);
      const score = words.reduce((sum, w) => sum + (title.has(w) ? 3 : 0) + Math.min(body.filter((b) => b === w).length, 3), 0);
      return { article, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.article);
}
