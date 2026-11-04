export const PRODUCTS = [];
export const TEAM = [
  { id: "equipe", name: "Equipe Luso", initials: "LU" },
];
export const STAGES = {
  prospecting: "Prospecção",
  relationship: "Relacionamento",
  closing: "Fechamento",
};
export const contactOrigin = (record) => record?.source === "lead" ? "lead" : "visit";
export const originLabel = (source) => source === "lead" ? "Telefone" : source === "manual" ? "Obra cadastrada" : "Visita à obra";
export const emptyData = () => ({
  version: 1,
  products: [],
  works: [],
  contacts: [],
  visits: [],
  plans: [],
});
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dateLabel = (value) =>
  value
    ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")
    : "—";
export const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );
export const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
export const productKey = (name) => normalize(name).replace(/\s+/g, " ");
export const productName = (name) =>
  String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
// IDs estáveis permitem editar e excluir também os produtos do catálogo inicial.
export const DEFAULT_PRODUCTS = PRODUCTS.map((name, index) => ({
  id: `fa0ac000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name,
}));
export const catalogProducts = (data, includeDeleted = false) => {
  const rows = new Map(DEFAULT_PRODUCTS.map((item) => [item.id, item]));
  for (const item of data.products || []) rows.set(item.id, item);
  return [...rows.values()].filter((item) => includeDeleted || !item.deleted);
};
export const productNames = (data) =>
  catalogProducts(data).map((item) => item.name);
export function saveProduct(data, product) {
  const current = catalogProducts(data, true).find(
    (item) => item.id === product.id,
  );
  if (current?.deleted) throw new Error("Este produto já foi excluído.");
  const name = productName(product.name);
  if (!name || name.length > 80)
    throw new Error("Informe um nome de até 80 caracteres.");
  if (
    catalogProducts(data).some(
      (item) =>
        item.id !== product.id && productKey(item.name) === productKey(name),
    )
  )
    throw new Error("Já existe um produto com esse nome.");
  const record = { ...current, ...product, name };
  return {
    ...data,
    products: [
      ...(data.products || []).filter((item) => item.id !== record.id),
      record,
    ],
  };
}
export function deleteContact(data, id) {
  const contact = data.contacts.find((item) => item.id === id && !item.deleted);
  if (!contact) throw new Error("Este contato já foi excluído.");
  return {
    ...data,
    contacts: data.contacts.map((item) =>
      item.id === id ? { ...item, deleted: true } : item,
    ),
  };
}
export const uid = () => crypto.randomUUID();
export const serviceNumber = (number) =>
  number ? `OS-${String(number).padStart(6, "0")}` : "";
export const person = (id) =>
  TEAM.find((item) => item.id === id)?.name || "Não informado";
export const addressLabel = (item) =>
  [item.street, item.number, item.neighborhood, item.city, item.state]
    .filter(Boolean)
    .join(", ");
export const newAddress = () => ({
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
});
export const newVisit = (userId) => ({
  workId: "",
  workName: "",
  date: today(),
  userId,
  source: "visit",
  responsible: "",
  phone: "",
  contractorId: "",
  architectId: "",
  type: "Residencial",
  ...newAddress(),
  offered: [],
  sold: [],
  saleValue: "",
  stage: "prospecting",
  notes: "",
  nextAction: "",
  scheduleNext: false,
  nextDate: "",
  photos: [],
  crmEnabled: true,
  crmOpportunityId: "",
  crmSaleId: "",
  sellerId: "",
});
export const newLead = (userId) => ({ ...newVisit(userId), source: "lead" });

export function validateVisit(visit, allowedProducts = PRODUCTS) {
  if (visit.source !== undefined && !["visit", "lead"].includes(visit.source))
    throw new Error("Origem do registro inválida.");
  if (!visit.date || visit.date > today())
    throw new Error(
      "Informe uma data de visita até hoje. Para datas futuras, use a programação.",
    );
  if (!TEAM.some((user) => user.id === visit.userId))
    throw new Error("Selecione um colaborador.");
  if (visit.sellerId && !TEAM.some((user) => user.id === visit.sellerId))
    throw new Error("Selecione um vendedor válido.");
  if (!visit.workName.trim())
    throw new Error("Informe o nome ou uma identificação da obra.");
  if (
    !visit.street.trim() ||
    !visit.neighborhood.trim() ||
    !visit.city.trim() ||
    !/^[A-Z]{2}$/.test(visit.state)
  )
    throw new Error(
      "Preencha rua, bairro, cidade e UF. O bairro é obrigatório.",
    );
  if (visit.phone.trim() && !/^\d{10,11}$/.test(visit.phone.replace(/\D/g, "")))
    throw new Error(
      "Informe um telefone com DDD, de 10 ou 11 dígitos, ou deixe em branco para completar depois.",
    );
  if (!["Comercial", "Residencial"].includes(visit.type))
    throw new Error("Selecione o tipo de obra.");
  if (!Object.hasOwn(STAGES, visit.stage))
    throw new Error("Selecione o tipo de visita.");
  if (visit.stage !== "relationship" && !visit.offered.length)
    throw new Error("Selecione pelo menos um produto oferecido.");
  if (
    [...visit.offered, ...visit.sold].some(
      (product) => !allowedProducts.includes(product),
    )
  )
    throw new Error("Produto inválido.");
  if (visit.sold.some((product) => !visit.offered.includes(product)))
    throw new Error(
      "Os produtos vendidos também devem estar entre os oferecidos.",
    );
  if (Number(visit.saleValue) < 0 || !Number.isFinite(Number(visit.saleValue)))
    throw new Error("Informe um valor de venda válido.");
  if (Number(visit.saleValue) > 0 && !visit.sold.length)
    throw new Error("Selecione o produto vendido antes de informar o valor.");
  if (
    visit.stage !== "closing" &&
    (visit.sold.length || Number(visit.saleValue) > 0)
  )
    throw new Error("Vendas só podem ser registradas em visitas de fechamento.");
  if (visit.stage === "closing" && !visit.sold.length)
    throw new Error(
      "Para registrar um fechamento, selecione ao menos um produto vendido.",
    );
  if (
    visit.scheduleNext &&
    (!visit.nextDate || visit.nextDate < today() || visit.nextDate < visit.date)
  )
    throw new Error("Informe uma data válida para a próxima visita.");
}

// Cria obra, visita e programação em uma única alteração, persistida atomicamente.
export function recordVisit(
  data,
  draft,
  { visitId = uid(), workId = uid(), planId = uid() } = {},
) {
  validateVisit(draft, [
    ...productNames(data),
    ...(data.crm?.sales.find((sale) => sale.id === draft.crmSaleId)?.products ||
      []),
  ]);
  const existing = data.works.find((item) => item.id === draft.workId && !item.deleted);
  const sharedWork = data.crm?.opportunities.find(
    (item) => item.id === draft.crmOpportunityId,
  )?.work;
  if (draft.workId && !existing)
    throw new Error("A obra selecionada não está mais disponível.");
  for (const key of ["architectId", "contractorId"]) {
    if (
      draft[key] &&
      data.contacts.find((item) => item.id === draft[key])?.deleted &&
      existing?.[key] !== draft[key] &&
      sharedWork?.[key] !== draft[key]
    )
      throw new Error("Este contato foi excluído. Selecione outro contato.");
  }
  const work = {
    ...(existing || {}),
    id: existing?.id || workId,
    name: draft.workName.trim(),
    responsible: draft.responsible.trim(),
    phone: draft.phone.trim(),
    contractorId: draft.contractorId,
    architectId: draft.architectId,
    sellerId: draft.crmEnabled ? draft.sellerId || existing?.sellerId || "" : existing?.sellerId || "",
    type: draft.type,
    ...Object.fromEntries(
      Object.keys(newAddress()).map((key) => [key, draft[key].trim()]),
    ),
    updatedAt: new Date().toISOString(),
    ...(draft.crmOpportunityId
      ? { crmOpportunityId: draft.crmOpportunityId }
      : {}),
  };
  const visit = {
    ...draft,
    source: contactOrigin(draft),
    id: visitId,
    workId: work.id,
    workName: work.name,
    stage: draft.stage,
    saleValue: Number(draft.saleValue) || 0,
    contractorName:
      data.contacts.find((item) => item.id === draft.contractorId)?.name || "",
    architectName:
      data.contacts.find((item) => item.id === draft.architectId)?.name || "",
    createdAt: new Date().toISOString(),
  };
  const plans = data.plans.map((item) =>
    draft.planId === item.id ? { ...item, status: "completed", visitId } : item,
  );
  if (draft.scheduleNext) {
    const duplicate = plans.some(
      (item) =>
        item.status === "planned" &&
        item.workId === work.id &&
        item.userId === draft.userId &&
        item.date === draft.nextDate,
    );
    if (!duplicate)
      plans.push({
        id: planId,
        workId: work.id,
        workName: work.name,
        userId: draft.userId,
        date: draft.nextDate,
        notes: draft.nextAction,
        status: "planned",
      });
  }
  return {
    ...data,
    works: existing
      ? data.works.map((item) => (item.id === work.id ? work : item))
      : [...data.works, work],
    visits: [...data.visits, visit],
    plans,
  };
}

export function filterVisits(visits, filters) {
  return visits.filter(
    (visit) =>
      (!filters.source || contactOrigin(visit) === filters.source) &&
      (!filters.start || visit.date >= filters.start) &&
      (!filters.end || visit.date <= filters.end) &&
      (!filters.userId || visit.userId === filters.userId) &&
      (!filters.contractorId || visit.contractorId === filters.contractorId) &&
      (!filters.architectId || visit.architectId === filters.architectId) &&
      (!filters.neighborhood ||
        normalize(visit.neighborhood) === normalize(filters.neighborhood)) &&
      (!filters.type || visit.type === filters.type) &&
      (!filters.stage || visit.stage === filters.stage) &&
      (filters.outcome !== "sold" || visit.sold.length > 0) &&
      (filters.outcome !== "interest" ||
        visit.offered.some((product) => !visit.sold.includes(product))) &&
      (!filters.product ||
        (filters.outcome === "sold"
          ? visit.sold
          : filters.outcome === "interest"
            ? visit.offered.filter((item) => !visit.sold.includes(item))
            : visit.offered
        ).includes(filters.product)),
  );
}

export function summarize(visits, catalog = PRODUCTS) {
  const sales = visits.filter((item) => item.sold.length);
  const names = [
    ...new Set([...catalog, ...visits.flatMap((item) => item.offered)]),
  ];
  const products = names.map((name) => ({
    name,
    offered: visits.filter((item) => item.offered.includes(name)).length,
    sold: visits.filter((item) => item.sold.includes(name)).length,
    interest: visits.filter(
      (item) => item.offered.includes(name) && !item.sold.includes(name),
    ).length,
  }));
  const neighborhoods = [
    ...visits
      .reduce((result, item) => {
        // A cidade/UF evita juntar bairros homônimos de municípios diferentes.
        const key = normalize(
          `${item.neighborhood}|${item.city}|${item.state}`,
        );
        const row = result.get(key) || {
          key,
          name: item.neighborhood,
          city: `${item.city}/${item.state}`,
          visits: 0,
          sales: 0,
          interest: 0,
          value: 0,
        };
        row.visits++;
        row.sales += item.sold.length ? 1 : 0;
        row.interest += item.offered.some(
          (product) => !item.sold.includes(product),
        )
          ? 1
          : 0;
        row.value += item.saleValue;
        result.set(key, row);
        return result;
      }, new Map())
      .values(),
  ].sort(
    (a, b) =>
      b.sales - a.sales || b.interest - a.interest || b.visits - a.visits,
  );
  return {
    visits: visits.length,
    prospecting: visits.filter((item) => item.stage === "prospecting").length,
    sales: sales.length,
    value: sales.reduce((total, item) => total + item.saleValue, 0),
    works: new Set(visits.map((item) => item.workId)).size,
    conversion: visits.length
      ? Math.round((sales.length / visits.length) * 100)
      : 0,
    products,
    neighborhoods,
  };
}

export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function visitsCsv(visits) {
  const columns = [
    "Data",
    "Origem",
    "Colaborador",
    "Obra",
    "Responsável",
    "Telefone",
    "Empreiteiro",
    "Arquiteto",
    "Tipo de obra",
    "Rua",
    "Número",
    "Complemento",
    "Bairro",
    "Cidade",
    "UF",
    "CEP",
    "Tipo de visita",
    "Produtos oferecidos",
    "Produtos vendidos",
    "Interesse sem venda",
    "Valor da venda",
    "Observações",
    "Próxima ação",
  ];
  const rows = visits.map((item) => [
    dateLabel(item.date),
    originLabel(contactOrigin(item)),
    person(item.userId),
    item.workName,
    item.responsible,
    item.phone,
    item.contractorName,
    item.architectName,
    item.type,
    item.street,
    item.number,
    item.complement,
    item.neighborhood,
    item.city,
    item.state,
    item.cep,
    STAGES[item.stage],
    item.offered.join(", "),
    item.sold.join(", "),
    item.offered.filter((product) => !item.sold.includes(product)).join(", "),
    item.saleValue.toFixed(2).replace(".", ","),
    item.notes,
    item.nextAction,
  ]);
  return (
    "\uFEFF" +
    [columns, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")
  );
}
