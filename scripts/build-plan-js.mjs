import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../data/plans.json", import.meta.url);
const outputUrl = new URL("../data/plans.js", import.meta.url);
const planDb = JSON.parse(await readFile(sourceUrl, "utf8"));

await writeFile(
  outputUrl,
  `window.INTERNET_QUOTE_DB = ${JSON.stringify(planDb, null, 2)};\n`,
);

console.log(`Wrote ${outputUrl.pathname}`);
