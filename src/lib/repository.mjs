import { emptyData } from "./domain.mjs";
import { emptyCrm } from "./crm.mjs";
import { cloud, cloudEnabled } from "./cloud.mjs";

const NAME = "luso-crm-servicos-v1";
let connection;
function openDatabase() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("application");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}
const initial = () => ({ ...emptyData(), crm: emptyCrm(), services: [], installers: [], serviceDecisions: {}, nextInstallationNumber: 1 });
const withRevision = (state, revision) => {
  Object.defineProperty(state, "__revision", { value: revision, enumerable: false });
  return state;
};
const cleanState = (state) => structuredClone(state);
const check = (error) => { if (error) throw new Error(error.message); };

export const localRepository = {
  async load() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction("application", "readonly").objectStore("application").get("state");
      request.onsuccess = () => resolve(request.result || initial());
      request.onerror = () => reject(request.error);
    });
  },
  async save(state) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("application", "readwrite");
      tx.objectStore("application").put(state, "state");
      tx.oncomplete = () => resolve(state);
      tx.onerror = () => reject(tx.error);
    });
  },
};

const cloudRepository = {
  async load() {
    const { data, error } = await cloud.from("luso_workspace").select("state,revision").eq("id", 1).single();
    check(error);
    return withRevision(data.state, data.revision);
  },
  async save(state, expectedRevision) {
    if (!Number.isSafeInteger(expectedRevision)) throw new Error("Recarregue os dados antes de salvar.");
    const { data, error } = await cloud.rpc("luso_save_workspace", {
      expected_revision: expectedRevision, next_state: cleanState(state),
    });
    if (error?.code === "40001") throw new Error("Outra pessoa alterou os dados. Atualize a página e tente novamente.");
    check(error);
    return withRevision(state, data);
  },
  subscribe(callback) {
    const channel = cloud.channel("luso-workspace")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "luso_workspace", filter: "id=eq.1" }, callback)
      .subscribe();
    return () => { cloud.removeChannel(channel); };
  },
};

const store = cloudEnabled ? cloudRepository : localRepository;
export const repository = {
  load: (...args) => store.load(...args),
  save: (...args) => store.save(...args),
  subscribe: (callback) => store.subscribe?.(callback) || (() => {}),
  async importBackupIfEmpty(backup) {
    if (!cloudEnabled) throw new Error("A importação exige o banco compartilhado.");
    if (!backup || backup.version !== 1 || !Array.isArray(backup.works) || !Array.isArray(backup.visits) ||
      !Array.isArray(backup.products) ||
      !backup.crm || !Array.isArray(backup.crm.opportunities) || !Array.isArray(backup.crm.sales) ||
      !Array.isArray(backup.services) || !Array.isArray(backup.installers))
      throw new Error("Este arquivo não é um backup válido da Luso.");
    const current = await cloudRepository.load();
    const hasData = current.works.length || current.visits.length || current.crm.opportunities.length || current.services.length || current.installers.length;
    if (hasData) throw new Error("O banco compartilhado já contém registros. A importação foi cancelada.");
    await cloudRepository.save({ ...initial(), ...backup }, current.__revision);
  },
  async crmProspecting(id) {
    const state = await this.load();
    const linked = new Set(state.crm.visitLinks.filter((row) => row.opportunityId === id && !row.deleted).map((row) => row.visitId));
    return state.visits.filter((row) => linked.has(row.id) && !row.deleted);
  },
  async photoUrl(photo) { return photo.url || ""; },
};
