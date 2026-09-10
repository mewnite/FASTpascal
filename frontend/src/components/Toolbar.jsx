import React, { useState } from 'react';

export default function Toolbar({
  entryFile,
  compilerFlags,
  onCompilerFlagsChange,
  onRun,
  running,
  statusLabel,
}) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="brand">FASTPASCAL</span>
        <span className="entry-info">entrada: <code>{entryFile}</code></span>
      </div>

      <div className="toolbar-center">
        {statusLabel && <span className="status-label">{statusLabel}</span>}
      </div>

      <div className="toolbar-right">
        <button
          className="settings-btn"
          onClick={() => setShowSettings((s) => !s)}
          title="Configuración de compilación"
        >
          ⚙ Compilador
        </button>
        <button className="run-btn" onClick={onRun} disabled={running}>
          {running ? '⏳ Ejecutando…' : '▶ Ejecutar'}
        </button>
      </div>

      {showSettings && (
        <div className="settings-popover">
          <label>
            Flags de FPC
            <input
              type="text"
              value={compilerFlags}
              placeholder="ej: -Sh -O2 -vw"
              onChange={(e) => onCompilerFlagsChange(e.target.value)}
            />
          </label>
          <p className="settings-hint">
            Se ejecuta como: <code>fpc -Fu. -FE. {compilerFlags} {entryFile}</code>
          </p>
        </div>
      )}
    </div>
  );
}
