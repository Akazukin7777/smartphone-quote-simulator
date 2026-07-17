import { readFile } from "node:fs/promises";

const planDb = JSON.parse(await readFile(new URL("../data/plans.json", import.meta.url), "utf8"));
const sourceMap = new Map();

for (const plan of planDb.plans) {
  if (!plan.sourceUrl || !plan.sourceChecks?.length) {
    continue;
  }

  const source = sourceMap.get(plan.sourceUrl) ?? { plans: [], checks: new Set() };
  source.plans.push(plan.id);
  plan.sourceChecks.forEach((check) => source.checks.add(check));
  sourceMap.set(plan.sourceUrl, source);
}

const normalize = (text) => text.replace(/\s+/g, "");
let failed = 0;
let warnings = 0;

for (const [url, source] of sourceMap.entries()) {
  if (url.endsWith(".pdf")) {
    console.log(`SKIP PDF ${url}`);
    continue;
  }

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": "mobile-quote-plan-checker/1.0",
      },
    });
  } catch (error) {
    warnings += 1;
    console.warn(`WARN fetch failed ${url}`);
    console.warn(`  ${error.message}`);
    continue;
  }

  if (!response.ok) {
    failed += 1;
    console.error(`NG ${response.status} ${url}`);
    continue;
  }

  const body = normalize(await response.text());
  const missing = [...source.checks].filter((check) => !body.includes(normalize(check)));

  if (missing.length > 0) {
    failed += 1;
    console.error(`NG ${url}`);
    console.error(`  plans: ${source.plans.join(", ")}`);
    console.error(`  missing: ${missing.join(", ")}`);
    continue;
  }

  console.log(`OK ${url}`);
}

if (failed > 0) {
  process.exitCode = 1;
}

if (warnings > 0) {
  console.warn(`Completed with ${warnings} warning(s).`);
}
