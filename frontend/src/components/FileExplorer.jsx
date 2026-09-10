import React, { useState } from 'react';

export default function FileExplorer({
  files,
  activeFile,
  entryFile,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onSetEntry,
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  function submitAdd() {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    const finalName = name.endsWith('.pas') ? name : `${name}.pas`;
    onAdd(finalName);
    setNewName('');
    setAdding(false);
  }

  return (
    <div className="file-explorer">
      <div className="panel-title">ARCHIVOS</div>
      <ul className="file-list">
        {files.map((f) => (
          <li
            key={f.name}
            className={`file-item ${f.name === activeFile ? 'active' : ''}`}
          >
            <button className="file-name-btn" onClick={() => onSelect(f.name)} title={f.name}>
              <span className="file-icon">📄</span>
              <span className="file-label">{f.name}</span>
              {f.name === entryFile && <span className="entry-badge" title="Archivo de entrada">ENTRY</span>}
            </button>
            <span className="file-actions">
              <button
                className="icon-btn"
                title="Marcar como archivo de entrada"
                onClick={() => onSetEntry(f.name)}
              >
                ▶
              </button>
              <button
                className="icon-btn"
                title="Renombrar"
                onClick={() => {
                  const next = window.prompt('Nuevo nombre de archivo', f.name);
                  if (next && next.trim()) onRename(f.name, next.trim());
                }}
              >
                ✎
              </button>
              {files.length > 1 && (
                <button
                  className="icon-btn danger"
                  title="Eliminar"
                  onClick={() => {
                    if (window.confirm(`¿Eliminar ${f.name}?`)) onDelete(f.name);
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="add-file-row">
          <input
            autoFocus
            value={newName}
            placeholder="archivo.pas"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd();
              if (e.key === 'Escape') setAdding(false);
            }}
          />
          <button onClick={submitAdd}>✓</button>
        </div>
      ) : (
        <button className="add-file-btn" onClick={() => setAdding(true)}>
          + Nuevo archivo
        </button>
      )}
    </div>
  );
}
