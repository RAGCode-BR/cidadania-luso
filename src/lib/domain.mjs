// Equipe que pode ser responsável por cartões. No modo local é a "Equipe Luso";
// no modo compartilhado, os usuários ativos (carregados por setTeam).
// "equipe" continua aceito como cartão sem responsável definido.
export const UNASSIGNED = "equipe";
const LOCAL_TEAM = [{ id: UNASSIGNED, name: "Equipe Luso" }];
export const TEAM = [...LOCAL_TEAM];
export function setTeam(members) {
  const list = (members || []).filter((item) => item?.id && item?.name)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  TEAM.splice(0, TEAM.length, ...(list.length ? list : LOCAL_TEAM));
}
export const isTeamMember = (id) => TEAM.some((item) => item.id === id);
// Válido como responsável: alguém da equipe ou "sem responsável".
export const validResponsible = (id) => id === UNASSIGNED || isTeamMember(id);
export const DATA_VERSION = 2;
export const emptyData = () => ({
  version: DATA_VERSION,
  products: [],
  attendances: [],
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
  TEAM.find((item) => item.id === id)?.name ||
  (id === UNASSIGNED ? "Sem responsável" : "Usuário removido");

// Cliente de uma oportunidade: só nome, telefone e e-mail.
export const newClient = () => ({ name: "", phone: "", email: "" });
export const phoneDigits = (value) => String(value || "").replace(/\D/g, "");
export function validateClient(input) {
  const client = {
    name: String(input?.name || "").trim().replace(/\s+/g, " "),
    phone: String(input?.phone || "").trim(),
    email: String(input?.email || "").trim().toLowerCase(),
  };
  if (!client.name) throw new Error("Informe o nome do cliente.");
  if (client.name.length > 180) throw new Error("O nome do cliente deve ter até 180 caracteres.");
  if (client.phone && !/^\d{10,13}$/.test(phoneDigits(client.phone)))
    throw new Error("Informe um telefone com DDD (10 ou 11 dígitos) ou deixe em branco.");
  if (client.phone.length > 25) throw new Error("O telefone deve ter até 25 caracteres.");
  if (client.email && (client.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)))
    throw new Error("Informe um e-mail válido ou deixe em branco.");
  return client;
}
export const clientContact = (client) => client?.phone || client?.email || "";

// Atendimento: contato registrado com o cliente dentro de uma oportunidade.
export const ATTENDANCE_KINDS = {
  prospecting: "Prospecção",
  relationship: "Relacionamento",
  closing: "Fechamento",
};
export const ATTENDANCE_CHANNELS = {
  meeting: "Reunião presencial",
  video: "Videochamada",
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  other: "Outro",
};
export const newAttendance = (userId, opportunityId) => ({
  opportunityId,
  userId,
  date: today(),
  kind: "prospecting",
  channel: "whatsapp",
  offered: [],
  sold: [],
  saleValue: "",
  notes: "",
});
