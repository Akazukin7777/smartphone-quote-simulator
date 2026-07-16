import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../data/plans.json", import.meta.url);
const outputUrl = new URL("../data/plans.js", import.meta.url);
const planDb = JSON.parse(await readFile(sourceUrl, "utf8"));
const browserDb = {
  schemaVersion: planDb.schemaVersion,
  checkedAt: planDb.checkedAt,
  currency: planDb.currency,
  plans: planDb.plans.map((plan) => ({
    id: plan.id,
    carrier: plan.carrier,
    brand: plan.brand,
    planName: plan.planName,
    tierName: plan.tierName,
    monthlyPrice: plan.monthlyPrice,
    dataAmount: plan.dataAmount,
    call: plan.call,
    discounts: plan.discounts,
  })),
};

await writeFile(
  outputUrl,
  `window.MOBILE_PLAN_DB = ${JSON.stringify(browserDb, null, 2)};\n`,
);

console.log(`Wrote ${outputUrl.pathname}`);
