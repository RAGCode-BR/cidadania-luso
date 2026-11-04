export const TEAM = [
  { id: "equipe", name: "Equipe Luso", initials: "LU" },
];
export const STAGES = {
  prospecting: "Prospecção",
  relationship: "Relacionamento",
  closing: "Fechamento",
};
export const originLabel = (source) => source === "manual" ? "Obra cadastrada" : "Visita à obra";
export const emptyData = () => ({
  version: 1,
  products: [],
  works: [],
  visits: [],
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
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
export const productName = (name) =>
  String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
export const catalogProducts = (data) =>
  (data.products || []).filter((item) => !item.deleted);
export const productNames = (data) =>
  catalogProducts(data).map((item) => item.name);
export const uid = () => crypto.randomUUID();
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
  type: "Residencial",
  ...newAddress(),
  offered: [],
  sold: [],
  saleValue: "",
  stage: "prospecting",
  notes: "",
  nextAction: "",
  photos: [],
  crmEnabled: true,
  crmOpportunityId: "",
  crmSaleId: "",
  sellerId: "",
});

export function validateVisit(visit, allowedProducts) {
  if (!visit.date || visit.date > today())
    throw new Error("Informe uma data de visita até hoje.");
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
}

// Atualiza a obra e registra a visita em uma única alteração, persistida atomicamente.
export function recordVisit(data, draft, { visitId = uid(), workId = uid() } = {}) {
  validateVisit(draft, [
    ...productNames(data),
    ...(data.crm?.sales.find((sale) => sale.id === draft.crmSaleId)?.products ||
      []),
  ]);
  const existing = data.works.find((item) => item.id === draft.workId && !item.deleted);
  if (draft.workId && !existing)
    throw new Error("A obra selecionada não está mais disponível.");
  const work = {
    ...(existing || {}),
    id: existing?.id || workId,
    name: draft.workName.trim(),
    responsible: draft.responsible.trim(),
    phone: draft.phone.trim(),
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
    source: "visit",
    id: visitId,
    workId: work.id,
    workName: work.name,
    stage: draft.stage,
    saleValue: Number(draft.saleValue) || 0,
    createdAt: new Date().toISOString(),
  };
  return {
    ...data,
    works: existing
      ? data.works.map((item) => (item.id === work.id ? work : item))
      : [...data.works, work],
    visits: [...data.visits, visit],
  };
}
