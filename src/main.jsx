import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Crm from "./components/Crm.jsx";
import Products from "./components/Products.jsx";
import Users from "./components/Users.jsx";
import { Field, Icon, Modal, Select } from "./components/ui.jsx";
import { applyCrmAction, changeCrmColumns, createCrmOpportunity, recordAttendance } from "./lib/crm.mjs";
import { ATTENDANCE_CHANNELS, ATTENDANCE_KINDS, newAttendance, normalize, productName, productNames, setTeam, today } from "./lib/domain.mjs";
import { deleteProduct, ensureProducts, saveProduct } from "./lib/products.mjs";
import { repository } from "./lib/repository.mjs";
import { cloud, cloudEnabled, listTeam, manageUsers, memberFor, signedInUser } from "./lib/cloud.mjs";
import { authErrorMessage, loginEmail } from "./lib/login.mjs";
import { PASSWORD_MAX, PASSWORD_MIN, validatePasswordChange } from "./lib/users.mjs";
import "./base.css";

const localActor = { role: "admin", teamId: "equipe", name: "Equipe Luso" };
const logoUrl = `${import.meta.env.BASE_URL}luso-logo.png`;
const PAGES = [
  { id: "crm", label: "CRM", icon: "kanban" },
  { id: "products", label: "Produtos", icon: "passport" },
  { id: "users", label: "Usuários", icon: "users", admin: true },
];
function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [actor, setActor] = useState(cloudEnabled ? null : localActor);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("crm");
  const [attendanceTarget, setAttendanceTarget] = useState(null);
  const [, setTeamTick] = useState(0);
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
  // Equipe (responsáveis pelos cartões): carregada junto com os dados. Se a
  // lista falhar, o próprio usuário continua podendo trabalhar.
  const refreshTeam = useCallback(async () => {
    if (!cloudEnabled || !actor) return;
    try { setTeam(await listTeam()); }
    catch { setTeam([{ id: actor.teamId, name: actor.name }]); }
    setTeamTick((tick) => tick + 1);
  }, [actor?.teamId, actor?.name]);
  useEffect(() => {
    if (!actor) return;
    let live = true;
    const loadAll = () => Promise.all([repository.load(), refreshTeam()])
      .then(([state]) => { if (live) setData(state); })
      .catch((cause) => { if (live) setError(cause.message); });
    loadAll();
    const unsubscribe = repository.subscribe(loadAll);
    return () => { live = false; unsubscribe(); };
  }, [actor?.name, refreshTeam]);
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
    const typed = [...draft.products, ...draft.newProducts.split(",")].map(productName).filter(Boolean);
    if (!typed.length) throw new Error("Selecione ou informe ao menos um produto.");
    if (typed.some((name) => name.length > 80)) throw new Error("Cada produto deve ter até 80 caracteres.");
    const catalog = ensureProducts(current, typed);
    const names = catalog.names;
    const crm = createCrmOpportunity(current.crm, draft.client, actor, { stage, responsibleId: draft.responsibleId });
    const item = crm.opportunities.at(-1);
    item.products = [...names];
    item.pendingProducts = [...names];
    return { ...current, products: catalog.data.products, crm };
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
  const saveProductDraft = useCallback((draft) => commit((current) => saveProduct(current, draft)), [commit]);
  const removeProduct = useCallback((id) => commit((current) => deleteProduct(current, id)), [commit]);
  const saveAttendance = useCallback((draft) => commit((current) =>
    recordAttendance(current, { ...draft, allowedProducts: productNames(current) }, actor)), [commit, actor]);
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
  const navigate = (target) => { setPage(target); window.scrollTo({ top: 0 }); };
  if (!authReady) return <main className="status-screen" role="status">Verificando acesso…</main>;
  if (cloudEnabled && !user) return <Login />;
  if (cloudEnabled && !actor) return <main className="status-screen"><h1>Acesso pendente</h1><p>{error || "Esta conta ainda não faz parte da equipe Luso. Peça acesso a um administrador."}</p><button className="button secondary" onClick={() => cloud.auth.signOut()}>Sair</button></main>;
  if (error && !data) return <main className="status-screen"><h1>Não foi possível abrir a Luso</h1><p>{error}</p><button className="button primary" onClick={() => location.reload()}>Tentar novamente</button></main>;
  if (cloudEnabled && actor.mustChangePassword) return <FirstAccess actor={actor} onDone={() => setActor((current) => ({ ...current, mustChangePassword: false }))} />;
  if (!data) return <main className="status-screen" role="status">Carregando CRM e Produtos…</main>;
  const canManageUsers = cloudEnabled && actor.isAdmin;
  const pages = PAGES.filter((item) => !item.admin || canManageUsers);
  const current = pages.some((item) => item.id === page) ? page : "crm";
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
    <aside className="sidebar">
      <div className="brand"><img src={logoUrl} alt="Cidadania Luso Italiana Assessoria" /></div>
      <nav aria-label="Navegação principal">
        {pages.map((item) => <button key={item.id} aria-current={current === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>
          <Icon name={item.icon} /><span>{item.label}</span>
        </button>)}
        {cloudEnabled && <button className="nav-logout" onClick={() => cloud.auth.signOut()}><Icon name="logout" /><span>Sair</span></button>}
      </nav>
      {cloudEnabled && <div className="account">
        <span className="account-name">{actor.name}</span>
        <span className="account-role">{actor.isAdmin ? "Administrador" : "Usuário"}</span>
        <button className="account-logout" onClick={() => cloud.auth.signOut()}><Icon name="logout" size={18} />Sair</button>
      </div>}
    </aside>
    <main id="main-content" className="workspace">
      {error && <p className="error" role="alert">{error}</p>}
      {current === "crm" && <Crm data={data} actorId={actor.teamId} account={actor} onAction={crmAction} onCreate={createCard} onColumns={columns} onLabels={labels} onAttendance={setAttendanceTarget} />}
      {current === "products" && <Products data={data} onSave={saveProductDraft} onDelete={removeProduct} />}
      {current === "users" && <Users actor={actor} onImportBackup={importBackup} onTeamChanged={refreshTeam} onSelfUpdated={(user) => setActor((value) => ({ ...value, name: user.display_name, login: user.login }))} />}
    </main>
    {attendanceTarget && <AttendanceCapture opportunity={attendanceTarget} catalog={productNames(data)} actor={actor} onClose={() => setAttendanceTarget(null)} onSave={saveAttendance} />}
  </div>;
}

function FirstAccess({ actor, onDone }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = validatePasswordChange(password, confirmation);
      await manageUsers("set-password", { password: next });
      // Trocar a senha encerra a sessão atual no Supabase; entra de novo com a senha nova.
      const { error: cause } = await cloud.auth.signInWithPassword({ email: loginEmail(actor.login), password: next });
      if (cause) throw new Error("Senha salva. Entre novamente com a nova senha.");
      onDone();
    } catch (cause) { setError(cause.message); setBusy(false); }
  };
  return <main className="auth-screen"><div className="auth-card">
    <img className="auth-logo" src={logoUrl} alt="Cidadania Luso Italiana Assessoria" />
    <h1>Defina sua senha</h1><p>Olá, {actor.name}. Este é seu primeiro acesso: troque a senha temporária por uma senha só sua.</p>
    <form onSubmit={submit} className="auth-form">
      <Field label="Nova senha" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={password} onChange={(event) => setPassword(event.target.value)} required hint={`Mínimo de ${PASSWORD_MIN} caracteres.`} />
      <Field label="Confirme a nova senha" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar senha e entrar"}</button>
      <button type="button" className="button text-button" disabled={busy} onClick={() => cloud.auth.signOut()}>Sair sem trocar a senha</button>
    </form>
  </div></main>;
}

function Login() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: cause } = await cloud.auth.signInWithPassword({ email: loginEmail(login), password });
      if (cause) throw cause;
    } catch (cause) { setError(authErrorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <main className="auth-screen"><div className="auth-card">
    <img className="auth-logo" src={logoUrl} alt="Cidadania Luso Italiana Assessoria" />
    <h1>Acesse sua conta</h1><p>Use o login e a senha que a administração enviou para você.</p>
    <form onSubmit={submit} className="auth-form">
      <Field label="Login" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={40} value={login} onChange={(event) => setLogin(event.target.value)} required />
      <Field label="Senha" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  </div></main>;
}

function AttendanceCapture({ opportunity, catalog, actor, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...newAttendance(actor.teamId, opportunity.id), offered: [...opportunity.pendingProducts] }));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const options = [...new Set([...opportunity.products, ...catalog])];
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const toggle = (key, name) => (event) => setForm((current) => {
    const list = event.target.checked ? [...current[key], name] : current[key].filter((row) => row !== name);
    return key === "offered" ? { ...current, offered: list, sold: current.sold.filter((row) => list.includes(row)) } : { ...current, [key]: list };
  });
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await onSave(form); onClose(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <Modal title={`Atendimento de ${opportunity.client.name}`} onClose={() => !busy && onClose()} wide><form onSubmit={submit} className="attendance-form">
    <p className="form-note">Os produtos apresentados entram na negociação. Num atendimento de fechamento, marque também o que foi vendido.</p>
    <div className="fields two"><Field label="Data do atendimento" type="date" max={today()} value={form.date} onChange={change("date")} required />
      <Select label="Forma de contato" value={form.channel} onChange={(channel) => setForm((current) => ({ ...current, channel }))}>{Object.entries(ATTENDANCE_CHANNELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></div>
    <Select label="Tipo de atendimento" value={form.kind} onChange={(kind) => setForm((current) => ({ ...current, kind, sold: kind === "closing" ? current.sold : [], saleValue: kind === "closing" ? current.saleValue : "" }))}>{Object.entries(ATTENDANCE_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select>
    {options.length ? <fieldset className="crm-product-options"><legend>Produtos apresentados</legend>{options.map((name) => <label key={name}><input type="checkbox" checked={form.offered.includes(name)} onChange={toggle("offered", name)} />{name}</label>)}</fieldset>
      : <p className="inline-note">Cadastre produtos na página Produtos para apresentá-los no atendimento.</p>}
    {form.kind === "closing" && <><fieldset className="crm-product-options"><legend>Produtos vendidos</legend>{form.offered.map((name) => <label key={name}><input type="checkbox" checked={form.sold.includes(name)} onChange={toggle("sold", name)} />{name}</label>)}</fieldset><Field label="Valor total vendido (R$)" type="number" min="0" step="0.01" value={form.saleValue} onChange={change("saleValue")} /></>}
    <Field label="Anotações"><textarea value={form.notes} onChange={change("notes")} rows={4} maxLength={4000} placeholder="O que foi conversado, dúvidas do cliente, combinados…" /></Field>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar atendimento"}</button></footer>
  </form></Modal>;
}

createRoot(document.getElementById("root")).render(<App />);
