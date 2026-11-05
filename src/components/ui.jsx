import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

// Ícones em grade de 24px, traço único de 1,75px e cantos arredondados.
const paths = {
  kanban:
    "M4.5 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M10.5 4h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M16.5 4h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
  passport:
    "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z M9 16.5h6",
  users:
    "M15.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20 M9.5 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z M16.5 4.3a3.5 3.5 0 0 1 0 6.4 M20.5 20v-1.5a3.5 3.5 0 0 0-2.6-3.4",
  message:
    "M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5v-3.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z M7.5 9h9 M7.5 12h5.5",
  plus: "M12 5v14 M5 12h14",
  check: "m5 12.5 4.5 4.5L19 7.5",
  search: "M20 20l-4.3-4.3 M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z",
  chevron: "m9 5 7 7-7 7",
  close: "m6.5 6.5 11 11 M6.5 17.5l11-11",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  reorder: "M7.5 20V4 M4 7.5 7.5 4 11 7.5 M16.5 4v16 M13 16.5l3.5 3.5 3.5-3.5",
  "move-up": "M12 19V5 M6.5 10.5 12 5l5.5 5.5",
  "move-down": "M12 5v14 M6.5 13.5 12 19l5.5-5.5",
  grip: "M9 5.5h.01 M15 5.5h.01 M9 12h.01 M15 12h.01 M9 18.5h.01 M15 18.5h.01",
  clock: "M12 7.5V12l3 2 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  edit: "M4 20h4.5L19.3 9.2a2.5 2.5 0 0 0-3.5-3.5L5 16.5V20Z M14 7.5l3.5 3.5",
  trash: "M4 7h16 M9.5 7V4.5h5V7 M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12 M10 11v6 M14 11v6",
  phone:
    "M6.5 4h2.6l1.6 4.2-2.1 1.3a11 11 0 0 0 5.9 5.9l1.3-2.1 4.2 1.6v2.6a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z",
  mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M3.5 7.5 12 13l8.5-5.5",
  logout: "M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.5 M15.5 16.5 20 12l-4.5-4.5 M20 12H9.5",
  upload: "M12 15V4 M7.5 8.5 12 4l4.5 4.5 M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  chart: "M4 20h16 M7 16.5v-5 M12 16.5V7 M17 16.5v-8",
  copy: "M9 9h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V9Z M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3",
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={paths[name] || paths.kanban} />
    </svg>
  );
}
export function Field({ label, hint, children, className = "", ...props }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        {props.required && <span className="required" aria-hidden="true"> *</span>}
      </label>
      {children ? (
        React.cloneElement(children, { id, "aria-describedby": hintId })
      ) : (
        <input id={id} aria-describedby={hintId} {...props} />
      )}
      {hint && <small id={hintId}>{hint}</small>}
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
    <Field label={label} required={required} className="field-select">
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
// Cabeçalho de página: título curto e ações na mesma linha.
export function PageHeader({ title, note, children }) {
  return (
    <header className="page-header">
      <div className="page-heading">
        <h1>{title}</h1>
        {note && <p>{note}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
// Resumo numérico da página em uma única faixa.
export function Summary({ label, items }) {
  return (
    <dl className="summary" aria-label={label}>
      {items.map((item) => (
        <div key={item.label} className={`summary-item ${item.tone || ""}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Empty({
  title = "Nada por aqui ainda",
  description = "Os registros aparecem aqui conforme a equipe usa o sistema.",
  action,
  icon = "kanban",
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
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
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      // Devolve o foco a quem abriu a janela (se ainda existir na tela).
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body)
        opener.focus({ preventScroll: true });
    };
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
        <h2 id={titleId}>{title}</h2>
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
