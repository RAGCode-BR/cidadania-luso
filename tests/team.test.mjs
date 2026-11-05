import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { TEAM, UNASSIGNED, person, setTeam, validResponsible } from "../src/lib/domain.mjs";
import { applyCrmAction, createCrmOpportunity, emptyCrm } from "../src/lib/crm.mjs";

globalThis.crypto ||= webcrypto;
const carol = { role: "admin", teamId: "u-carol", name: "Carol" };
const team = [{ id: "u-carol", name: "Carol" }, { id: "u-cibele", name: "Cibele" }];

test("equipe vem dos usuários; sem lista volta para a Equipe Luso do modo local", () => {
  setTeam(team);
  assert.deepEqual(TEAM.map((item) => item.name), ["Carol", "Cibele"]);
  assert.equal(person("u-cibele"), "Cibele");
  assert.equal(person(UNASSIGNED), "Sem responsável");
  assert.equal(person("u-excluido"), "Usuário removido");
  assert.equal(validResponsible(UNASSIGNED), true);
  assert.equal(validResponsible("u-excluido"), false);
  setTeam([]);
  assert.deepEqual(TEAM, [{ id: UNASSIGNED, name: "Equipe Luso" }]);
  assert.equal(person(UNASSIGNED), "Equipe Luso");
});

test("cartão fica com quem criou ou com o responsável escolhido", () => {
  setTeam(team);
  let crm = createCrmOpportunity(emptyCrm(), { name: "Ilana" }, carol);
  assert.equal(crm.opportunities[0].responsibleId, "u-carol");
  assert.equal(crm.opportunities[0].prospectorId, "u-carol");
  crm = createCrmOpportunity(crm, { name: "Gustavo" }, carol, { responsibleId: "u-cibele" });
  assert.equal(crm.opportunities[1].responsibleId, "u-cibele");
  assert.equal(crm.opportunities[1].prospectorId, "u-carol");
  assert.throws(() => createCrmOpportunity(crm, { name: "X" }, carol, { responsibleId: "u-excluido" }), /responsável/);
});

test("cartão antigo sem responsável continua editável e pode ser atribuído", () => {
  setTeam(team);
  let crm = createCrmOpportunity(emptyCrm(), { name: "Antigo" }, carol, { responsibleId: UNASSIGNED });
  const item = crm.opportunities[0];
  crm = applyCrmAction(crm, item.id, { type: "update", version: 1, stage: item.stage, responsibleId: UNASSIGNED, nextAction: "Ligar", nextDate: "" }, carol, []);
  crm = applyCrmAction(crm, item.id, { type: "update", version: 2, stage: item.stage, responsibleId: "u-cibele", nextAction: "Ligar", nextDate: "" }, carol, []);
  assert.equal(crm.opportunities[0].responsibleId, "u-cibele");
});

test("excluir cartão exige motivo e registra quem, quando e por quê", () => {
  setTeam(team);
  const crm = createCrmOpportunity(emptyCrm(), { name: "Duplicado" }, carol);
  const id = crm.opportunities[0].id;
  assert.throws(() => applyCrmAction(crm, id, { type: "delete", version: 1 }, carol, []), /por que o cartão/);
  assert.throws(() => applyCrmAction(crm, id, { type: "delete", version: 1, note: " ok " }, carol, []), /por que o cartão/);
  const next = applyCrmAction(crm, id, { type: "delete", version: 1, note: "Cliente cadastrado duas vezes", }, carol, [], "2026-11-05T12:00:00.000Z");
  const item = next.opportunities[0];
  assert.equal(item.deleted, true);
  assert.equal(item.deletedReason, "Cliente cadastrado duas vezes");
  assert.equal(item.deletedBy, "u-carol");
  assert.equal(item.deletedByName, "Carol");
  assert.equal(item.deletedAt, "2026-11-05T12:00:00.000Z");
  const event = next.activities.at(-1);
  assert.equal(event.type, "deleted");
  assert.equal(event.note, "Cliente cadastrado duas vezes");
  assert.throws(() => applyCrmAction(next, id, { type: "note", version: 2, note: "x" }, carol, []), /excluído/);
});
