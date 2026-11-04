export const HISTORY_STATUSES = {
  scheduled: "Agendado", in_progress: "Em execução", return_required: "Com retorno",
  completed: "Concluído", cancelled: "Cancelado", unknown: "Não definida",
};
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export function parseHistoricalEntry(entry) {
  const raw = entry.raw.trim();
  const parts = raw.split(/\s+-\s+/).map((part) => part.trim());
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const note = raw.startsWith("#") || parts.length < 2 || /^(feriado|terce?ri?zados?|apos\s|aguardando liberacao)/.test(normalized);
  const secondPart = (parts[1] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const productAsCrew = /^(forro|gesso|eucatex|porta|rodape|cortina|persiana|drywall|piso|parede|toldo|vidro|divisoria|ripado|manutencao|tapete)/.test(secondPart);
  const crewText = !note && !productAsCrew && parts.length >= 3 && /^[\p{L}\s./]+$/u.test(parts[1]) ? parts[1] : "";
  const descriptionParts = crewText ? parts.slice(2) : parts.slice(1);
  // Só remove da descrição o sufixo de transporte claramente separado.
  // O lançamento completo permanece em raw; não se cadastram veículos.
  if (descriptionParts.length > 1 && /^(?:\d{4}|effa\s*[12]|hr|iveco)(?:\s*[/+]\s*(?:\d{4}|effa\s*[12]|hr|iveco))*$/i.test(descriptionParts.at(-1))) descriptionParts.pop();
  return {
    kind: note ? "note" : "service", name: note ? "Observação da agenda" : parts[0],
    description: note ? raw.replace(/^#\s*/, "") : descriptionParts.join(" - ") || raw,
    crewText, professionals: crewText.split("/").map((name) => name.trim()).filter(Boolean),
    needsReview: !note && (!crewText || entry.status === "unknown"),
  };
}
export function applyServiceHistoryCleanup(data, job, at = new Date().toISOString()) {
  fail(job?.version === 1 && /^services-history-cleanup-[a-z0-9-]{8,100}$/.test(job.id || "") && job.targetOrigin === "http://127.0.0.1:5174", "Plano de limpeza local inválido.");
  fail(Array.isArray(job.records) && job.records.length > 0 && job.records.length <= 10000, "Seleção de limpeza inválida.");
  const ids = new Set(job.records.map((row) => row.id));
  fail(ids.size === job.records.length && job.records.every((row) => typeof row.id === "string" && row.id.startsWith("agenda-servicos-2026/") && /^[a-f0-9]{64}$/.test(row.fingerprint || "")), "Identificações de limpeza inválidas.");
  const previous = (data.serviceHistoryCleanups || []).find((row) => row.id === job.id);
  if (previous) return { data, receipt: previous, alreadyApplied: true };
  const history = data.serviceHistory || [];
  for (const selected of job.records) {
    const matches = history.filter((row) => row.id === selected.id);
    fail(matches.length === 1 && matches[0].fingerprint === selected.fingerprint && parseHistoricalEntry(matches[0]).needsReview, "O histórico mudou; nenhum lançamento foi excluído.");
  }
  const remaining = history.filter((row) => !ids.has(row.id));
  const receipt = { id: job.id, appliedAt: at, removedCount: ids.size, remainingCount: remaining.length };
  return { data: { ...data, serviceHistory: remaining, serviceHistoryCleanups: [...(data.serviceHistoryCleanups || []), receipt] }, receipt, alreadyApplied: false };
}
export function validateHistoryJob(job) {
  fail(job?.version === 1 && /^services-history-[a-z0-9-]{8,100}$/.test(job.id || ""), "Plano de importação inválido.");
  fail(job.targetOrigin === "http://127.0.0.1:5174", "A importação é exclusiva da prévia local autorizada.");
  fail(typeof job.sourceFile === "string" && job.sourceFile.length < 256 && /^[a-f0-9]{64}$/.test(job.sourceHash || ""), "Origem da planilha inválida.");
  fail(Array.isArray(job.excludedSheets) && job.excludedSheets.includes("Julho"), "A aba Julho deve ficar fora desta importação.");
  fail(job.deleteServiceNumber === 1, "Esta operação só pode remover o teste SV-0001 autorizado.");
  fail(Array.isArray(job.records) && job.records.length > 0 && job.records.length <= 10000, "A importação deve conter lançamentos válidos.");
  const ids = new Set();
  for (const record of job.records) {
    fail(typeof record.id === "string" && record.id.startsWith("agenda-servicos-2026/") && !ids.has(record.id), "Há lançamentos repetidos no plano.");
    ids.add(record.id);
    fail(validDate(record.date) && typeof record.sheet === "string" && record.sheet.length < 65 && /^[B-H]\d+$/.test(record.cell), "Data ou origem inválida no histórico.");
    fail(!job.excludedSheets.includes(record.sheet), "O plano contém uma aba excluída.");
    fail(typeof record.raw === "string" && record.raw.trim() && record.raw.length <= 10000, "Lançamento vazio ou muito longo.");
    fail(["service", "note"].includes(record.kind) && Object.hasOwn(HISTORY_STATUSES, record.status), "Tipo ou situação inválida no histórico.");
    fail(["name", "description", "crewText"].every((key) => typeof record[key] === "string" && record[key].length <= 10000) && Array.isArray(record.professionals) && record.professionals.every((name) => typeof name === "string" && name.length <= 400), "Dados de apresentação inválidos no histórico.");
    fail(/^[a-f0-9]{64}$/.test(record.fingerprint || ""), "Identificação de lançamento inválida.");
  }
}
export function applyServiceHistoryJob(data, job, at = new Date().toISOString()) {
  validateHistoryJob(job);
  const previousReceipt = (data.serviceHistoryImports || []).find((entry) => entry.id === job.id);
  if (previousReceipt) return { data, receipt: previousReceipt, alreadyApplied: true };
  const tests = (data.services || []).filter((row) => Number(row.number) === job.deleteServiceNumber);
  fail(tests.length <= 1, "Há mais de um serviço com o código SV-0001. Confira antes de excluir.");
  const existing = new Map((data.serviceHistory || []).map((entry) => [entry.id, entry]));
  const additions = [];
  for (const record of job.records) {
    const previous = existing.get(record.id);
    fail(!previous || previous.fingerprint === record.fingerprint, `O lançamento ${record.sheet}!${record.cell} mudou em relação à importação anterior. Revise antes de substituir.`);
    if (!previous) additions.push(record);
  }
  const services = (data.services || []).filter((row) => !tests.some((test) => test.id === row.id));
  const decisions = { ...(data.serviceDecisions || {}) };
  for (const test of tests) if (test.saleId && decisions[test.saleId] === "required" && !services.some((row) => row.saleId === test.saleId)) decisions[test.saleId] = "pending";
  const receipt = {
    id: job.id, sourceFile: job.sourceFile, sourceHash: job.sourceHash, appliedAt: at,
    importedCount: additions.length, skippedCount: job.records.length - additions.length,
    removedTestCount: tests.length, excludedSheets: [...job.excludedSheets],
    serviceCount: additions.filter((row) => row.kind === "service").length,
    noteCount: additions.filter((row) => row.kind === "note").length,
  };
  return { data: {
    ...data, services, serviceDecisions: decisions,
    nextInstallationNumber: Math.max(data.nextInstallationNumber || 1, 1 + Math.max(0, ...(data.services || []).map((row) => row.number))),
    serviceHistory: [...existing.values(), ...additions],
    serviceHistoryImports: [...(data.serviceHistoryImports || []), receipt],
  }, receipt, alreadyApplied: false };
}
