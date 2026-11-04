import {
  TEAM,
  contactOrigin,
  normalize,
  productNames,
  person,
  today,
  uid,
  filterVisits,
} from "./domain.mjs";

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
  visitLinks: [],
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
export function createCrmOpportunity(current, work, actor, { stage, at = new Date().toISOString() } = {}) {
  const crm = structuredClone(current || emptyCrm());
  stage ||= firstActiveStage(crm);
  ensure(crmActiveStageIds(crm).includes(stage), "Selecione uma coluna em andamento.");
  const workKey = crmWorkKey(work);
  ensure(workKey && normalize(work.street) && normalize(work.city), "Informe o endereço da obra.");
  const existing = crm.opportunities.find((item) => item.workKey === workKey || item.primaryWorkId === work.id);
  if (existing) {
    ensure(existing.deleted, "Esta obra já possui um cartão no CRM.", 409);
    existing.deleted = false;
    if (closed(existing)) {
      existing.cycle++;
      existing.products = [];
      existing.pendingProducts = [];
      existing.completedProducts = [];
      existing.discardedProducts = [];
      existing.nextAction = "";
      existing.nextDate = "";
    }
    existing.stage = stage;
    existing.version++;
    existing.updatedAt = at;
    activity(crm, existing, actor, "restored", {}, at);
    return crm;
  }
  const item = {
    id: uid(), primaryWorkId: work.id, workKey, work: crmWorkSnapshot(work),
    source: "manual", sources: [],
    stage, responsibleId: actor.teamId,
    prospectorId: actor.teamId, products: [], pendingProducts: [],
    completedProducts: [], discardedProducts: [], cycle: 1,
    nextAction: "", nextDate: "", version: 1,
    createdAt: at, updatedAt: at, lastVisitDate: "",
  };
  crm.opportunities.push(item);
  activity(crm, item, actor, "created", { note: "Oportunidade aberta a partir da obra cadastrada." }, at);
  return crm;
}

export function assignCrmSeller(current, work, sellerId, actor, at = new Date().toISOString()) {
  ensure(team(sellerId), "Selecione um vendedor válido.");
  let crm = structuredClone(current || emptyCrm());
  let item = crm.opportunities.find((row) =>
    row.id === work.crmOpportunityId || row.primaryWorkId === work.id || row.workKey === crmWorkKey(work),
  );
  if (item && !item.deleted && item.responsibleId !== sellerId)
    ensure(["admin", "supervisor"].includes(actor.role),
      "Somente Túlio e a administração podem alterar o vendedor de uma oportunidade existente.", 403);
  if (!item || item.deleted) {
    crm = createCrmOpportunity(crm, work, actor, { at });
    item = crm.opportunities.find((row) =>
      row.primaryWorkId === work.id || row.workKey === crmWorkKey(work),
    );
  }
  if (item.responsibleId !== sellerId) {
    const previousResponsibleId = item.responsibleId;
    item.responsibleId = sellerId;
    item.version++;
    item.updatedAt = at;
    activity(crm, item, actor, "updated", {
      from: item.stage,
      to: item.stage,
      previousResponsibleId,
      responsibleId: sellerId,
      nextAction: item.nextAction,
      nextDate: item.nextDate,
      note: "Vendedor responsável definido para a obra.",
    }, at);
  }
  return crm;
}

// O histórico é decrescente. Visita e venda do mesmo salvamento aparecem
// como visita → venda, sem alterar a sequência persistida nem vendas anteriores.
export function crmTimeline(activities, opportunityId) {
  const deletedVisits = new Set(
    activities
      .filter((event) => event.type === "visit_deleted")
      .map((event) => event.sourceVisitId),
  );
  const events = activities
    .filter(
      (event) =>
        event.opportunityId === opportunityId &&
        !(event.type === "visit" && deletedVisits.has(event.sourceVisitId)),
    )
    .sort((a, b) => b.sequence - a.sequence);
  for (let index = 0; index < events.length - 1; index++) {
    const visit = events[index];
    const sale = events[index + 1];
    if (
      visit.type === "visit" &&
      sale.type === "sale" &&
      visit.sourceVisitId &&
      visit.sourceVisitId === sale.sourceVisitId &&
      visit.at === sale.at
    ) {
      [events[index], events[index + 1]] = [sale, visit];
      index++;
    }
  }
  return events;
}
const unique = (items) => [...new Set(items)];
const closed = (item) => ["won", "lost"].includes(item.stage);
const ensure = (condition, message, status = 400) => {
  if (!condition) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
};
const team = (id) => TEAM.some((item) => item.id === id);
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

export function crmWorkKey(work) {
  const number = normalize(work.number || "").replace(/[\s/.\-]/g, "");
  const withoutNumber = !number || ["sn", "semnumero", "0"].includes(number);
  return [
    "street",
    "number",
    "complement",
    "neighborhood",
    "city",
    "state",
    ...(withoutNumber ? ["name"] : []),
  ]
    .map((key) =>
      key === "number" && withoutNumber
        ? ""
        : normalize(work[key] || "").replace(/\s+/g, " "),
    )
    .join("|");
}
export function crmWorkSnapshot(work, visit = {}) {
  return Object.fromEntries(
    [
      "name",
      "cep",
      "street",
      "number",
      "complement",
      "neighborhood",
      "city",
      "state",
      "type",
      "responsible",
      "phone",
      "architectId",
      "contractorId",
      "architectName",
      "contractorName",
    ].map((key) => [
      key,
      String(
        (key === "name"
          ? work.name || visit.workName
          : work[key] || visit[key]) || "",
      ),
    ]),
  );
}
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
  sourceVisitId = null,
  historical = false,
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
  if (!historical)
    ensure(
      input.products.every((name) =>
        opportunity.pendingProducts.includes(name),
      ),
      "Um produto já foi vendido ou não está nesta negociação. Confira a oportunidade antes de salvar.",
    );
  const sale = {
    id: uid(),
    opportunityId: opportunity.id,
    sourceVisitId,
    sellerTeamId: input.sellerTeamId,
    prospectorId: opportunity.prospectorId,
    source: opportunity.source || "visit",
    date: input.date,
    products: [...input.products],
    value: Math.round(value * 100) / 100,
    work: { ...opportunity.work },
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
      sourceVisitId,
    },
    at,
  );
  return sale;
}

// Fatos de visitas são acrescentados ao CRM; fotos e anotações privadas não são copiadas.
export function recordCrmVisit(
  current,
  visit,
  work,
  actor,
  { at = new Date().toISOString(), historical = false } = {},
) {
  const crm = structuredClone(current || emptyCrm());
  const source = contactOrigin(visit);
  const linked = crm.visitLinks.find((item) => item.visitId === visit.id);
  if (linked) return { crm, opportunityId: linked.opportunityId };
  const enabled =
    visit.crmEnabled ??
    (visit.stage !== "relationship" ||
      Boolean(visit.crmOpportunityId || work.crmOpportunityId));
  const requestedId = visit.crmOpportunityId || work.crmOpportunityId;
  ensure(
    !visit.crmOpportunityId ||
      !work.crmOpportunityId ||
      visit.crmOpportunityId === work.crmOpportunityId,
    "Esta obra já está vinculada a outra oportunidade. Abra o cartão correto no CRM.",
  );
  let opportunity = crm.opportunities.find((item) =>
    requestedId
      ? item.id === requestedId
      : item.primaryWorkId === work.id || item.workKey === crmWorkKey(work),
  );
  if (!enabled && !(visit.sold.length && opportunity))
    return { crm, opportunityId: null };
  ensure(
    !requestedId || opportunity,
    "A oportunidade selecionada não está disponível. Abra o CRM e confira a obra.",
  );
  if (opportunity?.deleted) {
    opportunity.deleted = false;
    if (!closed(opportunity) && !crmActiveStageIds(crm).includes(opportunity.stage))
      opportunity.stage = firstActiveStage(crm);
    activity(crm, opportunity, actor, "restored", { note: "Oportunidade reaberta por nova visita." }, at);
  }
  const snapshot = crmWorkSnapshot(work, visit);
  if (!opportunity) {
    opportunity = {
      id: uid(),
      primaryWorkId: work.id,
      workKey: crmWorkKey(work),
      work: snapshot,
      stage: firstActiveStage(crm),
      responsibleId: visit.sellerId || visit.userId,
      prospectorId: visit.userId,
      source,
      sources: [source],
      products: [],
      pendingProducts: [],
      completedProducts: [],
      discardedProducts: [],
      cycle: 1,
      nextAction: "",
      nextDate: "",
      version: 0,
      createdAt: at,
      updatedAt: at,
      lastVisitDate: visit.date,
    };
    crm.opportunities.push(opportunity);
    activity(
      crm,
      opportunity,
      actor,
      "created",
      {
        sourceVisitId: visit.id,
        note: historical
          ? "Oportunidade criada a partir do histórico de visitas."
          : source === "lead" ? "Oportunidade aberta em contato telefônico." : "Oportunidade aberta nesta visita.",
        source,
      },
      at,
    );
  }
  if (opportunity.source === "manual") opportunity.source = source;
  opportunity.sources = [...new Set([...(opportunity.sources || [opportunity.source || "visit"]), source])];
  if (!historical && visit.sellerId && opportunity.responsibleId !== visit.sellerId) {
    const mayReassign = ["admin", "supervisor"].includes(actor.role);
    if (!mayReassign && requestedId)
      ensure(false, "Somente Túlio e a administração podem alterar o vendedor de uma oportunidade existente.", 403);
    if (mayReassign) {
      ensure(team(visit.sellerId), "Selecione um vendedor válido.");
      const previousResponsibleId = opportunity.responsibleId;
      opportunity.responsibleId = visit.sellerId;
      activity(crm, opportunity, actor, "updated", {
        from: opportunity.stage,
        to: opportunity.stage,
        previousResponsibleId,
        responsibleId: visit.sellerId,
        nextAction: opportunity.nextAction,
        nextDate: opportunity.nextDate,
        note: "Vendedor responsável definido nesta visita.",
      }, at);
    }
  }
  if (!historical && visit.sold.length && !visit.crmSaleId) {
    ensure(
      !closed(opportunity),
      "Esta obra já teve a negociação encerrada. Vincule a venda já registrada ou reabra a oportunidade no CRM para uma nova negociação.",
    );
    ensure(
      !visit.sold.some((name) => opportunity.completedProducts.includes(name)),
      "Este produto já tem venda registrada. Vincule o fechamento existente para não duplicar a venda.",
    );
  }
  if (
    (closed(opportunity) &&
      visit.offered.length &&
      !visit.crmSaleId &&
      !visit.sold.length) ||
    (historical && closed(opportunity) && visit.offered.length)
  ) {
    opportunity.cycle++;
    opportunity.products = [];
    opportunity.pendingProducts = [];
    opportunity.completedProducts = [];
    opportunity.discardedProducts = [];
    opportunity.stage = firstActiveStage(crm);
    activity(
      crm,
      opportunity,
      actor,
      "reopened",
      { note: source === "lead" ? "Novo contato telefônico registrado." : "Nova prospecção registrada em uma visita.", source },
      at,
    );
  }
  // Campos em branco não apagam informações comerciais preenchidas pela equipe.
  const recent = visit.date >= (opportunity.lastVisitDate || "");
  opportunity.work = Object.fromEntries(
    Object.keys(snapshot).map((key) => [
      key,
      (recent
        ? snapshot[key] || opportunity.work[key]
        : opportunity.work[key] || snapshot[key]) || "",
    ]),
  );
  opportunity.workKey = crmWorkKey(opportunity.work);
  ensure(
    !crm.opportunities.some(
      (item) =>
        item.id !== opportunity.id && item.workKey === opportunity.workKey,
    ),
    "Esta obra já possui uma oportunidade no CRM. Vincule a visita ao cartão existente.",
    409,
  );
  opportunity.lastVisitDate = recent ? visit.date : opportunity.lastVisitDate;
  if (!visit.crmSaleId && !closed(opportunity)) {
    opportunity.products = unique([...opportunity.products, ...visit.offered]);
    opportunity.pendingProducts = unique([
      ...opportunity.pendingProducts,
      ...visit.offered.filter(
        (name) => !opportunity.completedProducts.includes(name),
      ),
    ]);
  }
  if (visit.crmSaleId) {
    const sale = crm.sales.find(
      (item) =>
        item.id === visit.crmSaleId && item.opportunityId === opportunity.id,
    );
    ensure(
      sale && !sale.sourceVisitId,
      "Este fechamento não está disponível para vincular a outra visita.",
    );
    ensure(
      sale.sellerTeamId === visit.userId &&
        sale.value === Number(visit.saleValue) &&
        sale.products.length === visit.sold.length &&
        sale.products.every((name) => visit.sold.includes(name)),
      "A visita deve manter o vendedor, os produtos e o valor do fechamento vinculado.",
    );
    sale.sourceVisitId = visit.id;
  } else if (visit.sold.length) {
    addSale(
      crm,
      opportunity,
      {
        products: visit.sold,
        value: visit.saleValue,
        date: visit.date,
        sellerTeamId: visit.userId,
      },
      actor,
      at,
      visit.id,
      historical,
    );
  }
  if (
    !closed(opportunity) &&
    opportunity.nextDate &&
    visit.date >= opportunity.nextDate
  ) {
    opportunity.nextDate = "";
    opportunity.nextAction = "";
  }
  if (!closed(opportunity) && visit.nextAction?.trim())
    opportunity.nextAction = visit.nextAction.trim();
  if (!closed(opportunity) && visit.scheduleNext && visit.nextDate)
    opportunity.nextDate = visit.nextDate;
  opportunity.version++;
  opportunity.updatedAt = at;
  crm.visitLinks.push({
    visitId: visit.id,
    opportunityId: opportunity.id,
    userId: visit.userId,
    source,
    date: visit.date,
  });
  activity(
    crm,
    opportunity,
    actor,
    "visit",
    {
      sourceVisitId: visit.id,
      date: visit.date,
      products: visit.offered,
      visitType: visit.stage,
      source,
      linkedSaleId: visit.crmSaleId || null,
    },
    at,
  );
  return { crm, opportunityId: opportunity.id };
}

export function markCrmVisitDeleted(
  current,
  visitId,
  actor,
  at = new Date().toISOString(),
) {
  const crm = structuredClone(current || emptyCrm());
  const link = crm.visitLinks.find((item) => item.visitId === visitId);
  if (!link || link.deleted) return crm;
  link.deleted = true;
  const opportunity = crm.opportunities.find(
    (item) => item.id === link.opportunityId,
  );
  if (!opportunity) return crm;
  opportunity.lastVisitDate =
    crm.visitLinks
      .filter((item) => item.opportunityId === opportunity.id && !item.deleted)
      .map((item) => item.date)
      .sort()
      .at(-1) || "";
  opportunity.version++;
  opportunity.updatedAt = at;
  activity(
    crm,
    opportunity,
    actor,
    "visit_deleted",
    { sourceVisitId: visitId },
    at,
  );
  return crm;
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
    item.deleted = true;
    activity(crm, item, actor, "deleted", {}, at);
  } else if (input.type === "sale") {
    ensure(
      !closed(item),
      "Reabra a oportunidade antes de registrar outra venda.",
    );
    ensure(
      ["admin", "supervisor"].includes(actor.role) || actor.teamId === input.sellerTeamId,
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
        ["admin", "supervisor"].includes(actor.role),
      "Somente Túlio e a administração podem alterar o vendedor responsável no CRM.",
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

export function reconcileLocalCrm(data, actor, historical = false) {
  let crm = data.crm || emptyCrm();
  let works = [...data.works];
  for (const visit of data.visits) {
    if (crm.visitLinks.some((item) => item.visitId === visit.id)) continue;
    const work = works.find((item) => item.id === visit.workId);
    if (!work) continue;
    const result = recordCrmVisit(
      crm,
      visit,
      work,
      actor || { name: person(visit.userId), teamId: visit.userId },
      { historical },
    );
    crm = result.crm;
    if (result.opportunityId)
      works = works.map((item) =>
        item.id === work.id
          ? { ...item, crmOpportunityId: result.opportunityId }
          : item,
      );
  }
  return { ...data, crm, works };
}

export function canSeeCrmOpportunity(crm, opportunity, member) {
  if (!opportunity) return false;
  if (!member || ["admin", "supervisor"].includes(member.role)) return true;
  return opportunity.prospectorId === member.teamId ||
    opportunity.responsibleId === member.teamId ||
    crm.visitLinks.some((link) =>
      link.opportunityId === opportunity.id &&
      link.userId === member.teamId && !link.deleted);
}

export function visibleCrm(crm, member) {
  if (!member || ["admin", "supervisor"].includes(member.role)) return crm;
  const ids = new Set(crm.opportunities
    .filter((item) => canSeeCrmOpportunity(crm, item, member))
    .map((item) => item.id));
  return {
    ...crm,
    opportunities: crm.opportunities.filter((item) => ids.has(item.id)),
    activities: crm.activities.filter((item) => ids.has(item.opportunityId)),
    sales: crm.sales.filter((item) => ids.has(item.opportunityId)),
    visitLinks: crm.visitLinks.filter((item) => ids.has(item.opportunityId)),
  };
}

// Um fechamento vinculado à visita entra apenas uma vez no consolidado.
export function businessSales(data) {
  const sales = data.crm?.sales || [];
  const linked = new Set(
    sales.map((item) => item.sourceVisitId).filter(Boolean),
  );
  return [
    ...sales,
    ...data.visits
      .filter(
        (visit) =>
          visit.sold.length &&
          !linked.has(visit.id) &&
          !sales.some((sale) => sale.id === visit.crmSaleId),
      )
      .map((visit) => ({
        id: `visit-${visit.id}`,
        sourceVisitId: visit.id,
        sellerTeamId: visit.userId,
        prospectorId: visit.userId,
        source: contactOrigin(visit),
        date: visit.date,
        products: visit.sold,
        value: visit.saleValue,
        work: crmWorkSnapshot({ ...visit, name: visit.workName }, visit),
        registeredBy: person(visit.userId),
      })),
  ];
}
export function filterBusinessSales(sales, filters) {
  return sales.filter(
    (sale) =>
      (!filters.source || (sale.source || "visit") === filters.source) &&
      filterVisits(
        [
          {
            ...sale.work,
            date: sale.date,
            userId: sale.sellerTeamId,
            offered: sale.products,
            sold: sale.products,
            stage: "closing",
            source: sale.source || "visit",
          },
        ],
        { ...filters, source: "" },
      ).length,
  );
}
