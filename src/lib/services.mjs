import { addressLabel, normalize, uid } from "./domain.mjs";
import { businessSales } from "./crm.mjs";

export const SERVICE_STATUSES = {
  waiting: "Aguardando agendamento", scheduled: "Agendado", in_progress: "Em execução",
  return_required: "Com retorno", completed: "Concluído", cancelled: "Cancelado",
};
export const SERVICE_TYPES = ["Instalação", "Manutenção", "Desmontagem", "Ajuste / retorno", "Outro"];
export const SERVICE_PERIODS = { morning: "Manhã · 08h–12h", afternoon: "Tarde · 13h–18h", full: "Dia inteiro · 08h–18h", custom: "Horário específico" };
export const serviceCode = (number) => `SV-${String(number).padStart(4, "0")}`;
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const validDate = (value) => { const date = new Date(`${value}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
const active = (item) => !["completed", "cancelled"].includes(item.status);
const lastServiceNumber = (data) => Math.max(0, ...(data.services || []).map((row) => Number.isSafeInteger(Number(row.number)) && Number(row.number) > 0 ? Number(row.number) : 0));
export const formatServiceDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "";
export function parseServiceDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || "");
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : "";
  return validDate(iso) ? iso : "";
}
export const serviceSales = (data) => businessSales(data);
export function saleServiceDraft(sale) {
  return {
    ...newService(), saleId: sale.id, opportunityId: sale.opportunityId || "",
    name: sale.work.name || "", address: addressLabel(sale.work), neighborhood: sale.work.neighborhood || "",
    ...Object.fromEntries(["cep", "street", "complement", "state"].map((key) => [key, sale.work[key] || ""])), addressNumber: sale.work.number || "",
    city: sale.work.city || "", contact: sale.work.responsible || "", phone: sale.work.phone || "",
    products: [...sale.products], description: `Instalação de ${sale.products.join(", ")}`,
  };
}
export const newService = () => ({
  name: "", address: "", cep: "", street: "", addressNumber: "", complement: "", state: "", neighborhood: "", city: "", contact: "", phone: "", type: "Instalação",
  description: "", products: [], notes: "", photos: [], appointments: [], saleId: "", opportunityId: "",
});
export const newAppointment = (date = "") => ({ id: uid(), date, endDate: date, period: "morning", startTime: "08:00", endTime: "12:00", installerIds: [], state: "planned" });
export function appointmentHours(item) {
  if (item.period === "morning") return [480, 720];
  if (item.period === "afternoon") return [780, 1080];
  if (item.period === "full") return [480, 1080];
  const minutes = (time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time || "") ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;
  return [minutes(item.startTime), minutes(item.endTime)];
}
export function appointmentsOverlap(a, b) {
  if (a.date > (b.endDate || b.date) || b.date > (a.endDate || a.date)) return false;
  const [aStart, aEnd] = appointmentHours(a), [bStart, bEnd] = appointmentHours(b);
  return aStart < bEnd && bStart < aEnd;
}
export function validateAppointments(data, appointments, serviceId) {
  const ids = new Set();
  const installers = data.installers || [];
  for (const item of appointments) {
    fail(item.id && !ids.has(item.id), "Há agendamentos repetidos. Confira as datas."); ids.add(item.id);
    fail(validDate(item.date) && validDate(item.endDate || item.date), "Informe datas válidas para o serviço.");
    fail((item.endDate || item.date) >= item.date, "A data final deve ser igual ou posterior à data inicial.");
    fail((Date.parse(item.endDate || item.date) - Date.parse(item.date)) / 86400000 <= 365, "Agende no máximo um ano por período.");
    fail(Object.hasOwn(SERVICE_PERIODS, item.period), "Selecione o período do serviço.");
    const [start, end] = appointmentHours(item);
    fail(Number.isFinite(start) && Number.isFinite(end) && end > start, "O horário final deve ser posterior ao inicial.");
    fail(Array.isArray(item.installerIds) && item.installerIds.length > 0, "Selecione ao menos um profissional em cada agendamento.");
    fail(new Set(item.installerIds).size === item.installerIds.length, "Profissional repetido no agendamento.");
    const previous = (data.services || []).find((row) => row.id === serviceId)?.appointments.find((row) => row.id === item.id);
    for (const id of item.installerIds) {
      fail(installers.some((row) => row.id === id && !row.deleted && (!row.inactive || previous?.installerIds.includes(id))), "Selecione profissionais disponíveis da equipe.");
    }
  }
  const other = (data.services || []).filter((row) => row.id !== serviceId && active(row))
    .flatMap((row) => row.appointments.filter((item) => item.state === "planned").map((item) => ({ ...item, serviceName: row.name })));
  appointments.forEach((item, index) => {
    const conflicts = [...other, ...appointments.slice(0, index).map((row) => ({ ...row, serviceName: "este mesmo serviço" }))];
    for (const otherItem of conflicts) {
      const common = item.installerIds.filter((id) => otherItem.installerIds.includes(id));
      if (common.length && appointmentsOverlap(item, otherItem)) {
        const names = common.map((id) => installers.find((row) => row.id === id)?.name).join(", ");
        throw new Error(`${names} já possui agendamento em ${otherItem.serviceName} nesse período. Ajuste a data, o horário ou a equipe.`);
      }
    }
  });
}
function event(type, actor, note, at) { return { id: uid(), type, actor, note, at }; }
function scheduleSummary(appointments, data) {
  return appointments.map((item) => `${formatServiceDate(item.date)}${item.endDate !== item.date ? ` a ${formatServiceDate(item.endDate)}` : ""} · ${item.period === "custom" ? `${item.startTime}–${item.endTime}` : SERVICE_PERIODS[item.period]} · ${item.installerIds.map((id) => data.installers.find((row) => row.id === id)?.name || "Profissional").join(", ")}`).join("; ") || "Sem agendamento";
}
export function saveService(data, draft, actor, at = new Date().toISOString()) {
  const previous = (data.services || []).find((row) => row.id === draft.id);
  fail(!draft.id || previous, "Serviço não encontrado.");
  fail(!previous || active(previous), "Reabra o serviço antes de editar seus dados.");
  const fields = ["name", "address", "neighborhood", "city", "description"];
  for (const field of fields) fail(typeof draft[field] === "string" && draft[field].trim(), "Preencha cliente/obra, endereço, bairro, cidade e descrição do serviço.");
  fail(SERVICE_TYPES.includes(draft.type), "Selecione o tipo do serviço.");
  for (const field of [...fields, "contact", "phone", "notes"]) fail(typeof draft[field] === "string" && draft[field].length <= (field === "notes" || field === "description" ? 4000 : 400), "Há um campo com texto muito longo.");
  fail(!draft.phone || [10, 11].includes(draft.phone.replace(/\D/g, "").length), "Informe um telefone com DDD.");
  for (const field of ["cep", "street", "addressNumber", "complement", "state"]) fail(!draft[field] || typeof draft[field] === "string" && draft[field].length <= 400, "Endereço inválido ou muito longo.");
  fail(!draft.cep || /^\d{8}$/.test(draft.cep.replace(/\D/g, "")), "Informe um CEP com oito dígitos.");
  fail(!draft.state || /^[A-Z]{2}$/.test(draft.state), "Informe uma UF válida.");
  fail(Array.isArray(draft.products) && draft.products.every((name) => typeof name === "string" && name.length <= 180), "Produtos inválidos.");
  fail(Array.isArray(draft.photos) && draft.photos.length <= 6 && new Set(draft.photos.map((photo) => photo.id)).size === draft.photos.length && draft.photos.every((photo) => photo.id && (/^data:image\/(jpeg|png|webp);base64,/.test(photo.url || "") || photo.scope === "service" && typeof photo.key === "string" && photo.key.startsWith("servicos/") && photo.url === undefined)), "Adicione no máximo seis fotos válidas.");
  const sale = draft.saleId ? serviceSales(data).find((row) => row.id === draft.saleId) : null;
  fail(!draft.saleId || sale, "Venda indisponível para vincular ao serviço.");
  fail(!previous || previous.saleId === (draft.saleId || ""), "Preserve a venda vinculada a este serviço.");
  fail(!sale || draft.products.every((name) => sale.products.includes(name)), "Selecione apenas produtos do fechamento vinculado.");
  const planned = draft.appointments.filter((item) => item.state === "planned").map((item) => ({ ...item, endDate: item.endDate || item.date }));
  validateAppointments(data, planned, draft.id);
  const retained = (previous?.appointments || []).filter((item) => item.state !== "planned");
  const removed = (previous?.appointments || []).filter((item) => item.state === "planned" && !planned.some((row) => row.id === item.id)).map((item) => ({ ...item, state: "cancelled" }));
  const changedSchedule = JSON.stringify(previous?.appointments.filter((item) => item.state === "planned") || []) !== JSON.stringify(planned);
  const status = planned.length ? previous?.status === "in_progress" ? "in_progress" : "scheduled" : previous?.status === "return_required" ? "return_required" : "waiting";
  const record = {
    id: previous?.id || uid(), number: Number(previous?.number) > 0 && Number.isSafeInteger(Number(previous.number)) ? Number(previous.number) : Math.max(data.nextInstallationNumber || 1, 1 + lastServiceNumber(data)),
    ...Object.fromEntries([...fields, "contact", "phone", "notes"].map((field) => [field, draft[field].trim()])),
    ...Object.fromEntries(["cep", "street", "addressNumber", "complement", "state"].map((field) => [field, (draft[field] || "").trim()])),
    address: draft.street ? [draft.street, draft.addressNumber, draft.complement].map((value) => value?.trim()).filter(Boolean).join(", ") : draft.address.trim(),
    type: draft.type, products: [...new Set(draft.products)], photos: [...draft.photos],
    saleId: sale?.id || "", opportunityId: sale?.opportunityId || "", sellerId: sale?.sellerTeamId || "",
    appointments: [...retained, ...removed, ...planned], status,
    createdAt: previous?.createdAt || at, updatedAt: at,
    history: [...(previous?.history || []), event(previous ? "edited" : "created", actor, previous ? "Dados do serviço atualizados." : `Serviço criado${sale ? " a partir de uma venda" : " diretamente"}.`, at),
      ...(changedSchedule ? [event("scheduled", actor, `${previous ? `Agenda anterior: ${scheduleSummary(previous.appointments.filter((item) => item.state === "planned"), data)}. ` : ""}Agenda atual: ${scheduleSummary(planned, data)}.`, at)] : [])],
  };
  return { ...data, services: [...(data.services || []).filter((row) => row.id !== record.id), record], nextInstallationNumber: Math.max(data.nextInstallationNumber || 1, record.number + 1),
    serviceDecisions: sale ? { ...(data.serviceDecisions || {}), [sale.id]: "required" } : data.serviceDecisions || {} };
}
export function changeServiceStatus(data, id, status, reason, actor, at = new Date().toISOString()) {
  const item = (data.services || []).find((row) => row.id === id);
  fail(item && Object.hasOwn(SERVICE_STATUSES, status), "Serviço ou situação inválida.");
  const transitions = { waiting: ["cancelled"], scheduled: ["in_progress", "completed", "return_required", "cancelled"], in_progress: ["completed", "return_required", "cancelled"], return_required: ["completed", "cancelled"], completed: ["return_required"], cancelled: ["waiting"] };
  fail(transitions[item.status]?.includes(status), "Esta mudança não está disponível para a situação atual.");
  fail(!["return_required", "cancelled"].includes(status) || reason?.trim(), "Informe o motivo do retorno ou cancelamento.");
  fail(!reason || reason.length <= 2000, "A observação deve ter até 2.000 caracteres.");
  const finish = ["completed", "return_required", "cancelled"].includes(status);
  return { ...data, services: data.services.map((row) => row.id !== id ? row : {
    ...row, status, updatedAt: at,
    appointments: finish ? row.appointments.map((appt) => appt.state === "planned" ? { ...appt, state: status === "cancelled" ? "cancelled" : "completed" } : appt) : row.appointments,
    history: [...row.history, event("status", actor, `${SERVICE_STATUSES[row.status]} → ${SERVICE_STATUSES[status]}${reason?.trim() ? ` · ${reason.trim()}` : ""}`, at)],
  }) };
}
export function saveInstaller(data, draft) {
  const name = draft.name?.trim();
  fail(name && name.length <= 180, "Informe o nome do profissional.");
  fail(!(data.installers || []).some((item) => !item.deleted && item.id !== draft.id && normalize(item.name) === normalize(name)), "Já existe um profissional com esse nome.");
  const previous = (data.installers || []).find((row) => row.id === draft.id);
  fail(!draft.id || previous && !previous.deleted, "Profissional não encontrado.");
  if (draft.inactive && !previous?.inactive) fail(!(data.services || []).some((service) => active(service) && service.appointments.some((appt) => appt.state === "planned" && appt.installerIds.includes(draft.id))), "Este profissional possui serviços agendados. Reatribua os agendamentos antes de desativá-lo.");
  const record = { id: previous?.id || uid(), name, inactive: Boolean(draft.inactive) };
  return { ...data, installers: [...(data.installers || []).filter((row) => row.id !== record.id), record] };
}
export function deleteInstaller(data, id) {
  const previous = (data.installers || []).find((row) => row.id === id && !row.deleted);
  fail(previous, "Profissional não encontrado.");
  fail(!(data.services || []).some((service) => active(service) && service.appointments.some((appt) => appt.state === "planned" && appt.installerIds.includes(id))), "Este profissional possui serviços agendados. Reatribua os agendamentos antes de excluí-lo.");
  return { ...data, installers: data.installers.map((row) => row.id === id ? { ...row, deleted: true, inactive: true } : row) };
}
export function decideInstallation(data, saleId, decision) {
  fail(serviceSales(data).some((row) => row.id === saleId) && ["not_required", "pending"].includes(decision), "Venda ou decisão inválida.");
  fail(decision !== "not_required" || !(data.services || []).some((row) => row.saleId === saleId && active(row)), "Esta venda possui um serviço ativo. Confira-o antes de dispensar a instalação.");
  return { ...data, serviceDecisions: { ...(data.serviceDecisions || {}), [saleId]: decision } };
}
export function shiftServiceDate(date, days) {
  const result = new Date(`${date}T12:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10);
}
export function serviceWeek(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = shiftServiceDate(date, -(day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, index) => shiftServiceDate(monday, index));
}
