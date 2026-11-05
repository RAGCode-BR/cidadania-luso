import { ATTENDANCE_CHANNELS, ATTENDANCE_KINDS, DATA_VERSION, emptyData, normalize, person, today, uid, validResponsible, validateClient } from "./domain.mjs";

export const CRM_STAGES = {
  prospecting: "Em prospecção",
  waiting: "Aguardando retorno",
  negotiating: "Em negociação",
  won: "Venda realizada",
  lost: "Sem negócio",
};
export const DEFAULT_CRM_STAGE_ORDER = Object.keys(CRM_STAGES);
export const crmStageOrder = (crm) => crm?.stageOrder || DEFAULT_CRM_STAGE_ORDER;
export const crmActiveStageIds = (crm) =>
  crmStageOrder(crm).filter((stage) => !["won", "lost"].includes(stage));
const firstActiveStage = (crm) => {
  const stages = crmActiveStageIds(crm);
  return stages.includes("prospecting") ? "prospecting" : stages[0];
};
export const emptyCrm = () => ({
  opportunities: [],
  activities: [],
  sales: [],
  stageLabels: { ...CRM_STAGES },
  stageOrder: [...DEFAULT_CRM_STAGE_ORDER],
});
export function changeCrmColumns(current, input, actor = { name: "Administração" }) {
  const crm = structuredClone(current || emptyCrm());
  const order = crmStageOrder(crm);
  const labels = crm.stageLabels || { ...CRM_STAGES };
  if (input.type === "add") {
    const name = text(input.name, 35);
    ensure(name, "Informe o nome da coluna.");
    ensure(order.length < 12, "O CRM permite até 12 colunas.");
    ensure(!order.some((id) => normalize(labels[id]) === normalize(name)), "Já existe uma coluna com esse nome.", 409);
    const id = `custom-${uid()}`;
    crm.stageLabels = { ...labels, [id]: name };
    crm.stageOrder = [...order];
    const closedIndex = crm.stageOrder.findIndex((stage) => ["won", "lost"].includes(stage));
    crm.stageOrder.splice(closedIndex < 0 ? crm.stageOrder.length : closedIndex, 0, id);
  } else if (input.type === "reorder") {
    ensure(
      Array.isArray(input.previousOrder) &&
        input.previousOrder.length === order.length &&
        input.previousOrder.every((id, index) => id === order[index]),
      "As colunas mudaram. Atualize o CRM e tente novamente.",
      409,
    );
    ensure(
      Array.isArray(input.order) &&
        input.order.length === order.length &&
        new Set(input.order).size === order.length &&
        input.order.every((id) => order.includes(id)),
      "Informe uma ordem válida para todas as colunas.",
    );
    crm.stageOrder = [...input.order];
  } else if (input.type === "delete") {
    ensure(order.includes(input.stage), "Coluna não encontrada.", 404);
    ensure(["won", "lost"].includes(input.stage) || crmActiveStageIds(crm).length > 1,
      "Mantenha ao menos uma coluna em andamento.");
    const destination = crmActiveStageIds(crm).find((stage) => stage !== input.stage);
    const at = new Date().toISOString();
    for (const item of crm.opportunities.filter((row) => !row.deleted && row.stage === input.stage && !closed(row))) {
      const from = item.stage;
      item.stage = destination;
      item.version++;
      item.updatedAt = at;
      activity(crm, item, actor, "updated", {
        from,
        to: destination,
        previousResponsibleId: item.responsibleId,
        responsibleId: item.responsibleId,
        nextAction: item.nextAction,
        nextDate: item.nextDate,
        note: `Coluna ${labels[from]} excluída. Cartão movido para ${labels[destination]}.`,
      }, at);
    }
    crm.stageOrder = order.filter((stage) => stage !== input.stage);
  } else ensure(false, "Ação de coluna inválida.");
  return crm;
}
export function createCrmOpportunity(current, clientInput, actor, { stage, responsibleId, at = new Date().toISOString() } = {}) {
  const crm = structuredClone(current || emptyCrm());
  stage ||= firstActiveStage(crm);
  ensure(crmActiveStageIds(crm).includes(stage), "Selecione uma coluna em andamento.");
  responsibleId ||= actor.teamId;
  ensure(team(responsibleId), "Selecione o usuário responsável.");
  const item = {
    id: uid(), client: validateClient(clientInput),
    stage, responsibleId,
    prospectorId: actor.teamId, products: [], pendingProducts: [],
    completedProducts: [], discardedProducts: [], cycle: 1,
    nextAction: "", nextDate: "", version: 1,
    createdAt: at, updatedAt: at, lastContactDate: "",
  };
  crm.opportunities.push(item);
  activity(crm, item, actor, "created", { note: "Oportunidade aberta." }, at);
  return crm;
}

// O histórico é decrescente. O atendimento é gravado antes da venda que ele gera,
// então a venda aparece logo acima do atendimento correspondente.
export const crmTimeline = (activities, opportunityId) =>
  activities
    .filter((event) => event.opportunityId === opportunityId)
    .sort((a, b) => b.sequence - a.sequence);
const unique = (items) => [...new Set(items)];
const closed = (item) => ["won", "lost"].includes(item.stage);
const ensure = (condition, message, status = 400) => {
  if (!condition) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
};
const team = validResponsible;
const dateValid = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(new Date(`${value}T12:00:00Z`).getTime()) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const text = (value, limit = 1000) => {
  ensure(
    typeof value === "string" && value.length <= limit,
    "Texto inválido ou muito longo.",
  );
  return value.trim();
};
const actorLabel = (actor) => actor.name || person(actor.teamId);
function activity(crm, opportunity, actor, type, details, at) {
  crm.activities.push({
    id: uid(),
    opportunityId: opportunity.id,
    sequence:
      crm.activities.filter((item) => item.opportunityId === opportunity.id)
        .length + 1,
    type,
    actorName: actorLabel(actor),
    actorTeamId: actor.teamId || null,
    at,
    ...details,
  });
}
function addSale(
  crm,
  opportunity,
  input,
  actor,
  at,
  sourceAttendanceId = null,
) {
  ensure(
    Array.isArray(input.products) &&
      input.products.length &&
      input.products.length <= 100 &&
      unique(input.products).length === input.products.length,
    "Selecione os produtos vendidos.",
  );
  ensure(team(input.sellerTeamId), "Selecione quem realizou a venda.");
  ensure(
    dateValid(input.date) && input.date <= today(),
    "Informe uma data de venda válida, até hoje.",
  );
  const value = Number(input.value);
  ensure(
    Number.isFinite(value) && value >= 0 && value <= 1_000_000_000,
    "Informe um valor de venda válido.",
  );
  ensure(
    input.products.every((name) =>
      opportunity.pendingProducts.includes(name),
    ),
    "Um produto já foi vendido ou não está nesta negociação. Confira a oportunidade antes de salvar.",
  );
  const sale = {
    id: uid(),
    opportunityId: opportunity.id,
    sourceAttendanceId,
    sellerTeamId: input.sellerTeamId,
    prospectorId: opportunity.prospectorId,
    date: input.date,
    products: [...input.products],
    value: Math.round(value * 100) / 100,
    client: { ...opportunity.client },
    cycle: opportunity.cycle,
    at,
    registeredBy: actorLabel(actor),
  };
  crm.sales.push(sale);
  opportunity.completedProducts = unique([
    ...opportunity.completedProducts,
    ...sale.products,
  ]);
  opportunity.pendingProducts = opportunity.pendingProducts.filter(
    (name) => !sale.products.includes(name),
  );
  opportunity.stage = opportunity.pendingProducts.length
    ? crmStageOrder(crm).includes("negotiating")
      ? "negotiating"
      : crmActiveStageIds(crm).includes(opportunity.stage)
        ? opportunity.stage
        : firstActiveStage(crm)
    : "won";
  if (opportunity.stage === "won") {
    opportunity.nextDate = "";
    opportunity.nextAction = "";
  }
  activity(
    crm,
    opportunity,
    actor,
    "sale",
    {
      saleId: sale.id,
      products: sale.products,
      value: sale.value,
      sellerTeamId: sale.sellerTeamId,
      date: sale.date,
      sourceAttendanceId,
    },
    at,
  );
  return sale;
}

// Registra um atendimento ao cliente e aplica seus efeitos ao cartão: produtos
// apresentados entram na negociação e produtos vendidos geram a venda.
export function recordAttendance(data, draft, actor, { id = uid(), at = new Date().toISOString() } = {}) {
  const crm = structuredClone(data.crm || emptyCrm());
  const opportunity = crm.opportunities.find((item) => item.id === draft.opportunityId);
  ensure(opportunity && !opportunity.deleted, "Este cartão não está mais disponível.", 404);
  ensure(dateValid(draft.date) && draft.date <= today(), "Informe uma data de atendimento até hoje.");
  ensure(team(draft.userId), "Selecione um colaborador.");
  ensure(Object.hasOwn(ATTENDANCE_KINDS, draft.kind), "Selecione o tipo de atendimento.");
  ensure(Object.hasOwn(ATTENDANCE_CHANNELS, draft.channel), "Selecione a forma de contato.");
  const offered = unique(draft.offered || []);
  const sold = unique(draft.sold || []);
  const allowed = [...(draft.allowedProducts || []), ...opportunity.products];
  ensure(offered.every((name) => allowed.includes(name)), "Produto inválido.");
  ensure(draft.kind === "relationship" || offered.length, "Selecione pelo menos um produto apresentado.");
  ensure(sold.every((name) => offered.includes(name)), "Os produtos vendidos também devem estar entre os apresentados.");
  const saleValue = Number(draft.saleValue || 0);
  ensure(Number.isFinite(saleValue) && saleValue >= 0 && saleValue <= 1_000_000_000, "Informe um valor de venda válido.");
  ensure(draft.kind === "closing" || (!sold.length && !saleValue), "Vendas só podem ser registradas em atendimentos de fechamento.");
  ensure(draft.kind !== "closing" || sold.length, "Para registrar um fechamento, selecione ao menos um produto vendido.");
  const notes = text(draft.notes || "", 4000);
  ensure(
    !closed(opportunity) || (draft.kind === "relationship" && !offered.length),
    "Esta negociação está encerrada. Reabra o cartão para apresentar ou vender produtos.",
  );
  ensure(
    !sold.some((name) => opportunity.completedProducts.includes(name)),
    "Este produto já tem venda registrada nesta negociação.",
  );
  const attendance = {
    id, opportunityId: opportunity.id, userId: draft.userId, date: draft.date,
    kind: draft.kind, channel: draft.channel, offered, sold, saleValue, notes, createdAt: at,
  };
  if (!closed(opportunity)) {
    opportunity.products = unique([...opportunity.products, ...offered]);
    opportunity.pendingProducts = unique([
      ...opportunity.pendingProducts,
      ...offered.filter((name) => !opportunity.completedProducts.includes(name)),
    ]);
  }
  if (draft.date >= (opportunity.lastContactDate || "")) opportunity.lastContactDate = draft.date;
  activity(crm, opportunity, actor, "attendance", {
    sourceAttendanceId: id, date: draft.date, products: offered, kind: draft.kind, channel: draft.channel,
  }, at);
  if (sold.length)
    addSale(crm, opportunity, { products: sold, value: saleValue, date: draft.date, sellerTeamId: draft.userId }, actor, at, id);
  if (!closed(opportunity) && opportunity.nextDate && draft.date >= opportunity.nextDate) {
    opportunity.nextDate = "";
    opportunity.nextAction = "";
  }
  opportunity.version++;
  opportunity.updatedAt = at;
  return { ...data, crm, attendances: [...(data.attendances || []), attendance] };
}

// Vendas que contam nos totais: as de cartões excluídos ficam de fora
// (o CRM e os Relatórios usam a mesma regra).
export function validSales(crm) {
  const deleted = new Set((crm?.opportunities || []).filter((item) => item.deleted).map((item) => item.id));
  return (crm?.sales || []).filter((sale) => !deleted.has(sale.opportunityId));
}

export const opportunityAttendances = (data, opportunityId) =>
  (data.attendances || [])
    .filter((item) => item.opportunityId === opportunityId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

// Converte estados antigos (cartões de "obra" e visitas) para o modelo de clientes.
export function migrateState(state) {
  if (!state || state.version === DATA_VERSION) return state;
  const crm = { ...emptyCrm(), ...(state.crm || {}) };
  delete crm.visitLinks;
  crm.opportunities = (crm.opportunities || []).map(({ work, primaryWorkId, workKey, source, sources, lastVisitDate, ...item }) => ({
    ...item,
    client: item.client || { name: work?.name || "Cliente", phone: work?.phone || "", email: "" },
    lastContactDate: item.lastContactDate || lastVisitDate || "",
  }));
  crm.sales = (crm.sales || []).map(({ work, source, sourceVisitId, ...sale }) => ({
    ...sale,
    client: sale.client || { name: work?.name || "", phone: work?.phone || "", email: "" },
    sourceAttendanceId: sale.sourceAttendanceId || null,
  }));
  const { works, visits, services, installers, serviceDecisions, nextInstallationNumber, ...rest } = state;
  return { ...emptyData(), ...rest, version: DATA_VERSION, attendances: state.attendances || [], crm };
}

export function applyCrmAction(
  current,
  opportunityId,
  input,
  actor,
  allowedProducts,
  at = new Date().toISOString(),
) {
  const crm = structuredClone(current || emptyCrm());
  const item = crm.opportunities.find((row) => row.id === opportunityId);
  ensure(item, "Oportunidade não encontrada.", 404);
  ensure(!item.deleted, "Este cartão foi excluído.", 404);
  ensure(
    Number.isSafeInteger(input.version) && input.version === item.version,
    "Esta oportunidade foi atualizada por outra pessoa. Confira os dados atuais antes de salvar novamente.",
    409,
  );
  const note = text(input.note || "");
  const from = item.stage;
  if (input.type === "delete") {
    ensure(note.length >= 5, "Explique por que o cartão está sendo excluído (pelo menos 5 caracteres).");
    item.deleted = true;
    item.deletedAt = at;
    item.deletedBy = actor.teamId || null;
    item.deletedByName = actorLabel(actor);
    item.deletedReason = note;
    activity(crm, item, actor, "deleted", { note }, at);
  } else if (input.type === "sale") {
    ensure(
      !closed(item),
      "Reabra a oportunidade antes de registrar outra venda.",
    );
    ensure(
      actor.role === "admin" || actor.teamId === input.sellerTeamId,
      "A venda deve ficar no seu nome. A administração pode registrar para outro colaborador.",
      403,
    );
    addSale(crm, item, input, actor, at);
    if (note) activity(crm, item, actor, "note", { note }, at);
  } else if (input.type === "update") {
    ensure(
      !closed(item),
      "Reabra a oportunidade antes de atualizar a negociação.",
    );
    ensure(
      crmActiveStageIds(crm).includes(input.stage),
      "Escolha uma etapa em andamento. Para concluir, registre a venda ou o motivo do encerramento.",
    );
    ensure(team(input.responsibleId), "Selecione o responsável atual.");
    ensure(
      item.responsibleId === input.responsibleId ||
        actor.role === "admin",
      "Somente a administração pode alterar o vendedor responsável no CRM.",
      403,
    );
    const nextAction = text(input.nextAction || "");
    const nextDate = input.nextDate || "";
    ensure(
      !nextDate || dateValid(nextDate),
      "Informe uma data de retorno válida.",
    );
    ensure(
      !nextDate || nextDate >= today() || nextDate === item.nextDate,
      "Escolha uma data de retorno a partir de hoje.",
    );
    ensure(
      !nextDate || nextAction,
      "Descreva a próxima ação para esse retorno.",
    );
    ensure(
      note ||
        item.stage !== input.stage ||
        item.responsibleId !== input.responsibleId ||
        item.nextAction !== nextAction ||
        item.nextDate !== nextDate,
      "Altere algum campo ou registre uma observação.",
    );
    const previousResponsibleId = item.responsibleId;
    item.stage = input.stage;
    item.responsibleId = input.responsibleId;
    item.nextAction = nextAction;
    item.nextDate = nextDate;
    activity(
      crm,
      item,
      actor,
      "updated",
      {
        from,
        to: item.stage,
        previousResponsibleId,
        responsibleId: item.responsibleId,
        nextAction,
        nextDate,
        note,
      },
      at,
    );
  } else if (input.type === "lose") {
    ensure(!closed(item), "Esta oportunidade já está encerrada.");
    ensure(note.length >= 3, "Informe o motivo do encerramento.");
    item.stage = "lost";
    item.nextDate = "";
    item.nextAction = "";
    activity(crm, item, actor, "lost", { note, from }, at);
  } else if (input.type === "complete") {
    ensure(
      !closed(item) && item.completedProducts.length,
      "Registre uma venda antes de concluir a negociação.",
    );
    ensure(
      note.length >= 3,
      "Explique por que os produtos restantes não serão negociados.",
    );
    item.discardedProducts = [...item.pendingProducts];
    item.pendingProducts = [];
    item.stage = "won";
    item.nextDate = "";
    item.nextAction = "";
    activity(
      crm,
      item,
      actor,
      "completed",
      { note, products: item.discardedProducts },
      at,
    );
  } else if (input.type === "reopen") {
    ensure(closed(item), "A oportunidade já está em andamento.");
    ensure(note.length >= 3, "Informe o motivo da reabertura.");
    ensure(
      Array.isArray(input.products) &&
        input.products.length &&
        unique(input.products).length === input.products.length &&
        input.products.every((name) => allowedProducts.includes(name)),
      "Selecione os produtos da nova negociação.",
    );
    item.cycle++;
    item.products = [...input.products];
    item.pendingProducts = [...input.products];
    item.completedProducts = [];
    item.discardedProducts = [];
    item.stage = firstActiveStage(crm);
    activity(
      crm,
      item,
      actor,
      "reopened",
      { note, products: item.products },
      at,
    );
  } else if (input.type === "note") {
    ensure(note, "Descreva o contato ou a ação realizada.");
    activity(crm, item, actor, "note", { note }, at);
  } else ensure(false, "Ação do CRM inválida.");
  item.version++;
  item.updatedAt = at;
  return crm;
}
