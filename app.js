const STORAGE_KEY = "mobile-quote-state-v1";

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const defaultState = {
  current: {
    selectedBasePlan: "",
    base: "",
    netDiscount: false,
    familyDiscount: false,
    familyLine: "first",
    familyGroupSize: "three",
    callOption: "standard",
    customDiscountMonthly: "",
    customDiscountMonths: "",
    device: "",
  },
  change: {
    selectedBasePlan: "",
    base: "",
    netDiscount: false,
    familyDiscount: false,
    familyLine: "first",
    familyGroupSize: "three",
    callOption: "standard",
    paymentType: "installment",
    deviceLump: "",
    deviceFirst24: "",
    deviceAfter24: "",
    downPayment: "",
    programFee: "",
    adminFee: "",
    warranty: "",
  },
  mnp: {
    selectedBasePlan: "",
    base: "",
    netDiscount: false,
    familyDiscount: false,
    familyLine: "first",
    familyGroupSize: "three",
    callOption: "standard",
    customDiscountMonthly: "",
    customDiscountMonths: "",
    paymentType: "installment",
    deviceLump: "",
    deviceFirst24: "",
    deviceAfter24: "",
    downPayment: "",
    programFee: "",
    adminFee: "",
    warranty: "",
  },
};

const panels = [...document.querySelectorAll("[data-plan]")];
const amountInputs = [...document.querySelectorAll('input[data-key]:not([type="radio"]):not([type="checkbox"])')];
const keypad = document.querySelector("#amount-keypad");
const keypadFieldLabel = document.querySelector("#keypad-field-label");
const keypadPreview = document.querySelector("#keypad-preview");
const printSheet = document.querySelector("#print-sheet");
const exportPdfButton = document.querySelector("[data-export-pdf]");
const planCatalog = Array.isArray(window.MOBILE_PLAN_DB?.plans) ? window.MOBILE_PLAN_DB.plans : [];
const planCatalogMap = new Map(planCatalog.map((plan) => [plan.id, plan]));
const manualDiscounts = {
  netDiscount: {
    amount: 1100,
    label: "標準",
  },
  familyDiscount: {
    amount: 1100,
    label: "標準",
  },
};
const manualCallOptions = [
  {
    id: "standard",
    label: "手入力",
    amount: 0,
    description: "通話料は基本料金に含めて入力してください。",
  },
];
const familyGroupSizeLabels = {
  one: "1人",
  two: "2人",
  three: "3人以上",
};
let state = loadState();
let activeAmountInput = null;
let isApplyingSelectedPlan = false;
let lastKeypadPointerAt = 0;
let lastKeypadTouchEndAt = 0;

function getStorage() {
  try {
    if (!("localStorage" in window) || !window.localStorage) {
      return null;
    }

    return window.localStorage;
  } catch {
    return null;
  }
}

function loadState() {
  const storage = getStorage();
  if (!storage) {
    return structuredClone(defaultState);
  }

  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    return mergeState(defaultState, saved || {});
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(base, incoming) {
  const merged = structuredClone(base);

  Object.entries(incoming).forEach(([plan, values]) => {
    if (!merged[plan] || typeof values !== "object" || values === null) {
      return;
    }

    Object.entries(values).forEach(([key, value]) => {
      if (key in merged[plan]) {
        merged[plan][key] = value;
      }
    });
  });

  return merged;
}

function saveState() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy restrictions should not interrupt quote calculations.
  }
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function sanitizeAmount(value) {
  return String(value).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function formatYen(value) {
  return yenFormatter.format(Math.max(0, Math.round(value)));
}

function formatDiscount(value) {
  return value > 0 ? `-${formatYen(value)}` : "¥0";
}

function formatPlanOption(plan) {
  const pieces = [plan.brand, plan.planName, plan.tierName].filter(Boolean);
  return `${pieces.join(" ")} / ${plan.dataAmount} / ${formatYen(plan.monthlyPrice)}`;
}

function formatYenInput(value) {
  return formatYen(toNumber(value));
}

function formatPlainDate(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function setOutput(panel, key, value, formatter = formatYen) {
  const output = panel.querySelector(`[data-output="${key}"]`);
  if (output) {
    output.textContent = formatter(value);
  }
}

function setOutputLabel(panel, key, text) {
  const output = panel.querySelector(`[data-output-label="${key}"]`);
  if (output) {
    output.textContent = text;
  }
}

function isNetDiscount(discount) {
  return /光|home 5G|自宅セット|おうち割|スマートバリュー/.test(discount.name);
}

function isFamilyDiscount(discount) {
  return /家族|みんなドコモ/.test(discount.name);
}

function getSelectedPlan(values) {
  return planCatalogMap.get(values.selectedBasePlan);
}

function getCallOptions(values) {
  const selectedPlan = getSelectedPlan(values);
  return selectedPlan?.callOptions?.length ? selectedPlan.callOptions : manualCallOptions;
}

function getCallOption(values) {
  const options = getCallOptions(values);
  return options.find((option) => option.id === values.callOption) ?? options[0] ?? manualCallOptions[0];
}

function getCallOptionMonthly(values) {
  return Math.max(0, toNumber(getCallOption(values).amount));
}

function formatCallOptionAmount(option) {
  const amount = Math.max(0, toNumber(option.amount));
  return amount > 0 ? `+${formatYen(amount)}/月` : "追加なし";
}

function formatCallOptionOption(option) {
  return `${option.label}（${formatCallOptionAmount(option)}）`;
}

function formatCallOptionSelection(values) {
  const option = getCallOption(values);
  const description = option.description ? ` / ${option.description}` : "";
  return `${option.label} ${formatCallOptionAmount(option)}${description}`;
}

function isSetDiscountExclusivePlan(plan) {
  return ["UQ mobile", "Y!mobile"].includes(plan?.brand);
}

function isYmobileSimple3Plan(plan) {
  return plan?.brand === "Y!mobile" && plan?.planName === "シンプル3";
}

function getFamilyGroupSize(value) {
  return value in familyGroupSizeLabels ? value : "three";
}

function getTieredFamilyDiscountRule(plan) {
  if (!plan?.discounts?.some(isFamilyDiscount)) {
    return null;
  }

  if (plan.brand === "docomo") {
    return {
      amounts: { one: 0, two: 550, three: 1210 },
      labels: { one: "1回線", two: "2回線", three: "3回線以上" },
    };
  }

  if (plan.brand === "au") {
    return {
      amounts: { one: 0, two: 660, three: 1210 },
      labels: familyGroupSizeLabels,
    };
  }

  if (plan.brand === "SoftBank") {
    const isMiniFit = /ミニフィット/.test(`${plan.planName} ${plan.tierName}`);

    return {
      amounts: isMiniFit ? { one: 0, two: 220, three: 550 } : { one: 0, two: 660, three: 1210 },
      labels: familyGroupSizeLabels,
    };
  }

  return null;
}

function isTieredFamilyDiscountPlan(plan) {
  return Boolean(getTieredFamilyDiscountRule(plan));
}

function isFamilyDiscountBlocked(values) {
  return Boolean(values.netDiscount && isSetDiscountExclusivePlan(getSelectedPlan(values)));
}

function enforceDiscountRules(panel) {
  const plan = panel.dataset.plan;

  if (!isFamilyDiscountBlocked(state[plan])) {
    return;
  }

  state[plan].familyDiscount = false;

  const familyInput = panel.querySelector('[data-key="familyDiscount"]');
  if (familyInput) {
    familyInput.checked = false;
  }
}

function getDiscountInfo(values, key) {
  const selectedPlan = getSelectedPlan(values);

  if (key === "familyDiscount" && isFamilyDiscountBlocked(values)) {
    return {
      amount: 0,
      label: "ネット割適用時は併用不可",
    };
  }

  if (!selectedPlan) {
    return manualDiscounts[key];
  }

  const matcher = key === "netDiscount" ? isNetDiscount : isFamilyDiscount;
  const discount = selectedPlan.discounts?.find(matcher);

  if (!discount) {
    return {
      amount: 0,
      label: "対象割引なし",
    };
  }

  if (key === "familyDiscount" && isYmobileSimple3Plan(selectedPlan)) {
    if (values.familyDiscount && values.familyLine !== "additional") {
      return {
        amount: 0,
        label: "1回線目は割引なし",
      };
    }

    return {
      amount: Math.abs(toNumber(discount.amount)),
      label: `${discount.name}（2回線目以降）`,
    };
  }

  const tieredFamilyRule = key === "familyDiscount" ? getTieredFamilyDiscountRule(selectedPlan) : null;

  if (tieredFamilyRule) {
    const groupSize = getFamilyGroupSize(values.familyGroupSize);
    const amount = tieredFamilyRule.amounts[groupSize] ?? 0;
    const groupLabel = tieredFamilyRule.labels[groupSize] ?? familyGroupSizeLabels[groupSize];

    return {
      amount,
      label: amount > 0 ? `${discount.name}（${groupLabel}）` : `${discount.name}（${groupLabel}は割引なし）`,
    };
  }

  return {
    amount: Math.abs(toNumber(discount.amount)),
    label: discount.name,
  };
}

function calculateBaseDiscount(values) {
  const baseMonthly = toNumber(values.base);
  const netDiscount = values.netDiscount ? getDiscountInfo(values, "netDiscount").amount : 0;
  const familyDiscount = values.familyDiscount ? getDiscountInfo(values, "familyDiscount").amount : 0;

  return Math.min(baseMonthly, netDiscount + familyDiscount);
}

function calculateDiscountedBase(values) {
  return Math.max(0, toNumber(values.base) - calculateBaseDiscount(values));
}

function calculateCustomDiscount(values) {
  const monthly = toNumber(values.customDiscountMonthly);
  const rawMonths = toNumber(values.customDiscountMonths);
  const months = monthly > 0 ? Math.max(1, rawMonths) : 0;

  return {
    monthly,
    months,
  };
}

function getEffectiveLabel(prefix, months) {
  if (months <= 0) {
    return prefix;
  }

  return `${months}ヶ月間 実質負担`;
}

function calculateCurrent(values) {
  const discountTotal = calculateBaseDiscount(values);
  const callOptionMonthly = getCallOptionMonthly(values);
  const monthly = calculateDiscountedBase(values) + callOptionMonthly + toNumber(values.device);
  const customDiscount = calculateCustomDiscount(values);
  const effectiveMonthly = Math.max(0, monthly - customDiscount.monthly);

  return {
    monthly,
    discountTotal,
    callOptionMonthly,
    customDiscountMonthly: customDiscount.monthly,
    customDiscountMonths: customDiscount.months,
    effectiveMonthly,
    total24: monthly * 24,
  };
}

function calculateQuote(values) {
  const discountTotal = calculateBaseDiscount(values);
  const customDiscount = calculateCustomDiscount(values);
  const baseMonthly = calculateDiscountedBase(values);
  const callOptionMonthly = getCallOptionMonthly(values);
  const warrantyMonthly = toNumber(values.warranty);
  const commonMonthly = baseMonthly + callOptionMonthly + warrantyMonthly;
  const isLump = values.paymentType === "lump";
  const firstDeviceMonthly = isLump ? 0 : toNumber(values.deviceFirst24);
  const afterDeviceMonthly = isLump ? 0 : toNumber(values.deviceAfter24);
  const returnCost = toNumber(values.programFee);
  const initialCost =
    toNumber(values.downPayment) +
    toNumber(values.adminFee) +
    (isLump ? toNumber(values.deviceLump) : 0);
  const monthlyFirst24 = commonMonthly + firstDeviceMonthly;
  const monthlyReturned = commonMonthly;
  const monthlyAfter24 = commonMonthly + afterDeviceMonthly;
  const effectiveMonthlyFirst24 = Math.max(0, monthlyFirst24 - customDiscount.monthly);

  return {
    monthlyFirst24,
    effectiveMonthlyFirst24,
    monthlyReturned,
    monthlyAfter24,
    initialCost,
    returnCost,
    discountTotal,
    callOptionMonthly,
    customDiscountMonthly: customDiscount.monthly,
    customDiscountMonths: customDiscount.months,
  };
}

function createPrintElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function appendPrintRow(parent, label, value, options = {}) {
  const row = createPrintElement("div", `print-row${options.result ? " is-result" : ""}`);
  row.append(createPrintElement("span", "", label), createPrintElement("strong", "", value));
  parent.append(row);
}

function appendPrintSection(parent, title, rows) {
  const section = createPrintElement("section", "print-section");
  section.append(createPrintElement("h3", "", title));
  rows.forEach((row) => appendPrintRow(section, row.label, row.value, { result: row.result }));
  parent.append(section);
}

function getSelectedPlanLabel(values) {
  const selectedPlan = getSelectedPlan(values);

  if (!selectedPlan) {
    return "手入力";
  }

  return [selectedPlan.brand, selectedPlan.planName, selectedPlan.tierName].filter(Boolean).join(" ");
}

function formatDiscountSelection(values, key) {
  if (!values[key]) {
    return "なし";
  }

  const info = getDiscountInfo(values, key);
  return info.amount > 0 ? `${info.label} ${formatDiscount(info.amount)}/月` : info.label;
}

function getBasePrintRows(values) {
  return [
    { label: "料金プラン", value: getSelectedPlanLabel(values) },
    { label: "基本料金 / 月", value: formatYenInput(values.base) },
    { label: "通話オプション", value: formatCallOptionSelection(values) },
    { label: "ネット割", value: formatDiscountSelection(values, "netDiscount") },
    { label: "家族割", value: formatDiscountSelection(values, "familyDiscount") },
  ];
}

function getCustomDiscountPrintRows(values) {
  const customDiscount = calculateCustomDiscount(values);

  if (customDiscount.monthly <= 0) {
    return [];
  }

  return [
    { label: "実質負担調整 / 月", value: formatDiscount(customDiscount.monthly) },
    { label: "対象月数", value: `${customDiscount.months}ヶ月` },
  ];
}

function getQuoteInputRows(values) {
  const isLump = values.paymentType === "lump";
  const rows = [
    ...getBasePrintRows(values),
    { label: "端末支払い", value: isLump ? "一括" : "分割" },
  ];

  if (isLump) {
    rows.push({ label: "端末一括料金", value: formatYenInput(values.deviceLump) });
  } else {
    rows.push(
      { label: "前半24ヶ月の分割金 / 月", value: formatYenInput(values.deviceFirst24) },
      { label: "25〜48ヶ月目の分割金 / 月", value: `${formatYenInput(values.deviceAfter24)}（返却で支払免除）` },
    );
  }

  rows.push(
    { label: "頭金", value: formatYenInput(values.downPayment) },
    { label: "プログラム利用料（返却時）", value: formatYenInput(values.programFee) },
    { label: "事務手数料", value: formatYenInput(values.adminFee) },
    { label: "補償 / 月", value: formatYenInput(values.warranty) },
    ...getCustomDiscountPrintRows(values),
  );

  return rows;
}

function createPrintCard(title, inputRows, resultRows) {
  const card = createPrintElement("article", "print-card");
  card.append(createPrintElement("h2", "", title));
  appendPrintSection(card, "入力内容", inputRows);
  appendPrintSection(card, "見積もり結果", resultRows);
  return card;
}

function renderPrintSheet() {
  if (!printSheet) {
    return;
  }

  const current = calculateCurrent(state.current);
  const change = calculateQuote(state.change);
  const mnp = calculateQuote(state.mnp);

  printSheet.replaceChildren();

  const header = createPrintElement("header", "print-header");
  const titleBlock = createPrintElement("div");
  titleBlock.append(
    createPrintElement("p", "print-eyebrow", "Mobile Quote"),
    createPrintElement("h1", "", "スマホ見積もりシミュレーター"),
  );
  header.append(titleBlock, createPrintElement("time", "", formatPlainDate(new Date())));

  const summary = createPrintElement("section", "print-summary");
  [
    ["現状月額", current.monthly],
    ["機種変更 1〜24ヶ月", change.monthlyFirst24],
    ["MNP 1〜24ヶ月", mnp.monthlyFirst24],
  ].forEach(([label, value]) => {
    const item = createPrintElement("article");
    item.append(createPrintElement("span", "", label), createPrintElement("strong", "", formatYen(value)));
    summary.append(item);
  });

  const grid = createPrintElement("section", "print-grid");
  grid.append(
    createPrintCard("現在の利用状況", [...getBasePrintRows(state.current), ...getCustomDiscountPrintRows(state.current), { label: "端末料金 / 月", value: formatYenInput(state.current.device) }], [
      { label: "月額合計", value: formatYen(current.monthly), result: true },
      { label: "割引合計 / 月", value: formatDiscount(current.discountTotal), result: true },
      { label: "通話オプション / 月", value: formatYen(current.callOptionMonthly), result: true },
      { label: getEffectiveLabel("実質負担", current.customDiscountMonths), value: formatYen(current.effectiveMonthly), result: true },
      { label: "24ヶ月合計", value: formatYen(current.total24), result: true },
    ]),
    createPrintCard("機種変更", getQuoteInputRows(state.change), [
      { label: "1〜24ヶ月目", value: formatYen(change.monthlyFirst24), result: true },
      { label: "割引合計 / 月", value: formatDiscount(change.discountTotal), result: true },
      { label: "通話オプション / 月", value: formatYen(change.callOptionMonthly), result: true },
      { label: "実質負担", value: formatYen(change.effectiveMonthlyFirst24), result: true },
      { label: "25〜48ヶ月目（継続時）", value: formatYen(change.monthlyAfter24), result: true },
      { label: "初期・一括費用", value: formatYen(change.initialCost), result: true },
      { label: "返却時費用", value: formatYen(change.returnCost), result: true },
    ]),
    createPrintCard("MNP", getQuoteInputRows(state.mnp), [
      { label: "1〜24ヶ月目", value: formatYen(mnp.monthlyFirst24), result: true },
      { label: "割引合計 / 月", value: formatDiscount(mnp.discountTotal), result: true },
      { label: "通話オプション / 月", value: formatYen(mnp.callOptionMonthly), result: true },
      { label: getEffectiveLabel("実質負担", mnp.customDiscountMonths), value: formatYen(mnp.effectiveMonthlyFirst24), result: true },
      { label: "25〜48ヶ月目（継続時）", value: formatYen(mnp.monthlyAfter24), result: true },
      { label: "初期・一括費用", value: formatYen(mnp.initialCost), result: true },
      { label: "返却時費用", value: formatYen(mnp.returnCost), result: true },
    ]),
  );

  printSheet.append(header, summary, grid);
}

function handleExportPdf() {
  closeKeypad();
  updateResults();
  renderPrintSheet();
  window.setTimeout(() => window.print(), 80);
}

function setupPlanSelectors() {
  if (planCatalog.length === 0) {
    return;
  }

  panels.forEach((panel) => {
    const baseInput = panel.querySelector('[data-key="base"]:not([type="radio"])');
    const baseField = baseInput?.closest(".form-field");

    if (!baseField) {
      return;
    }

    const picker = document.createElement("label");
    picker.className = "plan-picker";

    const label = document.createElement("span");
    label.textContent = "料金プランから選択";

    const select = document.createElement("select");
    select.dataset.planSelect = "";
    select.append(new Option("手入力する", ""));

    const plansByCarrier = Map.groupBy
      ? Map.groupBy(planCatalog, (plan) => plan.carrier)
      : planCatalog.reduce((groups, plan) => {
          const plans = groups.get(plan.carrier) ?? [];
          plans.push(plan);
          groups.set(plan.carrier, plans);
          return groups;
        }, new Map());

    plansByCarrier.forEach((plans, carrier) => {
      const group = document.createElement("optgroup");
      group.label = carrier;
      plans.forEach((plan) => {
        group.append(new Option(formatPlanOption(plan), plan.id));
      });
      select.append(group);
    });

    const meta = document.createElement("p");
    meta.className = "plan-picker-meta";
    meta.dataset.planMeta = "";
    meta.textContent = "プランを選ぶと基本料金に反映されます。";

    picker.append(label, select, meta);
    baseField.before(picker);
  });
}

function setupCallOptionSelectors() {
  panels.forEach((panel) => {
    const baseInput = panel.querySelector('[data-key="base"]:not([type="radio"])');
    const baseField = baseInput?.closest(".form-field");

    if (!baseField) {
      return;
    }

    const field = document.createElement("label");
    field.className = "call-option-picker";

    const label = document.createElement("span");
    label.textContent = "通話オプション";

    const select = document.createElement("select");
    select.dataset.callOptionSelect = "";

    const meta = document.createElement("p");
    meta.className = "call-option-meta";
    meta.dataset.callOptionMeta = "";

    field.append(label, select, meta);
    baseField.after(field);
  });
}

function syncCallOptionSelector(panel) {
  const plan = panel.dataset.plan;
  const select = panel.querySelector("[data-call-option-select]");
  const meta = panel.querySelector("[data-call-option-meta]");

  if (!select || !meta) {
    return;
  }

  const options = getCallOptions(state[plan]);
  const currentIds = [...select.options].map((option) => option.value);
  const nextIds = options.map((option) => option.id);
  const shouldRebuild =
    currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index]);

  if (shouldRebuild) {
    select.replaceChildren(...options.map((option) => new Option(formatCallOptionOption(option), option.id)));
  }

  if (!options.some((option) => option.id === state[plan].callOption)) {
    state[plan].callOption = options[0]?.id ?? "standard";
  }

  select.value = state[plan].callOption;
  const selectedOption = getCallOption(state[plan]);
  meta.textContent = selectedOption.description ?? "";
}

function updatePlanMeta(panel) {
  const select = panel.querySelector("[data-plan-select]");
  const meta = panel.querySelector("[data-plan-meta]");

  if (!select || !meta) {
    return;
  }

  const selectedPlan = planCatalogMap.get(select.value);

  if (!selectedPlan) {
    meta.textContent = "プランを選ぶと基本料金に反映されます。";
    return;
  }

  meta.textContent = `${selectedPlan.brand} / ${selectedPlan.dataAmount} / ${selectedPlan.call}`;
}

function syncDiscountOptions(panel) {
  const plan = panel.dataset.plan;

  panel.querySelectorAll("[data-discount-meta]").forEach((meta) => {
    const key = meta.dataset.discountMeta;
    const info = getDiscountInfo(state[plan], key);
    const option = meta.closest(".discount-option");
    const input = option?.querySelector("input");
    const isBlockedFamily = key === "familyDiscount" && isFamilyDiscountBlocked(state[plan]);

    meta.textContent = info.amount > 0 ? `${info.label} ${formatDiscount(info.amount)}/月` : info.label;

    if (input) {
      input.disabled = isBlockedFamily;
    }

    option?.classList.toggle("is-disabled", isBlockedFamily);
  });
}

function syncFamilyLineVisibility(panel) {
  const plan = panel.dataset.plan;
  const field = panel.querySelector("[data-family-line-field]");

  if (!field) {
    return;
  }

  const isVisible =
    isYmobileSimple3Plan(getSelectedPlan(state[plan])) &&
    state[plan].familyDiscount &&
    !state[plan].netDiscount;

  field.classList.toggle("is-hidden", !isVisible);
  field.setAttribute("aria-hidden", String(!isVisible));
}

function syncFamilyCountVisibility(panel) {
  const plan = panel.dataset.plan;
  const field = panel.querySelector("[data-family-count-field]");

  if (!field) {
    return;
  }

  const isVisible =
    isTieredFamilyDiscountPlan(getSelectedPlan(state[plan])) &&
    state[plan].familyDiscount &&
    !isFamilyDiscountBlocked(state[plan]);

  field.classList.toggle("is-hidden", !isVisible);
  field.setAttribute("aria-hidden", String(!isVisible));
}

function syncFamilyFields(panel) {
  syncFamilyLineVisibility(panel);
  syncFamilyCountVisibility(panel);
}

function updatePaymentVisibility(panel, plan) {
  const paymentType = state[plan].paymentType;

  panel.querySelectorAll("[data-payment-group]").forEach((group) => {
    const isActive = group.dataset.paymentGroup === paymentType;
    group.classList.toggle("is-hidden", !isActive);
    group.setAttribute("aria-hidden", String(!isActive));
  });

  if (
    activeAmountInput &&
    panel.contains(activeAmountInput) &&
    activeAmountInput.closest("[data-payment-group].is-hidden")
  ) {
    closeKeypad();
  }
}

function hydrateInputs() {
  panels.forEach((panel) => {
    const plan = panel.dataset.plan;
    const planSelect = panel.querySelector("[data-plan-select]");

    enforceDiscountRules(panel);

    panel.querySelectorAll("[data-key]").forEach((input) => {
      const key = input.dataset.key;

      if (input.type === "radio") {
        input.checked = state[plan][key] === input.value;
      } else if (input.type === "checkbox") {
        input.checked = Boolean(state[plan][key]);
      } else {
        input.value = sanitizeAmount(state[plan][key] ?? "");
      }
    });

    if (planSelect) {
      planSelect.value = state[plan].selectedBasePlan ?? "";
      updatePlanMeta(panel);
    }

    syncCallOptionSelector(panel);
    syncDiscountOptions(panel);
    syncFamilyFields(panel);
    updatePaymentVisibility(panel, plan);
  });
}

function updateResults() {
  const current = calculateCurrent(state.current);
  const change = calculateQuote(state.change);
  const mnp = calculateQuote(state.mnp);

  panels.forEach((panel) => {
    const plan = panel.dataset.plan;

    if (plan === "current") {
      setOutput(panel, "monthly", current.monthly);
      setOutput(panel, "discountTotal", current.discountTotal, formatDiscount);
      setOutput(panel, "callOptionMonthly", current.callOptionMonthly);
      setOutput(panel, "effectiveMonthly", current.effectiveMonthly);
      setOutputLabel(panel, "effectiveMonthly", getEffectiveLabel("実質負担", current.customDiscountMonths));
      setOutput(panel, "total24", current.total24);
      return;
    }

    const quote = plan === "change" ? change : mnp;

    setOutput(panel, "monthlyFirst24", quote.monthlyFirst24);
    setOutput(panel, "discountTotal", quote.discountTotal, formatDiscount);
    setOutput(panel, "callOptionMonthly", quote.callOptionMonthly);
    setOutput(panel, "effectiveMonthly", quote.effectiveMonthlyFirst24);
    setOutputLabel(panel, "effectiveMonthly", getEffectiveLabel("実質負担", quote.customDiscountMonths));
    setOutput(panel, "monthlyReturned", quote.monthlyReturned);
    setOutput(panel, "monthlyAfter24", quote.monthlyAfter24);
    setOutput(panel, "initialCost", quote.initialCost);
    setOutput(panel, "returnCost", quote.returnCost);
  });

  document.querySelector("#summary-current").textContent = formatYen(current.monthly);
  document.querySelector("#summary-change").textContent = formatYen(change.monthlyFirst24);
  document.querySelector("#summary-mnp").textContent = formatYen(mnp.monthlyFirst24);
}

function handleInput(event) {
  const input = event.target.closest("[data-key]");
  if (!input) {
    return;
  }

  const panel = input.closest("[data-plan]");
  const plan = panel.dataset.plan;
  const key = input.dataset.key;

  if (input.type === "radio") {
    if (!input.checked) {
      return;
    }

    state[plan][key] = input.value;
    syncCallOptionSelector(panel);
    syncDiscountOptions(panel);
    syncFamilyFields(panel);
    updatePaymentVisibility(panel, plan);
  } else if (input.type === "checkbox") {
    state[plan][key] = input.checked;
    enforceDiscountRules(panel);
    syncDiscountOptions(panel);
    syncFamilyFields(panel);
  } else {
    const cleanValue = sanitizeAmount(input.value);
    if (input.value !== cleanValue) {
      input.value = cleanValue;
    }

    state[plan][key] = cleanValue;

    if (key === "base" && !isApplyingSelectedPlan) {
      state[plan].selectedBasePlan = "";
      const planSelect = panel.querySelector("[data-plan-select]");
      if (planSelect) {
        planSelect.value = "";
        updatePlanMeta(panel);
        syncCallOptionSelector(panel);
        syncDiscountOptions(panel);
        syncFamilyFields(panel);
      }
    }
  }

  saveState();
  updateResults();
  syncKeypadPreview();
}

function handlePlanSelect(event) {
  const select = event.target.closest("[data-plan-select]");
  if (!select) {
    return;
  }

  const panel = select.closest("[data-plan]");
  const plan = panel.dataset.plan;
  const selectedPlan = planCatalogMap.get(select.value);

  state[plan].selectedBasePlan = select.value;
  state[plan].callOption = "standard";
  updatePlanMeta(panel);
  syncCallOptionSelector(panel);
  enforceDiscountRules(panel);
  syncDiscountOptions(panel);
  syncFamilyFields(panel);

  if (!selectedPlan) {
    saveState();
    updateResults();
    return;
  }

  const baseInput = panel.querySelector('[data-key="base"]:not([type="radio"])');
  if (!baseInput) {
    saveState();
    return;
  }

  isApplyingSelectedPlan = true;
  baseInput.value = String(selectedPlan.monthlyPrice);
  baseInput.dispatchEvent(new Event("input", { bubbles: true }));
  isApplyingSelectedPlan = false;
}

function handleCallOptionSelect(event) {
  const select = event.target.closest("[data-call-option-select]");
  if (!select) {
    return;
  }

  const panel = select.closest("[data-plan]");
  const plan = panel.dataset.plan;

  state[plan].callOption = select.value;
  syncCallOptionSelector(panel);
  saveState();
  updateResults();
}

function resetPlan(plan) {
  state[plan] = structuredClone(defaultState[plan]);
  saveState();
  hydrateInputs();
  updateResults();
  syncKeypadPreview();
}

function isAmountInput(element) {
  return amountInputs.includes(element);
}

function getInputLabel(input) {
  return input.closest(".form-field")?.querySelector("span")?.textContent ?? "金額入力";
}

function syncKeypadPreview() {
  if (!keypadPreview) {
    return;
  }

  const value = activeAmountInput ? toNumber(activeAmountInput.value) : 0;
  keypadPreview.textContent =
    activeAmountInput?.dataset.format === "months" ? `${value}ヶ月` : formatYen(value);
}

function openKeypad(input) {
  if (!keypad || !isAmountInput(input)) {
    return;
  }

  if (activeAmountInput && activeAmountInput !== input) {
    activeAmountInput.classList.remove("keypad-active");
  }

  activeAmountInput = input;
  activeAmountInput.classList.add("keypad-active");
  keypadFieldLabel.textContent = getInputLabel(input);
  syncKeypadPreview();
  keypad.classList.add("is-open");
  keypad.setAttribute("aria-hidden", "false");
  document.body.classList.add("keypad-open");

  window.setTimeout(() => {
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 80);
}

function closeKeypad() {
  if (!keypad) {
    return;
  }

  if (activeAmountInput) {
    activeAmountInput.classList.remove("keypad-active");
  }

  activeAmountInput = null;
  keypad.classList.remove("is-open");
  keypad.setAttribute("aria-hidden", "true");
  document.body.classList.remove("keypad-open");
  syncKeypadPreview();
}

function updateActiveAmount(nextValue) {
  if (!activeAmountInput) {
    return;
  }

  activeAmountInput.value = sanitizeAmount(nextValue);
  activeAmountInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleKeypadPress(event) {
  const button = event.target.closest("[data-keypad-value], [data-keypad-action]");
  if (!button || !keypad?.contains(button)) {
    return;
  }

  const value = button.dataset.keypadValue;
  const action = button.dataset.keypadAction;
  const currentValue = activeAmountInput?.value ?? "";

  if (value !== undefined) {
    updateActiveAmount(`${currentValue}${value}`);
    return;
  }

  if (action === "backspace") {
    updateActiveAmount(currentValue.slice(0, -1));
    return;
  }

  if (action === "clear") {
    updateActiveAmount("");
    return;
  }

  if (action === "done") {
    closeKeypad();
  }
}

function handleKeypadPointer(event) {
  const button = event.target.closest("[data-keypad-value], [data-keypad-action]");
  if (!button || !keypad?.contains(button) || event.isPrimary === false) {
    return;
  }

  event.preventDefault();
  lastKeypadPointerAt = Date.now();
  handleKeypadPress(event);
}

function handleKeypadClick(event) {
  if (Date.now() - lastKeypadPointerAt < 450) {
    event.preventDefault();
    return;
  }

  handleKeypadPress(event);
}

function preventKeypadDoubleTapZoom(event) {
  const button = event.target.closest("[data-keypad-value], [data-keypad-action]");
  if (!button || !keypad?.contains(button)) {
    return;
  }

  const now = Date.now();
  if (now - lastKeypadTouchEndAt < 350) {
    event.preventDefault();
  }
  lastKeypadTouchEndAt = now;
}

document.addEventListener("input", handleInput);
document.addEventListener("change", handleInput);
document.addEventListener("change", handlePlanSelect);
document.addEventListener("change", handleCallOptionSelect);
document.addEventListener("focusin", (event) => {
  if (isAmountInput(event.target)) {
    openKeypad(event.target);
  }
});
document.addEventListener("pointerdown", (event) => {
  if (!keypad?.classList.contains("is-open")) {
    return;
  }

  if (keypad.contains(event.target) || isAmountInput(event.target)) {
    return;
  }

  window.setTimeout(closeKeypad, 160);
});

keypad?.addEventListener("pointerdown", handleKeypadPointer);
keypad?.addEventListener("click", handleKeypadClick);
keypad?.addEventListener("touchend", preventKeypadDoubleTapZoom, { passive: false });
exportPdfButton?.addEventListener("click", handleExportPdf);
window.addEventListener("beforeprint", renderPrintSheet);

document.querySelectorAll("[data-reset]").forEach((button) => {
  button.addEventListener("click", () => resetPlan(button.dataset.reset));
});

setupPlanSelectors();
setupCallOptionSelectors();
hydrateInputs();
updateResults();
