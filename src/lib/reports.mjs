import { TEAM, isTeamMember, today } from "./domain.mjs";
import { crmActiveStageIds, crmStageOrder, validSales } from "./crm.mjs";

// Períodos em datas locais (America/Sao_Paulo), no formato AAAA-MM-DD.
export const PERIODS = {
  month: "Este mês",
  lastMonth: "Mês passado",
  last90: "Últimos 90 dias",
  year: "Este ano",
  all: "Todo o período",
};
const iso = (date) => date.toISOString().slice(0, 10);
const atNoon = (day) => new Date(`${day}T12:00:00Z`);
const addDays = (day, days) => { const date = atNoon(day); date.setUTCDate(date.getUTCDate() + days); return iso(date); };

export function periodRange(id, reference = today()) {
  const [y, m] = reference.split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (id === "month") return { start: `${y}-${pad(m)}-01`, end: reference, label: "mês anterior",
    previous: { start: `${m === 1 ? y - 1 : y}-${pad(m === 1 ? 12 : m - 1)}-01`, end: addDays(`${y}-${pad(m)}-01`, -1) } };
  if (id === "lastMonth") {
    const year = m === 1 ? y - 1 : y, month = m === 1 ? 12 : m - 1;
    const prevYear = month === 1 ? year - 1 : year, prevMonth = month === 1 ? 12 : month - 1;
    return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay(year, month))}`, label: "mês anterior",
      previous: { start: `${prevYear}-${pad(prevMonth)}-01`, end: `${prevYear}-${pad(prevMonth)}-${pad(lastDay(prevYear, prevMonth))}` } };
  }
  if (id === "last90") { const start = addDays(reference, -89);
    return { start, end: reference, label: "90 dias anteriores", previous: { start: addDays(start, -90), end: addDays(start, -1) } }; }
  if (id === "year") return { start: `${y}-01-01`, end: reference, label: "mesmo período do ano passado",
    previous: { start: `${y - 1}-01-01`, end: `${y - 1}-${reference.slice(5)}` } };
  return { start: "0000-01-01", end: "9999-12-31", label: "", previous: null };
}
const inRange = (day, range) => Boolean(day) && day.slice(0, 10) >= range.start && day.slice(0, 10) <= range.end;
const localDay = (at) => at ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(at)) : "";

// Quando a negociação foi encerrada: último evento que a levou a venda ou a "sem negócio".
function closedOn(crm, item) {
  const types = item.stage === "won" ? ["sale", "completed"] : ["lost"];
  const event = crm.activities.filter((row) => row.opportunityId === item.id && types.includes(row.type)).at(-1);
  return localDay(event?.at || item.updatedAt);
}

function slice(data, range, owner) {
  const crm = data.crm;
  const mine = (id) => !owner || id === owner;
  const sales = validSales(crm).filter((sale) => inRange(sale.date, range) && mine(sale.sellerTeamId));
  const total = sales.reduce((sum, sale) => sum + sale.value, 0);
  const live = crm.opportunities.filter((item) => !item.deleted && mine(item.responsibleId));
  const created = live.filter((item) => inRange(localDay(item.createdAt), range));
  const closed = live.filter((item) => ["won", "lost"].includes(item.stage) && inRange(closedOn(crm, item), range));
  const won = closed.filter((item) => item.stage === "won").length;
  return {
    total, count: sales.length, ticket: sales.length ? total / sales.length : null,
    created: created.length, won, lost: closed.length - won,
    conversion: closed.length ? won / closed.length : null, sales,
  };
}

const change = (current, previous) =>
  current == null || previous == null ? null : previous === 0 ? (current === 0 ? 0 : null) : (current - previous) / previous;

export function buildReport(data, { period = "month", owner = "", reference = today() } = {}) {
  const crm = data.crm;
  const range = periodRange(period, reference);
  const now = slice(data, range, owner);
  const before = range.previous ? slice(data, range.previous, owner) : null;
  const delta = (key) => before ? change(now[key], before[key]) : null;

  // Vendas por produto: quantas vendas incluíram cada produto (o valor de uma
  // venda com vários produtos não é dividido entre eles).
  const byProduct = new Map();
  for (const sale of now.sales) for (const name of sale.products) byProduct.set(name, (byProduct.get(name) || 0) + 1);
  const products = [...byProduct].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));

  // Funil: retrato atual dos cartões em andamento, por etapa, na ordem do quadro.
  const labels = crm.stageLabels || {};
  const live = crm.opportunities.filter((item) => !item.deleted && (!owner || item.responsibleId === owner));
  const funnel = crmActiveStageIds(crm).map((id) => ({ id, label: labels[id] || id, count: live.filter((item) => item.stage === id).length }));

  // Motivos de "Sem negócio" no período.
  const lostReasons = crm.activities
    .filter((event) => event.type === "lost" && inRange(localDay(event.at), range))
    .map((event) => ({ event, item: crm.opportunities.find((row) => row.id === event.opportunityId) }))
    .filter(({ item }) => item && !item.deleted && (!owner || item.responsibleId === owner))
    .sort((a, b) => b.event.at.localeCompare(a.event.at))
    .map(({ event, item }) => ({ id: event.id, client: item.client.name, note: event.note, by: event.actorName, day: localDay(event.at) }));

  // Desempenho por pessoa (sem o filtro de usuário: compara a equipe toda).
  const people = TEAM.map((member) => ({ id: member.id, name: member.name }));
  if (crm.opportunities.some((item) => !item.deleted && !isTeamMember(item.responsibleId)) ||
    validSales(crm).some((sale) => !isTeamMember(sale.sellerTeamId)))
    people.push({ id: "__outros", name: "Sem responsável ou removido" });
  const periodSales = owner ? slice(data, range, "").sales : now.sales;
  const team = people.map((member) => {
    const owns = (id) => member.id === "__outros" ? !isTeamMember(id) : id === member.id;
    const sales = periodSales.filter((sale) => owns(sale.sellerTeamId));
    const total = sales.reduce((sum, sale) => sum + sale.value, 0);
    const mineLive = crm.opportunities.filter((item) => !item.deleted && owns(item.responsibleId));
    const closed = mineLive.filter((item) => ["won", "lost"].includes(item.stage) && inRange(closedOn(crm, item), range));
    const won = closed.filter((item) => item.stage === "won").length;
    const active = mineLive.filter((item) => !["won", "lost"].includes(item.stage));
    return {
      ...member, total, count: sales.length, ticket: sales.length ? total / sales.length : null,
      conversion: closed.length ? won / closed.length : null, closed: closed.length,
      active: active.length,
      overdue: active.filter((item) => item.nextDate && item.nextDate < reference).length,
      attendances: (data.attendances || []).filter((row) => owns(row.userId) && inRange(row.date, range)).length,
    };
  }).sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));

  return {
    range, comparison: range.label,
    kpis: {
      total: { value: now.total, delta: delta("total") },
      count: { value: now.count, delta: delta("count") },
      ticket: { value: now.ticket, delta: delta("ticket") },
      conversion: { value: now.conversion, delta: before && now.conversion != null && before.conversion != null ? now.conversion - before.conversion : null, won: now.won, lost: now.lost },
      created: { value: now.created, delta: delta("created") },
    },
    products, funnel, lostReasons, team,
    stageCount: crmStageOrder(crm).length,
  };
}

