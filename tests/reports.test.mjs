import test from "node:test";
import assert from "node:assert/strict";
import { setTeam } from "../src/lib/domain.mjs";
import { emptyCrm, validSales } from "../src/lib/crm.mjs";
import { buildReport, periodRange } from "../src/lib/reports.mjs";

test("períodos e período de comparação", () => {
  assert.deepEqual(periodRange("month", "2026-11-05"), { start: "2026-11-01", end: "2026-11-05", label: "mês anterior", previous: { start: "2026-10-01", end: "2026-10-31" } });
  assert.deepEqual(periodRange("lastMonth", "2026-01-15").start, "2025-12-01");
  assert.deepEqual(periodRange("lastMonth", "2026-01-15").previous, { start: "2025-11-01", end: "2025-11-30" });
  assert.deepEqual(periodRange("last90", "2026-11-05"), { start: "2026-08-08", end: "2026-11-05", label: "90 dias anteriores", previous: { start: "2026-05-10", end: "2026-08-07" } });
  assert.equal(periodRange("year", "2026-11-05").previous.end, "2025-11-05");
  assert.equal(periodRange("all").previous, null);
});

const at = (day) => `${day}T15:00:00.000Z`;
const card = (id, owner, stage, created, extra = {}) => ({ id, client: { name: id }, responsibleId: owner, prospectorId: owner, stage, products: [], pendingProducts: [], completedProducts: [], createdAt: at(created), updatedAt: at(created), nextDate: "", ...extra });
function fixture() {
  setTeam([{ id: "carol", name: "Carol" }, { id: "cibele", name: "Cibele" }]);
  const crm = emptyCrm();
  crm.opportunities = [
    card("a", "carol", "won", "2026-11-02"),
    card("b", "cibele", "won", "2026-10-10"),
    card("c", "cibele", "lost", "2026-11-03"),
    card("d", "carol", "prospecting", "2026-11-04", { nextDate: "2026-11-01" }),
    card("e", "carol", "negotiating", "2026-11-04"),
    card("x", "carol", "won", "2026-11-04", { deleted: true }),
  ];
  crm.sales = [
    { id: "s1", opportunityId: "a", sellerTeamId: "carol", date: "2026-11-03", value: 4000, products: ["CIDADANIA ITALIANA"] },
    { id: "s2", opportunityId: "b", sellerTeamId: "cibele", date: "2026-11-04", value: 2000, products: ["CIDADANIA ITALIANA", "PASSAPORTE"] },
    { id: "s3", opportunityId: "b", sellerTeamId: "cibele", date: "2026-10-20", value: 1500, products: ["PASSAPORTE"] },
    { id: "s4", opportunityId: "x", sellerTeamId: "carol", date: "2026-11-04", value: 9999, products: ["X"] },
  ];
  crm.activities = [
    { id: "1", opportunityId: "a", type: "sale", at: at("2026-11-03") },
    { id: "2", opportunityId: "b", type: "sale", at: at("2026-11-04") },
    { id: "3", opportunityId: "c", type: "lost", at: at("2026-11-04"), note: "Achou caro", actorName: "Cibele" },
  ];
  return { products: [], attendances: [{ id: "t1", userId: "carol", date: "2026-11-04" }], crm };
}

test("KPIs do período, sem cartões excluídos, com comparação", () => {
  const report = buildReport(fixture(), { period: "month", reference: "2026-11-05" });
  assert.equal(report.kpis.total.value, 6000);
  assert.equal(report.kpis.count.value, 2);
  assert.equal(report.kpis.ticket.value, 3000);
  assert.equal(report.kpis.total.delta, 3);           // 6000 contra 1500 em outubro
  assert.equal(report.kpis.conversion.value, 2 / 3);  // 2 vendidas, 1 sem negócio
  assert.equal(report.kpis.created.value, 4);         // a, c, d, e (o excluído não conta)
  assert.deepEqual(report.products, [{ name: "CIDADANIA ITALIANA", count: 2 }, { name: "PASSAPORTE", count: 1 }]);
  assert.deepEqual(report.funnel.map((row) => row.count), [1, 0, 1]);
  assert.deepEqual(report.lostReasons.map((row) => row.note), ["Achou caro"]);
});

test("filtro por usuário e tabela da equipe", () => {
  const report = buildReport(fixture(), { period: "month", owner: "carol", reference: "2026-11-05" });
  assert.equal(report.kpis.total.value, 4000);
  assert.equal(report.kpis.conversion.value, 1);
  assert.equal(report.lostReasons.length, 0);
  const [first, second] = report.team;
  assert.deepEqual([first.name, first.total, first.active, first.overdue, first.attendances], ["Carol", 4000, 2, 1, 1]);
  assert.deepEqual([second.name, second.total, second.count, second.conversion], ["Cibele", 2000, 1, 0.5]);
  assert.equal(buildReport(fixture(), { period: "all", reference: "2026-11-05" }).kpis.total.delta, null);
});

test("CRM e Relatórios somam as mesmas vendas: cartões excluídos ficam de fora", () => {
  const data = fixture();
  const crmTotal = validSales(data.crm).reduce((sum, sale) => sum + sale.value, 0);
  assert.equal(crmTotal, 7500);  // 4000 + 2000 + 1500; a venda de 9999 é de um cartão excluído
  assert.equal(buildReport(data, { period: "all", reference: "2026-11-05" }).kpis.total.value, crmTotal);
});
