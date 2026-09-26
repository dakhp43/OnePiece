import "./load-env";
import fs from "node:fs";
import path from "node:path";

// Usage: tsx scripts/promote-fixtures.ts [visitId]
// Copies data/fixtures/last_good/*.json (written after every successful live pipeline step) into
// data/fixtures/demo/, and — with a visit id — that visit's recording as demo.webm/demo.wav.
// Run it right after a good live run of the demo script, then commit data/fixtures/demo.
const root = path.join(process.cwd(), "data");
const lastGood = path.join(root, "fixtures", "last_good");
const demo = path.join(root, "fixtures", "demo");

if (!fs.existsSync(lastGood)) {
  console.error("No data/fixtures/last_good yet. Run the demo live once first.");
  process.exit(1);
}
for (const f of fs.readdirSync(lastGood).filter((f) => f.endsWith(".json"))) {
  fs.copyFileSync(path.join(lastGood, f), path.join(demo, f));
  console.log(`demo/${f} <- last_good/${f}`);
}

const visitId = process.argv[2];
if (visitId) {
  const audioDir = path.join(root, "audio");
  const file = fs.readdirSync(audioDir).find((f) => f.startsWith(visitId) && !f.includes(".demo."));
  if (!file) {
    console.error(`No recording found for visit ${visitId} in data/audio`);
    process.exit(1);
  }
  const ext = path.extname(file);
  fs.copyFileSync(path.join(audioDir, file), path.join(demo, `demo${ext}`));
  console.log(`demo/demo${ext} <- audio/${file}`);
}
