import "./load-env";

// Usage: npm run help:sync — copies the help articles (lib/help/articles.ts) into Snowflake through the SQL API.
// The Help assistant searches them there (and Cortex Search re-indexes them within a minute when enabled).
// Run it after changing the articles. Needs the tables from scripts/snowflake/setup.sql.
async function main() {
  const { HELP_ARTICLES } = await import("@/lib/help/articles");
  const { SNOWFLAKE, runSql, snowflakeConfigured } = await import("@/lib/snowflake");
  if (!snowflakeConfigured()) throw new Error("Set SNOWFLAKE_ACCOUNT_URL and SNOWFLAKE_PAT in .env.local first");

  const rows = HELP_ARTICLES.map((a) => [a.id, a.title, a.body]);
  const bindings = Object.fromEntries(rows.flat().map((value, i) => [String(i + 1), { type: "TEXT" as const, value }]));
  await runSql(`DELETE FROM ${SNOWFLAKE.table}`);
  await runSql(`INSERT INTO ${SNOWFLAKE.table} (ARTICLE_ID, TITLE, CONTENT) VALUES ${rows.map(() => "(?, ?, ?)").join(", ")}`, bindings);
  console.log(`Synced ${rows.length} help articles to ${SNOWFLAKE.table}.`);
  process.exit(0);
}
main().catch((err) => {
  console.error(`help:sync failed: ${(err as Error).message}`);
  process.exit(1);
});
