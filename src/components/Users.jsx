import React, { useCallback, useEffect, useRef, useState } from "react";
import { listMembers, manageUsers } from "../lib/cloud.mjs";
import { PASSWORD_MAX, PASSWORD_MIN, credentialsText, editUserDraft, newUserDraft, temporaryPassword, validateNewUser, validateUserEdit } from "../lib/users.mjs";
import { Badge, Empty, Field, Icon, Modal, PageHeader, Summary } from "./ui.jsx";
import "../products.css";
import "../users.css";

export default function Users({ actor, onSelfUpdated, onImportBackup, onTeamChanged }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const load = useCallback(() => listMembers().then(setMembers).catch((cause) => setError(cause.message)), []);
  // Criar, editar ou excluir muda a lista de responsáveis do CRM.
  const changed = useCallback(() => { load(); onTeamChanged?.(); }, [load, onTeamChanged]);
  useEffect(() => { load(); }, [load]);
  const list = members || [];
  const saved = (user) => {
    changed();
    if (user?.user_id === actor.userId) onSelfUpdated?.(user);
  };
  return <div className="products-page">
    <PageHeader title="Usuários" note="Contas novas entram com senha temporária. No primeiro acesso, cada pessoa define a própria senha.">
      {onImportBackup && <label className="button secondary file-button"><Icon name="upload" size={18} />Importar backup<input type="file" accept="application/json,.json" onChange={onImportBackup} /></label>}
      <button className="button primary" onClick={() => setEditing(newUserDraft())}><Icon name="plus" size={18} />Novo usuário</button>
    </PageHeader>
    <Summary label="Resumo dos usuários" items={[
      { label: "Usuários", value: list.length },
      { label: "Administradores", value: list.filter((row) => row.is_admin).length },
      { label: "Aguardando primeiro acesso", value: list.filter((row) => row.must_change_password).length },
    ]} />
    <section className="panel products-panel">
      {error && <p className="error" role="alert">{error}</p>}
      {!members && !error && <p className="products-none" role="status">Carregando usuários…</p>}
      {members && !list.length && <Empty icon="users" title="Nenhum usuário" description="Crie a primeira conta da equipe." />}
      {!!list.length && <ul className="products-list" aria-label="Usuários cadastrados">
        {list.map((row) => <li key={row.user_id}>
          <div className="products-main">
            <strong>{row.display_name}</strong>
            <p>Login: {row.login || "—"}</p>
            <div className="users-badges">
              {row.user_id === actor.userId && <Badge tone="success">Você</Badge>}
              {row.is_admin ? <Badge tone="blue">Administrador</Badge> : <Badge>Usuário</Badge>}
              {row.must_change_password && <Badge tone="red">Aguardando primeiro acesso</Badge>}
            </div>
          </div>
          <span className="products-price empty">Criado em {new Date(row.created_at).toLocaleDateString("pt-BR")}</span>
          <div className="products-actions">
            <button className="icon-button" aria-label={`Editar ${row.display_name}`} title="Editar usuário" onClick={() => setEditing(editUserDraft(row))}><Icon name="edit" size={18} /></button>
            {row.user_id !== actor.userId
              ? <button className="icon-button danger" aria-label={`Excluir ${row.display_name}`} title="Excluir usuário" onClick={() => setRemoving(row)}><Icon name="trash" size={18} /></button>
              : <button className="icon-button" disabled aria-label="Você não pode excluir a própria conta" title="Você não pode excluir a própria conta"><Icon name="trash" size={18} /></button>}
          </div>
        </li>)}
      </ul>}
    </section>
    {editing && <UserForm key={editing.userId || "new"} initial={editing} self={editing.userId === actor.userId} onClose={() => setEditing(null)} onSaved={saved}
      onDelete={() => { const row = list.find((item) => item.user_id === editing.userId); setEditing(null); if (row) setRemoving(row); }} />}
    {removing && <DeleteUser member={removing} onClose={() => setRemoving(null)} onDeleted={changed} />}
  </div>;
}

// Formulário único: cria usuário (senha obrigatória) ou edita (senha opcional,
// que vira nova senha temporária).
function UserForm({ initial, self, onClose, onSaved, onDelete }) {
  const editing = Boolean(initial.userId);
  const [draft, setDraft] = useState(initial);
  const [resetting, setResetting] = useState(!editing);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = editing ? validateUserEdit({ ...draft, password: resetting ? draft.password : "" }) : validateNewUser(draft);
      if (editing && resetting && !input.password) throw new Error("Informe a nova senha temporária ou desmarque a redefinição.");
      const result = await manageUsers(editing ? "update" : "create", input);
      onSaved(result?.user);
      if (input.password) setDone(input);
      else onClose();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  if (done) return <Credentials title={editing ? "Senha redefinida" : "Usuário criado"} user={done} onClose={onClose} />;
  const passwordField = <div className="users-password-row">
    <Field label={editing ? "Nova senha temporária" : "Senha temporária"} value={draft.password} onChange={field("password")} required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
      autoComplete="new-password" spellCheck={false} hint={`Mínimo de ${PASSWORD_MIN} caracteres. A pessoa troca no ${editing ? "próximo" : "primeiro"} acesso.`} />
    <button type="button" className="button secondary" onClick={() => setDraft((current) => ({ ...current, password: temporaryPassword() }))}>Gerar senha</button>
  </div>;
  return <Modal title={editing ? "Editar usuário" : "Novo usuário"} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <Field label="Nome" value={draft.name} onChange={field("name")} required maxLength={120} autoComplete="off" autoFocus hint="Aparece no sistema como autor das ações." />
      <Field label="Login" value={draft.login} onChange={field("login")} required maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false}
        hint={editing ? "Se mudar o login, a pessoa passa a entrar com o login novo." : "De 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado."} />
      {!editing && passwordField}
      <label className="users-admin-option">
        <input type="checkbox" checked={draft.isAdmin} disabled={self} onChange={(event) => setDraft((current) => ({ ...current, isAdmin: event.target.checked }))} />
        <span><strong>Administrador</strong><small>{self ? "Você não pode remover o próprio acesso de administrador." : "Pode acessar esta página e criar, editar ou excluir usuários."}</small></span>
      </label>
      {editing && !self && <>
        <label className="users-admin-option">
          <input type="checkbox" checked={resetting} onChange={(event) => setResetting(event.target.checked)} />
          <span><strong>Redefinir senha</strong><small>Define uma nova senha temporária. A pessoa terá de criar outra senha no próximo acesso.</small></span>
        </label>
        {resetting && passwordField}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="modal-actions">
        {editing && !self && <button type="button" className="button text-button users-delete-link" onClick={onDelete} disabled={busy}><Icon name="trash" size={16} />Excluir usuário</button>}
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="button primary" disabled={busy}>{busy ? "Salvando…" : editing ? "Salvar alterações" : "Criar usuário"}</button>
      </footer>
    </form>
  </Modal>;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // Alternativa para navegadores que bloqueiam a área de transferência.
    const area = Object.assign(document.createElement("textarea"), { value: text });
    area.setAttribute("readonly", "");
    Object.assign(area.style, { position: "fixed", opacity: "0" });
    document.querySelector("dialog[open]")?.append(area) ?? document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function Credentials({ title, user, onClose }) {
  const [status, setStatus] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const ok = await copyText(credentialsText(user));
    setStatus(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 2500);
  };
  return <Modal title={title} onClose={onClose}>
    <p>Passe estes dados para <strong>{user.name}</strong>. No próximo acesso, o sistema pedirá uma senha nova.</p>
    <div className="users-credentials-box">
      <dl className="users-credentials">
        <dt>Login</dt><dd>{user.login}</dd>
        <dt>Senha temporária</dt><dd>{user.password}</dd>
      </dl>
      <button type="button" className={`icon-button users-copy ${status}`} onClick={copy}
        aria-label={status === "copied" ? "Login e senha copiados" : "Copiar login e senha"} title={status === "copied" ? "Copiado" : "Copiar login e senha"}>
        <Icon name={status === "copied" ? "check" : "copy"} size={18} />
      </button>
    </div>
    <p className="visually-hidden" role="status">{status === "copied" ? "Login e senha copiados." : ""}</p>
    {status === "failed" && <p className="error" role="alert">Não foi possível copiar. Selecione o login e a senha e copie manualmente.</p>}
    <footer className="modal-actions">
      <button className="button primary" onClick={onClose}>Concluir</button>
    </footer>
  </Modal>;
}

function DeleteUser({ member, onClose, onDeleted }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try { await manageUsers("delete", { userId: member.user_id }); onDeleted(); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Excluir usuário?" onClose={() => !busy && onClose()}>
    <p><strong>{member.display_name}</strong> ({member.login}) perderá o acesso ao sistema. Cartões, atendimentos e o histórico registrados por essa pessoa continuam no CRM.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions"><button className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
      <button className="button primary" disabled={busy} onClick={submit}>{busy ? "Excluindo…" : "Excluir usuário"}</button></footer>
  </Modal>;
}
