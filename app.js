const STORAGE_KEY = "internet-quote-state-v2";
const LEGACY_STORAGE_KEY = "internet-quote-state-v1";
const db = window.INTERNET_QUOTE_DB ?? { providers: [], homeTypes: {} };

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const routes = {
  provider: "index.html",
  application: "application.html",
  options: "options.html",
  result: "result.html",
};

const steps = [
  { id: "provider", label: "会社", route: routes.provider },
  { id: "application", label: "申込区分", route: routes.application },
  { id: "options", label: "オプション", route: routes.options },
  { id: "result", label: "見積もり", route: routes.result },
];

const defaultState = {
  providerId: "",
  applicationType: "",
  contractTermId: "",
  homeType: "home",
  constructionId: "",
  phone: false,
  phoneServiceId: "",
  phoneInitialId: "",
  softbankOuchiWari: false,
  tv: false,
  tvInitialId: "",
  manualInitial: "",
  manualMonthly: "",
};

const currentPage = document.body.dataset.page ?? "provider";
const root = document.querySelector("[data-page-root]");
const progress = document.querySelector("[data-progress]");
const savedPanel = document.querySelector("[data-saved-panel]");

let state = loadState();
clearLegacyState();
normalizeState();
if (!guardPage()) {
  render();
}

document.addEventListener("click", (event) => {
  const providerButton = event.target.closest("[data-provider-id]");
  if (providerButton) {
    state = {
      ...defaultState,
      providerId: providerButton.dataset.providerId,
    };
    saveAndGo("application");
    return;
  }

  const applicationButton = event.target.closest("[data-application-type]");
  if (applicationButton) {
    state.applicationType = applicationButton.dataset.applicationType;
    resetOptionsForApplication();
    setDefaultsForSelection();
    saveAndGo("options");
    return;
  }

  const continueButton = event.target.closest("[data-continue]");
  if (continueButton) {
    setDefaultsForSelection();
    saveAndGo(continueButton.dataset.continue);
    return;
  }

  const resetButton = event.target.closest("[data-reset]");
  if (resetButton) {
    state = { ...defaultState };
    saveState();
    window.location.href = routes.provider;
    return;
  }

  const printButton = event.target.closest("[data-print]");
  if (printButton) {
    window.print();
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.matches("[data-home-type]")) {
    state.homeType = target.value;
  }

  if (target.matches("[data-construction-id]")) {
    state.constructionId = target.value;
  }

  if (target.matches("[data-contract-term-id]")) {
    state.contractTermId = target.value;
  }

  if (target.matches("[data-tv-initial-id]")) {
    state.tvInitialId = target.value;
  }

  if (target.matches("[data-phone-initial-id]")) {
    state.phoneInitialId = target.value;
  }

  if (target.matches("[data-phone-service-id]")) {
    state.phoneServiceId = target.value;
    state.phoneInitialId = "";
  }

  if (target.matches("[data-softbank-ouchi-wari]")) {
    state.softbankOuchiWari = target.value === "yes";
  }

  if (target.matches("[data-option]")) {
    state[target.dataset.option] = target.checked;
  }

  normalizeState();
  saveState();
  render();
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.matches("[data-manual]")) {
    return;
  }

  state[target.dataset.manual] = sanitizeAmount(target.value);
  target.value = state[target.dataset.manual];
  saveState();
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaultState, ...(saved ?? {}) };
  } catch {
    return { ...defaultState };
  }
}

function clearLegacyState() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage access can be blocked in private contexts.
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage failures should not interrupt quote creation.
  }
}

function saveAndGo(page) {
  normalizeState();
  saveState();
  window.location.href = routes[page] ?? routes.provider;
}

function normalizeState() {
  if (!getProvider(state.providerId)) {
    state.providerId = "";
  }

  if (!state.homeType || !db.homeTypes?.[state.homeType]) {
    state.homeType = "home";
  }

  const provider = getProvider();
  if (!provider) {
    state.applicationType = "";
    resetOptionsForApplication();
    return;
  }

  if (state.applicationType && !provider.applications?.[state.applicationType]) {
    state.applicationType = "";
    resetOptionsForApplication();
  }

  if (provider.id !== "softbank") {
    state.softbankOuchiWari = false;
  }

  if (!getContractTerms(provider).length) {
    state.contractTermId = "";
  }

  setDefaultsForSelection();
}

function guardPage() {
  if (currentPage === "application" && !state.providerId) {
    window.location.replace(routes.provider);
    return true;
  }

  if (["options", "result"].includes(currentPage) && (!state.providerId || !state.applicationType)) {
    window.location.replace(state.providerId ? routes.application : routes.provider);
    return true;
  }

  return false;
}

function resetOptionsForApplication() {
  state.contractTermId = "";
  state.homeType = "home";
  state.constructionId = "";
  state.phone = false;
  state.phoneServiceId = "";
  state.phoneInitialId = "";
  state.softbankOuchiWari = false;
  state.tv = false;
  state.tvInitialId = "";
  state.manualInitial = "";
  state.manualMonthly = "";
}

function setDefaultsForSelection() {
  const provider = getProvider();
  if (!provider || !state.applicationType) {
    return;
  }

  const app = provider.applications[state.applicationType];
  const constructionOptions = app?.constructionOptions ?? [];
  if (!constructionOptions.some((option) => option.id === state.constructionId)) {
    state.constructionId = getDefaultOption(constructionOptions)?.id ?? "";
  }

  const contractTerms = getContractTerms(provider);
  if (!contractTerms.some((term) => term.id === state.contractTermId)) {
    state.contractTermId = getDefaultOption(contractTerms)?.id ?? "";
  }

  const tvOptions = provider.options?.tv?.initialOptions ?? [];
  if (!tvOptions.some((option) => option.id === state.tvInitialId)) {
    const preferred = tvOptions.find((option) => option.defaultFor?.includes(state.applicationType));
    state.tvInitialId = (preferred ?? getDefaultOption(tvOptions))?.id ?? "";
  }

  const phoneServices = getPhoneServices(provider);
  if (!phoneServices.some((service) => service.id === state.phoneServiceId)) {
    state.phoneServiceId = getDefaultOption(phoneServices)?.id ?? "";
  }

  const phoneOptions = getPhoneInitialOptions(provider);
  if (!phoneOptions.some((option) => option.id === state.phoneInitialId)) {
    const preferred = phoneOptions.find((option) => option.defaultFor?.includes(state.applicationType));
    state.phoneInitialId = (preferred ?? getDefaultOption(phoneOptions))?.id ?? "";
  }
}

function getDefaultOption(options) {
  return options.find((option) => option.default) ?? options[0];
}

function getProvider(id = state.providerId) {
  return db.providers?.find((provider) => provider.id === id);
}

function getApplication(provider = getProvider()) {
  return provider?.applications?.[state.applicationType];
}

function getContractTerms(provider = getProvider()) {
  return (provider?.contractTerms ?? []).filter(
    (term) => !term.applicationTypes?.length || term.applicationTypes.includes(state.applicationType),
  );
}

function getContractTerm(provider = getProvider()) {
  const terms = getContractTerms(provider);
  return terms.find((term) => term.id === state.contractTermId) ?? getDefaultOption(terms);
}

function getMonthlyPlanForTerm(term, homeType = state.homeType) {
  return term?.monthly?.[state.applicationType]?.[homeType] ?? term?.monthly?.[homeType];
}

function getMonthlyPlan(provider = getProvider()) {
  return getMonthlyPlanForTerm(getContractTerm(provider)) ?? provider?.monthly?.[state.homeType] ?? { regular: 0, label: "" };
}

function getConstructionOption(provider = getProvider()) {
  const options = getApplication(provider)?.constructionOptions ?? [];
  return options.find((option) => option.id === state.constructionId) ?? getDefaultOption(options);
}

function getTvInitialOption(provider = getProvider()) {
  const options = provider?.options?.tv?.initialOptions ?? [];
  return options.find((option) => option.id === state.tvInitialId) ?? getDefaultOption(options);
}

function getPhoneServices(provider = getProvider()) {
  const phone = provider?.options?.phone;
  if (!phone) {
    return [];
  }

  if (Array.isArray(phone.services) && phone.services.length) {
    return phone.services;
  }

  return [
    {
      id: "default",
      name: phone.name,
      monthly: phone.monthly ?? 0,
      note: phone.note,
      initialCost: phone.initialCost,
      initialOptions: phone.initialOptions ?? [],
      default: true,
    },
  ];
}

function getPhoneService(provider = getProvider()) {
  const services = getPhoneServices(provider);
  return services.find((service) => service.id === state.phoneServiceId) ?? getDefaultOption(services);
}

function getPhoneInitialOptions(provider = getProvider()) {
  const options = getPhoneService(provider)?.initialOptions ?? [];
  return options.filter(
    (option) => !option.applicationTypes?.length || option.applicationTypes.includes(state.applicationType),
  );
}

function getPhoneInitialOption(provider = getProvider()) {
  const options = getPhoneInitialOptions(provider);
  return options.find((option) => option.id === state.phoneInitialId) ?? getDefaultOption(options);
}

function getPhoneInitialAmount(option) {
  if (!option) {
    return 0;
  }

  return option.amountByApplication?.[state.applicationType] ?? option.amount ?? 0;
}

function getPhoneMonthly(service = getPhoneService()) {
  if (!service) {
    return 0;
  }

  if (state.softbankOuchiWari && service.ouchiWariMonthly != null) {
    return service.ouchiWariMonthly;
  }

  return service.monthly ?? 0;
}

function getPhoneLabel(service = getPhoneService()) {
  if (!service) {
    return "";
  }

  if (state.softbankOuchiWari && service.ouchiWariLabel) {
    return service.ouchiWariLabel;
  }

  return service.name;
}

function calculateQuote() {
  const provider = getProvider();
  const app = getApplication(provider);
  const monthlyPlan = getMonthlyPlan(provider);
  const construction = getConstructionOption(provider);
  const phone = getPhoneService(provider);
  const phoneInitial = getPhoneInitialOption(provider);
  const tv = provider?.options?.tv;
  const tvInitial = getTvInitialOption(provider);
  const manualInitial = toNumber(state.manualInitial);
  const manualMonthly = toNumber(state.manualMonthly);

  const initialLines = [];
  const monthlyLines = [];
  const installmentLines = [];

  if (app?.adminFee) {
    initialLines.push({ label: app.adminLabel ?? "契約事務手数料", amount: app.adminFee });
  }

  if (app?.sourceProviderChangeFee?.amount) {
    initialLines.push({
      label: app.sourceProviderChangeFee.label ?? "移転元の事業者変更手数料（最大目安）",
      amount: app.sourceProviderChangeFee.amount,
      note: app.sourceProviderChangeFee.note,
    });
  }

  if (construction) {
    initialLines.push({ label: construction.label, amount: construction.amount, note: construction.note });
    if (construction.installment) {
      installmentLines.push({
        label: construction.installment.label ?? construction.label,
        amount: construction.installment.monthly,
        months: construction.installment.months,
      });
    }
  }

  for (const option of provider?.initialRequiredOptions ?? []) {
    initialLines.push({
      label: `初期加入オプション: ${option.name}`,
      amount: option.amount,
      note: option.note,
    });
  }

  if (state.phone && phone) {
    monthlyLines.push({
      label: getPhoneLabel(phone),
      amount: getPhoneMonthly(phone),
      note: state.softbankOuchiWari ? phone.ouchiWariNote : undefined,
    });
    if (phoneInitial) {
      initialLines.push({
        label: `${getPhoneLabel(phone)} 初期費用（${phoneInitial.label}）`,
        amount: getPhoneInitialAmount(phoneInitial),
        note: phoneInitial.note,
      });
    } else if (phone.initialCost) {
      initialLines.push({ label: `${getPhoneLabel(phone)} 初期費用`, amount: phone.initialCost });
    }
  }

  if (state.tv && tv) {
    monthlyLines.push({ label: tv.name, amount: tv.monthly });
    if (tvInitial) {
      initialLines.push({ label: tvInitial.label, amount: tvInitial.amount, note: tvInitial.note });
    }
  }

  if (manualInitial > 0) {
    initialLines.push({ label: "その他初期費用", amount: manualInitial });
  }

  const baseMonthlyAmount = monthlyPlan.quoteAmount ?? monthlyPlan.regular ?? 0;
  const baseMonthlyLabel = [
    provider?.name ?? "",
    monthlyPlan.label ?? "",
    monthlyPlan.quoteLabel ? `（${monthlyPlan.quoteLabel}）` : "",
  ].filter(Boolean).join(" ");
  monthlyLines.unshift({
    label: baseMonthlyLabel,
    amount: baseMonthlyAmount,
    note: monthlyPlan.quoteNote,
  });

  if (manualMonthly > 0) {
    monthlyLines.push({ label: "その他月額費用", amount: manualMonthly });
  }

  const initialTotal = initialLines.reduce((total, line) => total + line.amount, 0);
  const monthlyTotal = monthlyLines.reduce((total, line) => total + line.amount, 0);

  return {
    provider,
    app,
    monthlyPlan,
    construction,
    initialLines,
    monthlyLines,
    installmentLines,
    initialTotal,
    monthlyTotal,
  };
}

function render() {
  renderProgress();
  renderSavedPanel();

  if (currentPage === "provider") {
    renderProviderPage();
  } else if (currentPage === "application") {
    renderApplicationPage();
  } else if (currentPage === "options") {
    renderOptionsPage();
  } else {
    renderResultPage();
  }
}

function renderProgress() {
  const activeIndex = steps.findIndex((step) => step.id === currentPage);
  progress.innerHTML = steps
    .map((step, index) => {
      const canOpen =
        step.id === "provider" ||
        (step.id === "application" && state.providerId) ||
        (["options", "result"].includes(step.id) && state.providerId && state.applicationType);
      const className = [
        "progress-step",
        index === activeIndex ? "is-active" : "",
        index < activeIndex ? "is-complete" : "",
        canOpen ? "" : "is-disabled",
      ]
        .filter(Boolean)
        .join(" ");
      const content = `
        <span>STEP ${index + 1}</span>
        <strong>${step.label}</strong>
      `;
      return canOpen
        ? `<a class="${className}" href="${step.route}">${content}</a>`
        : `<span class="${className}">${content}</span>`;
    })
    .join("");
}

function renderSavedPanel() {
  const provider = getProvider();
  const app = getApplication(provider);
  const homeType = db.homeTypes?.[state.homeType]?.label ?? "未選択";
  const contractTerm = getContractTerm(provider);
  const homeDetail = [homeType, contractTerm?.label].filter(Boolean).join(" / ");
  const phoneService = state.phone ? getPhoneService(provider) : null;
  const phoneInitial = state.phone ? getPhoneInitialOption(provider) : null;
  const phoneBundle = state.phone && state.softbankOuchiWari ? "おうち割指定オプション" : "";
  const phoneDetail = [phoneService?.name, phoneBundle, phoneInitial?.label].filter(Boolean).join(" / ");
  const optionText = [
    state.phone ? `固定電話あり${phoneDetail ? `（${phoneDetail}）` : ""}` : "固定電話なし",
    state.tv ? "光テレビあり" : "光テレビなし",
  ].join(" / ");

  savedPanel.innerHTML = `
    <h2>保存済みの選択</h2>
    <div class="saved-grid">
      <div>
        <span>会社</span>
        <strong>${provider?.name ?? "未選択"}</strong>
      </div>
      <div>
        <span>申込区分</span>
        <strong>${app?.label ?? "未選択"}</strong>
      </div>
      <div>
        <span>住居タイプ</span>
        <strong>${provider && app ? homeDetail : "未選択"}</strong>
      </div>
      <div>
        <span>オプション</span>
        <strong>${provider && app ? optionText : "未選択"}</strong>
      </div>
    </div>
  `;
}

function renderProviderPage() {
  root.innerHTML = `
    <div class="step-inner">
      <div class="step-heading">
        <div>
          <h2>会社を選択</h2>
          <p>最初にお客様へ案内する回線会社を選びます。選択すると次のページへ進みます。</p>
        </div>
      </div>
      <div class="card-grid provider-list">
        ${db.providers.map(renderProviderCard).join("")}
      </div>
    </div>
  `;
}

function renderProviderCard(provider) {
  const homePrice = provider.monthly?.home?.regular ?? 0;
  const mansionPrice = provider.monthly?.mansion?.regular ?? 0;
  return `
    <button class="select-card ${provider.id === state.providerId ? "is-selected" : ""}" style="--card-accent: ${provider.accent}" type="button" data-provider-id="${provider.id}">
      <span class="card-top">
        <span class="brand-mark">${provider.mark}</span>
      </span>
      <span class="card-title">
        <span class="meta-label">${provider.contractLabel}</span>
        <h3>${provider.name}</h3>
        <p>${provider.planName}</p>
      </span>
      <span class="price-pair">
        <span>
          <span>戸建て月額</span>
          <strong>${formatYen(homePrice)}</strong>
        </span>
        <span>
          <span>マンション月額</span>
          <strong>${formatYen(mansionPrice)}</strong>
        </span>
      </span>
      <p>${provider.description}</p>
    </button>
  `;
}

function renderApplicationPage() {
  const provider = getProvider();
  root.innerHTML = `
    <div class="step-inner">
      <div class="step-heading">
        <div>
          <h2>${provider.name}の申込区分</h2>
          <p>新規か事業者変更かを選択します。選択すると内容を保存してオプション選択ページへ進みます。</p>
        </div>
        <a class="button" href="${routes.provider}">会社を変更</a>
      </div>
      <div class="card-grid two-columns">
        ${Object.entries(provider.applications).map(([id, application]) => renderApplicationCard(id, application)).join("")}
      </div>
      <div class="actions">
        <a class="button" href="${routes.provider}">戻る</a>
        <button class="button danger" type="button" data-reset>最初からやり直す</button>
      </div>
    </div>
  `;
}

function renderApplicationCard(id, application) {
  const defaultConstruction = getDefaultOption(application.constructionOptions ?? []);
  const initial =
    (application.adminFee ?? 0) +
    (application.sourceProviderChangeFee?.amount ?? 0) +
    (defaultConstruction?.amount ?? 0);
  return `
    <button class="select-card ${id === state.applicationType ? "is-selected" : ""}" type="button" data-application-type="${id}">
      <span class="card-title">
        <h3>${application.label}</h3>
        <p>${application.description}</p>
      </span>
      <span class="price-pair">
        <span>
          <span>手数料</span>
          <strong>${formatYen(application.adminFee ?? 0)}</strong>
        </span>
        <span>
          <span>工事費目安</span>
          <strong>${formatYen(defaultConstruction?.amount ?? 0)}</strong>
        </span>
      </span>
      <span class="mini-stat">
        <span>初期費用目安</span>
        <strong>${formatYen(initial)}</strong>
      </span>
    </button>
  `;
}

function renderOptionsPage() {
  const provider = getProvider();
  const app = getApplication(provider);
  root.innerHTML = `
    <div class="step-inner">
      <div class="step-heading">
        <div>
          <h2>${provider.name} / ${app.label} の条件</h2>
          <p>ここで選んだ内容を保存して、結果ページでまとめて金額を計算します。</p>
        </div>
        <a class="button" href="${routes.application}">申込区分を変更</a>
      </div>
      <div class="option-stack">
        ${renderHomeTypeSection()}
        ${renderContractTermSection(provider)}
        ${renderConstructionSection(app)}
        ${renderInitialRequiredOptionsSection(provider)}
        ${renderOptionSection(provider)}
        ${renderAdjustmentSection()}
      </div>
      <div class="actions">
        <a class="button" href="${routes.application}">戻る</a>
        <button class="button primary" type="button" data-continue="result">保存して見積もりへ</button>
        <button class="button danger" type="button" data-reset>最初からやり直す</button>
      </div>
    </div>
  `;
}

function renderInitialRequiredOptionsSection(provider) {
  const options = provider.initialRequiredOptions ?? [];
  if (!options.length) {
    return "";
  }

  const total = options.reduce((sum, option) => sum + option.amount, 0);
  return `
    <section class="form-section required-options">
      <h3>初期加入オプション</h3>
      <p class="section-note">${provider.name}は以下の初期加入オプションを初期費用に加算します。</p>
      <div class="required-option-list">
        ${options
          .map((option) => `
            <div>
              <span>${option.name}</span>
              <strong>${formatYen(option.amount)}</strong>
            </div>
          `)
          .join("")}
        <div class="required-option-total">
          <span>合計</span>
          <strong>${formatYen(total)}</strong>
        </div>
      </div>
    </section>
  `;
}

function renderHomeTypeSection() {
  return `
    <section class="form-section">
      <h3>住居タイプ</h3>
      <div class="choice-row">
        ${Object.entries(db.homeTypes)
          .map(([id, homeType]) => `
            <label class="radio-card">
              <span class="choice-label">
                <input type="radio" name="home-type" value="${id}" data-home-type ${state.homeType === id ? "checked" : ""} />
                ${homeType.label}
              </span>
              <span class="choice-note">${homeType.description}</span>
            </label>
          `)
          .join("")}
      </div>
    </section>
  `;
}

function renderContractTermSection(provider) {
  const terms = getContractTerms(provider);
  if (!terms.length) {
    return "";
  }

  return `
    <section class="form-section">
      <h3>契約プラン</h3>
      <div class="choice-row">
        ${terms
          .map((term) => {
            const monthlyPlan = getMonthlyPlanForTerm(term);
            const displayAmount = monthlyPlan?.quoteAmount ?? monthlyPlan?.regular ?? 0;
            return `
              <label class="radio-card">
                <span class="choice-label">
                  <input type="radio" name="contract-term" value="${term.id}" data-contract-term-id ${state.contractTermId === term.id ? "checked" : ""} />
                  ${term.label}
                </span>
                <span class="option-price">${formatYen(displayAmount)} / 月</span>
                <span class="choice-note">${monthlyPlan?.summary ?? term.note ?? ""}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderConstructionSection(application) {
  return `
    <section class="form-section">
      <h3>回線工事</h3>
      <div class="choice-row">
        ${(application.constructionOptions ?? [])
          .map((option) => `
            <label class="radio-card">
              <span class="choice-label">
                <input type="radio" name="construction" value="${option.id}" data-construction-id ${state.constructionId === option.id ? "checked" : ""} />
                ${option.label}
              </span>
              <span class="option-price">${formatYen(option.amount)}</span>
              <span class="choice-note">${option.note ?? ""}</span>
            </label>
          `)
          .join("")}
      </div>
    </section>
  `;
}

function renderOptionSection(provider) {
  const phoneConfig = provider.options?.phone;
  const phoneServices = getPhoneServices(provider);
  const phone = getPhoneService(provider) ?? phoneServices[0] ?? phoneConfig;
  const hasMultiplePhoneServices = phoneServices.length > 1;
  const hasSoftbankOuchiWari = provider.id === "softbank";
  const tv = provider.options?.tv;
  const phoneInitialOptions = getPhoneInitialOptions(provider);
  return `
    <section class="form-section">
      <h3>固定電話・光テレビ</h3>
      <div class="choice-row">
        <label class="check-card">
          <span class="choice-label">
            <input type="checkbox" data-option="phone" ${state.phone ? "checked" : ""} />
            ${hasMultiplePhoneServices ? "固定電話サービス" : phone.name}
          </span>
          <span class="option-price">+${formatYen(getPhoneMonthly(phone))} / 月</span>
          <span class="choice-note">${hasMultiplePhoneServices ? phoneConfig.note : phone.note}</span>
        </label>
        <label class="check-card">
          <span class="choice-label">
            <input type="checkbox" data-option="tv" ${state.tv ? "checked" : ""} />
            ${tv.name}
          </span>
          <span class="option-price">+${formatYen(tv.monthly)} / 月</span>
          <span class="choice-note">${tv.note}</span>
        </label>
      </div>
      ${
        hasMultiplePhoneServices
          ? `
            <div class="nested-options ${state.phone ? "" : "is-hidden"}">
              <h3>電話サービス</h3>
              <div class="choice-row">
                ${phoneServices
                  .map((service) => `
                    <label class="radio-card">
                      <span class="choice-label">
                        <input type="radio" name="phone-service" value="${service.id}" data-phone-service-id ${phone.id === service.id ? "checked" : ""} />
                        ${service.name}
                      </span>
                      <span class="option-price">+${formatYen(getPhoneMonthly(service))} / 月</span>
                      <span class="choice-note">${service.note ?? ""}</span>
                    </label>
                  `)
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
      ${
        hasSoftbankOuchiWari
          ? `
            <div class="nested-options ${state.phone ? "" : "is-hidden"}">
              <h3>おうち割 光セット</h3>
              <div class="choice-row">
                <label class="radio-card">
                  <span class="choice-label">
                    <input type="radio" name="softbank-ouchi-wari" value="no" data-softbank-ouchi-wari ${state.softbankOuchiWari ? "" : "checked"} />
                    通常オプション
                  </span>
                  <span class="option-price">${formatYen(phone.monthly ?? 0)} / 月</span>
                  <span class="choice-note">選択した電話サービス単体の月額で計算します。</span>
                </label>
                <label class="radio-card">
                  <span class="choice-label">
                    <input type="radio" name="softbank-ouchi-wari" value="yes" data-softbank-ouchi-wari ${state.softbankOuchiWari ? "checked" : ""} />
                    おうち割指定オプション
                  </span>
                  <span class="option-price">${formatYen(phone.ouchiWariMonthly ?? phone.monthly ?? 0)} / 月</span>
                  <span class="choice-note">${phone.ouchiWariNote ?? "おうち割 光セットに必要な指定オプションのセット料金で計算します。"}</span>
                </label>
              </div>
            </div>
          `
          : ""
      }
      <div class="nested-options ${state.phone ? "" : "is-hidden"}">
        <h3>${getPhoneLabel(phone)}の初期費用</h3>
        <div class="choice-row">
          ${phoneInitialOptions
            .map((option) => `
              <label class="radio-card">
                <span class="choice-label">
                  <input type="radio" name="phone-initial" value="${option.id}" data-phone-initial-id ${state.phoneInitialId === option.id ? "checked" : ""} />
                  ${option.label}
                </span>
                <span class="option-price">${formatYen(getPhoneInitialAmount(option))}</span>
                <span class="choice-note">${option.note ?? ""}</span>
              </label>
            `)
            .join("")}
        </div>
      </div>
      <div class="nested-options ${state.tv ? "" : "is-hidden"}">
        <h3>光テレビの初期費用</h3>
        <div class="choice-row">
          ${(tv.initialOptions ?? [])
            .map((option) => `
              <label class="radio-card">
                <span class="choice-label">
                  <input type="radio" name="tv-initial" value="${option.id}" data-tv-initial-id ${state.tvInitialId === option.id ? "checked" : ""} />
                  ${option.label}
                </span>
                <span class="option-price">${formatYen(option.amount)}</span>
                <span class="choice-note">${option.note ?? ""}</span>
              </label>
            `)
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderAdjustmentSection() {
  return `
    <section class="form-section">
      <h3>その他の調整費用</h3>
      <div class="input-grid">
        <label class="form-field">
          <span>その他初期費用</span>
          <input type="text" inputmode="numeric" data-manual="manualInitial" value="${state.manualInitial}" placeholder="例: 3300" />
        </label>
        <label class="form-field">
          <span>その他月額費用</span>
          <input type="text" inputmode="numeric" data-manual="manualMonthly" value="${state.manualMonthly}" placeholder="例: 550" />
        </label>
      </div>
    </section>
  `;
}

function renderResultPage() {
  const quote = calculateQuote();
  const contractTerm = getContractTerm(quote.provider);
  const selectedSummary = [quote.provider.name, quote.app.label, db.homeTypes[state.homeType].label, contractTerm?.label]
    .filter(Boolean)
    .join(" / ");
  root.innerHTML = `
    <div class="step-inner">
      <div class="step-heading">
        <div>
          <h2>${quote.provider.name}の見積もり</h2>
          <p>${selectedSummary} の保存データから計算しています。</p>
        </div>
        <a class="button" href="${routes.options}">条件を変更</a>
      </div>
      <section class="final-totals" aria-label="見積もり合計">
        <div>
          <span>初期費用合計</span>
          <strong>${formatYen(quote.initialTotal)}</strong>
        </div>
        <div>
          <span>月額ランニングコスト</span>
          <strong>${formatYen(quote.monthlyTotal)}</strong>
        </div>
      </section>
      ${renderImportantNotices(quote.provider)}
      <div class="result-grid">
        ${renderCostCard("初期費用", quote.initialLines, quote.initialTotal)}
        ${renderCostCard("月額ランニングコスト", quote.monthlyLines, quote.monthlyTotal)}
      </div>
      ${quote.installmentLines.length ? renderInstallmentBand(quote.installmentLines) : ""}
      ${renderMonthlyPeriods(quote.monthlyPlan)}
      ${renderMonthlyBenefits(quote.monthlyPlan)}
      <div class="detail-layout result-notes">
        <section class="form-section">
          <h3>注意メモ</h3>
          <ul class="note-list">
            ${db.assumptions.map((note) => `<li>${note}</li>`).join("")}
            ${quote.provider.notes.map((note) => `<li>${note}</li>`).join("")}
          </ul>
        </section>
        <section class="form-section">
          <h3>料金データの出典</h3>
          <ul class="source-list">
            ${quote.provider.sources
              .map((source) => `<li>${source.url ? `<a href="${source.url}" target="_blank" rel="noreferrer">${source.label}</a>` : `<span>${source.label}</span>`}</li>`)
              .join("")}
          </ul>
        </section>
      </div>
      <div class="actions">
        <a class="button" href="${routes.options}">条件を変更</a>
        <button class="button primary" type="button" data-print>印刷</button>
        <button class="button danger" type="button" data-reset>最初からやり直す</button>
      </div>
    </div>
  `;
}

function renderCostCard(title, lines, total) {
  return `
    <section class="result-card">
      <h3>${title}</h3>
      <table class="cost-table">
        <tbody>
          ${lines
            .map((line) => `
              <tr>
                <th>${line.label}${line.note ? `<br><span class="choice-note">${line.note}</span>` : ""}</th>
                <td>${formatYen(line.amount)}</td>
              </tr>
            `)
            .join("")}
          <tr class="total">
            <th>合計</th>
            <td>${formatYen(total)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function renderImportantNotices(provider) {
  const notices = provider?.importantNotices ?? [];
  if (!notices.length) {
    return "";
  }

  return `
    <section class="important-notice" aria-label="重要注意事項">
      ${notices.map((notice) => `<p>${notice}</p>`).join("")}
    </section>
  `;
}

function renderInstallmentBand(lines) {
  return `
    <div class="info-band">
      ${lines
        .map((line) => `<span><strong>${line.label}</strong>を分割にする場合: ${formatYen(line.amount)} / 月 × ${line.months}回</span>`)
        .join("")}
    </div>
  `;
}

function renderMonthlyPeriods(monthlyPlan) {
  if (!monthlyPlan?.periods?.length) {
    return "";
  }

  return `
    <div class="info-band">
      ${monthlyPlan.periods
        .map((period) => `<span><strong>${period.label}</strong>: ${formatYen(period.amount)} / 月${period.note ? `（${period.note}）` : ""}</span>`)
        .join("")}
    </div>
  `;
}

function renderMonthlyBenefits(monthlyPlan) {
  if (!monthlyPlan?.benefits?.length) {
    return "";
  }

  return `
    <div class="info-band benefit-band">
      ${monthlyPlan.benefits
        .map((benefit) => `<span><strong>${benefit.label}</strong>: ${formatYen(benefit.amount)}分${benefit.note ? `（${benefit.note}）` : ""}</span>`)
        .join("")}
    </div>
  `;
}

function sanitizeAmount(value) {
  return String(value).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatYen(value) {
  return yenFormatter.format(Math.max(0, Math.round(value)));
}
