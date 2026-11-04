import React, { useEffect, useState } from "react";
import { repository } from "../lib/repository.mjs";

export default function VisitPhoto({ photo, alt }) {
  const [url, setUrl] = useState(photo.key ? "" : photo.url);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    repository
      .photoUrl(photo)
      .then((next) => {
        if (active) setUrl(next);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [photo.id, attempt]);
  if (error)
    return (
      <button
        className="button secondary"
        onClick={() => setAttempt(attempt + 1)}
      >
        Tentar carregar foto
      </button>
    );
  return url ? (
    <a
      href={url}
      download={photo.name}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img src={url} alt={alt} loading="lazy" onError={() => setError(true)} />
      <span>Abrir foto</span>
    </a>
  ) : (
    <span role="status">Carregando foto…</span>
  );
}
