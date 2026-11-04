import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalize, uid } from "../lib/domain.mjs";

const paths = {
  tools: "M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z",
  kanban:
    "M3 4h18v16H3z M9 4v16 M15 4v16 M5 8h2 M11 8h2 M17 8h2 M5 12h2 M11 12h2",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  plus: "M12 5v14 M5 12h14",
  visit:
    "M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  calendar:
    "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z M7 14h2 M12 14h2 M7 18h2",
  building:
    "M3 21h18 M5 21V5l10-3v19 M15 9h4v12 M8 7h3 M8 11h3 M8 15h3 M8 19h3",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M18 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87",
  chart: "M3 3v18h18 M7 16v-5 M12 16V7 M17 16v-9",
  box: "m12 3 9 5v9l-9 5-9-5V8l9-5Z m-9 5 9 5 9-5 M12 13v9 M7.5 5.5l9 5",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  check: "m5 12 4 4L19 6",
  camera:
    "M14.5 4h-5L7 7H3v13h18V7h-4l-2.5-3Z M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  search: "M21 21l-5-5 M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  close: "m6 6 12 12 M6 18 18 6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  reorder: "M4 7h16 M4 12h16 M4 17h16 M8 4l-3 3 3 3 M16 14l3 3-3 3",
  "move-up": "M12 19V5 M6 11l6-6 6 6",
  "move-down": "M12 5v14 M6 13l6 6 6-6",
  grip: "M9 5h.01 M15 5h.01 M9 12h.01 M15 12h.01 M9 19h.01 M15 19h.01",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  print: "M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v7H6z M17 12h1",
  trend: "m3 17 6-6 4 4 8-10 M15 5h6v6",
  clock: "M12 8v5l3 2 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  edit: "m16 3 5 5-12 12-6 1 1-6L16 3Z m-2 2 5 5",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  info: "M12 11v6 M12 7h.01 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  phone: "m5 3 4 4-2 3a16 16 0 0 0 7 7l3-2 4 4c-1 5-7 3-12-1S1 5 5 3Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10Z M10 21h4",
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.box} />
    </svg>
  );
}
export function Field({ label, hint, children, className = "", ...props }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        {props.required && <span className="required"> *</span>}
      </label>
      {children ? (
        React.cloneElement(children, { id })
      ) : (
        <input id={id} {...props} />
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  children,
  required,
  ...props
}) {
  return (
    <Field label={label} required={required}>
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}
export function Empty({
  title = "Tudo começa com a primeira visita",
  description = "Os registros aparecerão aqui conforme você usar o sistema.",
  action,
  icon = "building",
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={29} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon = "chart",
  accent = false,
}) {
  return (
    <article className={`metric ${accent ? "metric-accent" : ""}`}>
      <div>
        <span>{label}</span>
        <i>
          <Icon name={icon} />
        </i>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
export function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">LUSO</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Fechar janela"
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
export function ContactForm({ initial, role, data, save, onClose, onCreated }) {
  const [form, setForm] = useState(
    initial || {
      name: "",
      role: role || "contractor",
      phone: "",
      phone2: "",
      city: "",
      company: "",
      notes: "",
    },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (key) => (event) =>
    setForm({ ...form, [key]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Informe o nome do contato.");
    const duplicate = data.contacts.find(
      (item) =>
        !item.deleted &&
        normalize(item.name) === normalize(form.name) &&
        item.role === form.role &&
        item.id !== form.id,
    );
    if (duplicate)
      return setError(
        "Já existe um contato com esse nome e essa função. Selecione-o na lista.",
      );
    setBusy(true);
    try {
      const contact = { ...form, name: form.name.trim(), id: form.id || uid() };
      await save((current) => {
        if (
          form.id &&
          current.contacts.find((item) => item.id === form.id)?.deleted
        )
          throw new Error("Este contato já foi excluído.");
        return {
          ...current,
          contacts: form.id
            ? current.contacts.map((item) =>
                item.id === form.id ? contact : item,
              )
            : [...current.contacts, contact],
        };
      }, "Contato salvo.");
      onCreated?.(contact);
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={form.id ? "Editar contato" : "Novo contato"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Field
          label="Nome completo"
          value={form.name}
          onChange={change("name")}
          required
          maxLength={180}
          autoFocus
        />
        <Select
          label="Função"
          value={form.role}
          onChange={(role) => setForm({ ...form, role })}
        >
          <option value="contractor">Empreiteiro</option>
          <option value="architect">Arquiteto</option>
          <option value="responsible">Responsável pela obra</option>
        </Select>
        <div className="fields two">
          <Field
            label="Telefone"
            value={form.phone}
            onChange={change("phone")}
            type="tel"
            maxLength={25}
          />
          <Field
            label="Segundo telefone"
            value={form.phone2 || ""}
            onChange={change("phone2")}
            type="tel"
            maxLength={25}
          />
        </div>
        <div className="fields two">
          <Field
            label="Empresa / escritório"
            value={form.company}
            onChange={change("company")}
            maxLength={180}
          />
          <Field
            label="Cidade"
            value={form.city || ""}
            onChange={change("city")}
            maxLength={180}
          />
        </div>
        <Field label="Observações">
          <textarea
            value={form.notes}
            onChange={change("notes")}
            maxLength={2000}
          />
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar contato"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

// Busca com teclado e seleção derivada do componente SearchableClientSelect do projeto de referência.
export function ContactPicker({
  label,
  role,
  value,
  onChange,
  query,
  onQuery,
  data,
  save,
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState(-1);
  const id = useId();
  const inputId = useId();
  const root = useRef(null);
  const contacts = useMemo(
    () =>
      data.contacts
        .filter(
          (item) =>
            !item.deleted &&
            item.role === role &&
            normalize(item.name).includes(normalize(query)),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [data.contacts, role, query],
  );
  useEffect(() => {
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const choose = (item) => {
    onChange(item.id, item.name);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className="field contact-picker" ref={root}>
      <label htmlFor={inputId}>{label}</label>
      <div className="contact-input">
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={id}
          aria-expanded={open}
          aria-activedescendant={
            open && contacts[active] ? `${id}-${active}` : undefined
          }
          placeholder="Busque ou digite um nome"
          value={query}
          autoComplete="off"
          maxLength={180}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onQuery(event.target.value);
            onChange("", event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, contacts.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Escape") {
              setOpen(false);
              event.stopPropagation();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (open && contacts[active]) choose(contacts[active]);
            }
            if (event.key === "Tab") setOpen(false);
          }}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={`Abrir opções de ${label.toLowerCase()}`}
          onClick={() => setOpen(!open)}
        >
          <Icon name="down" size={16} />
        </button>
        <button
          type="button"
          className="add-contact"
          aria-label={`Cadastrar ${label.toLowerCase()}`}
          onClick={() => {
            setAdding(true);
            setOpen(false);
          }}
        >
          <Icon name="plus" size={17} />
        </button>
      </div>
      {open && (
        <div
          className="contact-options"
          role="listbox"
          id={id}
          aria-label={`${label}: contatos encontrados`}
        >
          {contacts.length ? (
            contacts.map((item, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-${index}`}
                aria-selected={value === item.id}
                className={index === active ? "active" : ""}
                key={item.id}
                onClick={() => choose(item)}
              >
                {item.name}
                <small>
                  {item.city ||
                    item.company ||
                    (role === "architect" ? "Arquiteto" : "Empreiteiro")}
                </small>
              </button>
            ))
          ) : (
            <p>Nenhum contato encontrado.</p>
          )}
          <button
            type="button"
            className="create-option"
            onClick={() => {
              setAdding(true);
              setOpen(false);
            }}
          >
            <Icon name="plus" size={16} />
            Cadastrar {query ? `“${query}”` : "novo contato"}
          </button>
        </div>
      )}
      <small>Selecione um contato ou use + para cadastrar.</small>
      {adding && (
        <ContactForm
          role={role}
          initial={{ name: query, role, phone: "", company: "", notes: "" }}
          data={data}
          save={save}
          onClose={() => setAdding(false)}
          onCreated={choose}
        />
      )}
    </div>
  );
}

export function AddressFields({ value, onChange, requireState = true }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const pendingCep = useRef("");
  const lastSuccessfulCep = useRef("");
  const latest = useRef(value);
  latest.current = value;
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const change = (key) => (event) => {
    if (
      key === "cep" &&
      event.target.value.replace(/\D/g, "") !==
        latest.current.cep.replace(/\D/g, "")
    ) {
      request.current++;
      pendingCep.current = "";
      lastSuccessfulCep.current = "";
      setBusy(false);
      setStatus("");
    }
    onChange({
      ...latest.current,
      [key]:
        key === "state" ? event.target.value.toUpperCase() : event.target.value,
    });
  };
  const lookup = async ({ automatic = false } = {}) => {
    const cep = latest.current.cep.replace(/\D/g, "");
    if (cep.length !== 8)
      return setStatus(
        "Informe um CEP com 8 dígitos ou preencha o endereço manualmente.",
      );
    if (
      pendingCep.current === cep ||
      (automatic && lastSuccessfulCep.current === cep)
    )
      return;
    const token = ++request.current;
    pendingCep.current = cep;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      const address = await response.json();
      if (token !== request.current) return;
      if (address.erro)
        return setStatus(
          "CEP não encontrado. Você pode preencher o endereço manualmente.",
        );
      lastSuccessfulCep.current = cep;
      onChange({
        ...latest.current,
        cep: address.cep,
        street: address.logradouro || "",
        neighborhood: address.bairro || "",
        city: address.localidade || "",
        state: address.uf || "",
      });
      setStatus(
        "Endereço encontrado. Confira o número e o bairro antes de salvar.",
      );
    } catch {
      if (token === request.current)
        setStatus(
          "A consulta está indisponível. Preencha o endereço manualmente.",
        );
    } finally {
      if (token === request.current) {
        pendingCep.current = "";
        setBusy(false);
      }
    }
  };
  return (
    <>
      <div className="fields address-cep">
        <Field
          label="CEP"
          value={value.cep}
          onChange={change("cep")}
          onBlur={() => {
            if (latest.current.cep.replace(/\D/g, "").length === 8) {
              void lookup({ automatic: true });
            }
          }}
          placeholder="00000-000"
          maxLength={9}
          inputMode="numeric"
        />
        <button
          type="button"
          className="button secondary lookup"
          onClick={() => lookup()}
          disabled={busy}
        >
          <Icon name="search" size={17} />
          {busy ? "Buscando…" : "Buscar endereço"}
        </button>
        <span className="field-note">Não sabe o CEP? Preencha abaixo.</span>
      </div>
      {status && (
        <p className="inline-note" role="status">
          {status}
        </p>
      )}
      <div className="fields street">
        <Field
          label="Rua / avenida"
          value={value.street}
          onChange={change("street")}
          placeholder="Endereço da obra"
          required
          maxLength={180}
        />
        <Field
          label="Número"
          value={value.number}
          onChange={change("number")}
          placeholder="Nº ou S/N"
          maxLength={20}
        />
      </div>
      <div className="fields two">
        <Field
          label="Bairro"
          value={value.neighborhood}
          onChange={change("neighborhood")}
          required
          placeholder="Essencial para os relatórios"
          maxLength={100}
        />
        <Field
          label="Complemento / referência"
          value={value.complement}
          onChange={change("complement")}
          placeholder="Bloco, lote, ponto de referência…"
          maxLength={180}
        />
      </div>
      <div className="fields city">
        <Field
          label="Cidade"
          value={value.city}
          onChange={change("city")}
          required
          maxLength={100}
        />
        <Field
          label="UF"
          value={value.state}
          onChange={change("state")}
          required={requireState}
          maxLength={2}
          pattern="[A-Z]{2}"
          placeholder="UF"
        />
      </div>
    </>
  );
}
