import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Crm from "./components/Crm.jsx";
import Services from "./components/Services.jsx";
import { Field, Icon, Modal, Select } from "./components/ui.jsx";
import { applyCrmAction, changeCrmColumns, createCrmOpportunity, reconcileLocalCrm } from "./lib/crm.mjs";
import { newVisit, normalize, productName, productNames, recordVisit, today, uid } from "./lib/domain.mjs";
import { preparePhoto } from "./lib/photo.mjs";
import { repository } from "./lib/repository.mjs";
import { cloud, cloudEnabled, memberFor, signedInUser } from "./lib/cloud.mjs";
import "./styles.css";
import "./readability.css";
import "./luso.css";

const localActor = { role: "admin", teamId: "equipe", name: "Equipe Luso" };
function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [actor, setActor] = useState(cloudEnabled ? null : localActor);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("crm");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [visitTarget, setVisitTarget] = useState(null);
  const [serviceSeed, setServiceSeed] = useState(null);
  const queue = useRef(Promise.resolve());
  const accessKey = useRef(null);
  useEffect(() => {
    if (!cloudEnabled) return;
    let live = true;
    let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const nextUser = await signedInUser();
        const nextActor = await memberFor(nextUser);
        if (!live || current !== sequence) return;
        const nextKey = nextActor ? `${nextUser.id}:${nextActor.name}` : nextUser?.id || "";
        if (accessKey.current !== nextKey) {
          accessKey.current = nextKey;
          setData(null);
        }
        setUser(nextUser);
        setActor(nextActor);
        setError(nextUser && !nextActor ? "Sua conta ainda não foi autorizada para a equipe Luso." : "");
      } catch (cause) {
        if (live && current === sequence) {
          accessKey.current = "";
          setUser(null); setActor(null); setData(null); setError(cause.message);
        }
      }
      finally { if (live && current === sequence) setAuthReady(true); }
    };
    refresh();
    const { data: listener } = cloud.auth.onAuthStateChange(() => { setTimeout(refresh, 0); });
    return () => { live = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!actor) return;
    let live = true;
    repository.load().then((state) => { if (live) setData(state); }).catch((cause) => { if (live) setError(cause.message); });
    const unsubscribe = repository.subscribe(() => repository.load().then((state) => { if (live) setData(state); }).catch((cause) => { if (live) setError(cause.message); }));
    return () => { live = false; unsubscribe(); };
  }, [actor?.name]);
  const commit = useCallback((update) => {
    const next = queue.current.then(async () => {
      const current = await repository.load();
      const state = update(current);
      await repository.save(state, current.__revision);
      setData(state);
      return state;
    });
    queue.current = next.catch(() => {});
    return next;
  }, []);
  const createCard = useCallback((draft, stage) => commit((current) => {
    const names = [...new Set(draft.products.split(",").map(productName).filter(Boolean))];
    if (!names.length) throw new Error("Informe ao menos um produto.");
    if (names.some((name) => name.length > 80)) throw new Error("Cada produto deve ter até 80 caracteres.");
    const existing = draft.workId ? current.works.find((row) => row.id === draft.workId && !row.deleted) : null;
    if (draft.workId && !existing) throw new Error("Obra indisponível.");
    const work = existing || {
      id: uid(), name: draft.name.trim(), street: draft.street.trim(), number: draft.number.trim(),
      neighborhood: draft.neighborhood.trim(), city: draft.city.trim(), state: draft.state.trim().toUpperCase(),
      responsible: draft.responsible.trim(), phone: draft.phone.trim(), type: "Comercial",
      ownerId: actor.teamId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    if (!work.name || !work.street || !work.neighborhood || !work.city || !/^[A-Z]{2}$/.test(work.state))
      throw new Error("Preencha obra, rua, bairro, cidade e UF.");
    const crm = createCrmOpportunity(current.crm, work, actor, { stage });
    const item = crm.opportunities.find((row) => row.primaryWorkId === work.id && !row.deleted);
    item.products = [...new Set([...item.products, ...names])];
    item.pendingProducts = [...new Set([...item.pendingProducts, ...names.filter((name) => !item.completedProducts.includes(name))])];
    const known = new Set(productNames(current).map(normalize));
    const products = [...current.products, ...names.filter((name) => !known.has(normalize(name))).map((name) => ({ id: uid(), name }))];
    return { ...current, products, works: existing ? current.works : [...current.works, work], crm };
  }), [commit, actor]);
  const crmAction = useCallback((id, action) => commit((current) => ({
    ...current, crm: applyCrmAction(current.crm, id, action, actor, productNames(current)),
  })), [commit, actor]);
  const columns = useCallback((action) => commit((current) => ({ ...current, crm: changeCrmColumns(current.crm, action, actor) })), [commit, actor]);
  const labels = useCallback((next) => commit((current) => {
    const order = current.crm.stageOrder;
    if (order.some((id) => !next[id]?.trim()) || new Set(order.map((id) => normalize(next[id]))).size !== order.length)
      throw new Error("Informe nomes diferentes para as colunas.");
    return { ...current, crm: { ...current.crm, stageLabels: next } };
  }), [commit]);
  const saveServices = useCallback((update) => commit(update), [commit]);
  const saveVisit = useCallback((draft) => commit((current) => {
    const next = recordVisit(current, draft);
    return reconcileLocalCrm(next, actor);
  }), [commit, actor]);
  const backup = async () => {
    setError("");
    try {
      const state = await repository.load();
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `luso-backup-${today()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause.message); }
  };
  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm(`Importar ${file.name} para o banco compartilhado vazio?`)) return;
    setError("");
    try {
      const backup = JSON.parse(await file.text());
      await repository.importBackupIfEmpty(backup);
      setData(await repository.load());
    }
    catch (cause) { setError(cause.message); }
  };
  const navigate = (target) => { setPage(target); setMobileMenu(false); };
  if (!authReady) return <main className="luso-startup" role="status">Verificando acesso…</main>;
  if (cloudEnabled && !user) return <Login />;
  if (cloudEnabled && !actor) return <main className="luso-startup"><h1>Acesso pendente</h1><p>{error || "Esta conta ainda não faz parte da equipe Luso."}</p><button className="button secondary" onClick={() => cloud.auth.signOut()}>Sair</button></main>;
  if (error && !data) return <main className="luso-startup"><h1>Não foi possível abrir a Luso</h1><p>{error}</p><button className="button primary" onClick={() => location.reload()}>Tentar novamente</button></main>;
  if (!data) return <main className="luso-startup" role="status">Carregando CRM e Serviços…</main>;
  return <div className="app-shell luso-app">
    <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
    <aside className={`sidebar ${mobileMenu ? "open" : ""}`} aria-label="Navegação principal">
      <div className="luso-brand"><span className="luso-mark">L</span><div><strong>LUSO</strong><small>CRM & Serviços</small></div></div>
      <nav aria-label="Navegação principal">
        <button className={page === "crm" ? "active" : ""} onClick={() => navigate("crm")}><Icon name="kanban" /><span>CRM</span></button>
        <button className={page === "services" ? "active" : ""} onClick={() => navigate("services")}><Icon name="tools" /><span>Serviços</span></button>
      </nav>
      <div className="luso-side-note">{cloudEnabled ? `Conectado: ${actor.name}` : "Seus dados ficam neste navegador."}</div>
    </aside>
    {mobileMenu && <button className="luso-menu-backdrop" aria-label="Fechar navegação" onClick={() => setMobileMenu(false)} />}
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="menu-toggle" aria-label="Abrir navegação" onClick={() => setMobileMenu(true)}><Icon name="menu" /></button><span>Luso</span><Icon name="chevron" size={15} /><strong>{page === "crm" ? "CRM" : "Serviços"}</strong></div><div className="luso-tools"><span className="luso-local-badge">{cloudEnabled ? "Banco compartilhado" : "Armazenamento local"}</span><button className="button secondary" onClick={backup}>Baixar backup</button>{cloudEnabled && <label className="button secondary luso-import">Importar backup<input type="file" accept="application/json,.json" onChange={importBackup} /></label>}{cloudEnabled && <button className="button secondary" onClick={() => cloud.auth.signOut()}>Sair</button>}</div></header>
      <main id="main-content">{error && <p className="error" role="alert">{error}</p>}<div className="page-header"><div><span className="eyebrow">LUSO</span><h1>{page === "crm" ? "Oportunidades em movimento." : "Da venda à entrega."}</h1><p>{page === "crm" ? "Acompanhe negociações, fechamentos e próximos passos." : "Organize instalações, equipe e retornos."}</p></div></div>
        {page === "crm" ? <Crm data={data} actorId={actor.teamId} account={actor} onAction={crmAction} onCreate={createCard} onColumns={columns} onLabels={labels} onVisit={setVisitTarget} onServices={(saleId) => { setServiceSeed({ saleId, nonce: Date.now() }); navigate("services"); }} /> : <Services data={data} save={saveServices} actor={actor.name} seed={serviceSeed} />}
      </main>
      <footer className="workspace-footer"><span>Luso</span><span>CRM & Serviços</span></footer>
    </div>
    {visitTarget && <VisitCapture opportunity={visitTarget} actor={actor} onClose={() => setVisitTarget(null)} onSave={saveVisit} />}
  </div>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: cause } = await cloud.auth.signInWithPassword({ email: email.trim(), password });
      if (cause) throw cause;
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <main className="luso-login-screen"><div className="luso-login-card">
    <div className="luso-login-brand"><span className="luso-mark">L</span><strong>LUSO</strong></div>
    <div className="luso-login-stripe" aria-hidden="true" />
    <h1>Acesse sua conta</h1><p>Entre para acompanhar o CRM e os serviços da Luso.</p>
    <form onSubmit={submit} className="luso-login-form">
      <Field label="E-mail" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <Field label="Senha" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  </div></main>;
}

function VisitCapture({ opportunity, actor, onClose, onSave }) {
  const work = opportunity.work;
  const [form, setForm] = useState(() => ({ ...newVisit(actor.teamId), workId: opportunity.primaryWorkId, workName: work.name,
    ...Object.fromEntries(["cep", "street", "number", "complement", "neighborhood", "city", "state", "type", "responsible", "phone"].map((key) => [key, work[key] || ""])),
    offered: [...opportunity.pendingProducts], sellerId: opportunity.responsibleId, crmOpportunityId: opportunity.id }));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const upload = async (event) => {
    const files = [...event.target.files];
    if (form.photos.length + files.length > 6) return setError("Adicione no máximo seis fotos.");
    setBusy(true);
    try { const photos = await Promise.all(files.map(preparePhoto)); setForm((current) => ({ ...current, photos: [...current.photos, ...photos] })); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await onSave(form); onClose(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <Modal title={`Registrar visita · ${work.name}`} onClose={() => !busy && onClose()} wide><form onSubmit={submit} className="luso-visit-form">
    <p>Registre a visita nesta oportunidade. O histórico e a autoria permanecem vinculados à obra.</p>
    <div className="fields two"><Field label="Data da visita" type="date" max={today()} value={form.date} onChange={change("date")} required /><Select label="Tipo de visita" value={form.stage} onChange={(stage) => setForm((current) => ({ ...current, stage, sold: stage === "closing" ? current.sold : [], saleValue: stage === "closing" ? current.saleValue : "" }))}><option value="prospecting">Prospecção</option><option value="relationship">Relacionamento</option><option value="closing">Fechamento</option></Select></div>
    <fieldset className="crm-product-options"><legend>Produtos oferecidos</legend>{opportunity.products.map((name) => <label key={name}><input type="checkbox" checked={form.offered.includes(name)} onChange={(event) => setForm((current) => ({ ...current, offered: event.target.checked ? [...current.offered, name] : current.offered.filter((row) => row !== name), sold: event.target.checked ? current.sold : current.sold.filter((row) => row !== name) }))} />{name}</label>)}</fieldset>
    {form.stage === "closing" && <><fieldset className="crm-product-options"><legend>Produtos vendidos</legend>{form.offered.map((name) => <label key={name}><input type="checkbox" checked={form.sold.includes(name)} onChange={(event) => setForm((current) => ({ ...current, sold: event.target.checked ? [...current.sold, name] : current.sold.filter((row) => row !== name) }))} />{name}</label>)}</fieldset><Field label="Valor total vendido (R$)" type="number" min="0" step="0.01" value={form.saleValue} onChange={change("saleValue")} /></>}
    <Field label="Anotações"><textarea value={form.notes} onChange={change("notes")} rows={3} maxLength={4000} /></Field>
    <Field label="Fotos da visita"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} /></Field>{!!form.photos.length && <p>{form.photos.length} foto(s) adicionada(s)</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar visita"}</button></footer>
  </form></Modal>;
}

createRoot(document.getElementById("root")).render(<App />);
