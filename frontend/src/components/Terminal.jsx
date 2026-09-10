import React, { useEffect, useRef, useState } from 'react';

export default function Terminal({
  status,
  compileResult,
  transcript,
  exitInfo,
  connectionError,
  onSendLine,
  onStop,
  onJumpToError,
}) {
  const [draft, setDraft] = useState('');
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [transcript, compileResult, exitInfo]);

  useEffect(() => {
    if (status === 'running' && inputRef.current) inputRef.current.focus();
  }, [status]);

  function submitLine() {
    if (!draft) return;
    onSendLine(draft);
    setDraft('');
  }

  const hasCompileDiagnostics =
    compileResult && compileResult.diagnostics && compileResult.diagnostics.length > 0;

  return (
    <div className="terminal">
      <div className="panel-title">
        SALIDA
        {status === 'running' && (
          <button className="stop-btn" onClick={onStop} title="Detener ejecución">■ Detener</button>
        )}
      </div>

      <div className="terminal-body" ref={bodyRef}>
        {connectionError && <div className="line stderr-line">⚠ {connectionError}</div>}

        {status === 'idle' && !connectionError && (
          <div className="line muted">Presioná ▶ Ejecutar para compilar y correr tu programa.</div>
        )}

        {status === 'compiling' && <div className="line muted">Compilando…</div>}

        {compileResult && !compileResult.success && (
          <>
            <div className="line error-title">✗ Error de compilación</div>
            {!hasCompileDiagnostics && <pre className="raw-output">{compileResult.output}</pre>}
            {compileResult.diagnostics.map((d, i) => (
              <div
                key={i}
                className={`diagnostic ${d.severity} ${d.file ? 'clickable' : ''}`}
                onClick={() => d.file && onJumpToError && onJumpToError(d)}
              >
                <span className={`badge badge-${d.severity}`}>{d.severity}</span>
                {d.file && (
                  <span className="diag-loc">
                    {d.file}
                    {d.line ? `:${d.line}` : ''}
                    {d.column ? `:${d.column}` : ''}
                  </span>
                )}
                <span className="diag-msg">{d.message}</span>
              </div>
            ))}
          </>
        )}

        {compileResult && compileResult.success && hasCompileDiagnostics && (
          <details className="warnings-box">
            <summary>Avisos del compilador ({compileResult.diagnostics.length})</summary>
            {compileResult.diagnostics.map((d, i) => (
              <div
                key={i}
                className={`diagnostic ${d.severity} ${d.file ? 'clickable' : ''}`}
                onClick={() => d.file && onJumpToError && onJumpToError(d)}
              >
                <span className={`badge badge-${d.severity}`}>{d.severity}</span>
                {d.file && <span className="diag-loc">{d.file}{d.line ? `:${d.line}` : ''}</span>}
                <span className="diag-msg">{d.message}</span>
              </div>
            ))}
          </details>
        )}

        {transcript.map((entry, i) => {
          if (entry.type === 'input') {
            return <div key={i} className="term-line term-input">&gt; {entry.text}</div>;
          }
          return (
            <span
              key={i}
              className={`term-line ${entry.type === 'stderr' ? 'term-stderr' : 'term-stdout'}`}
            >
              {entry.text}
            </span>
          );
        })}

        {exitInfo && (
          <div className={`run-status ${exitInfo.timedOut ? 'fail' : exitInfo.code === 0 ? 'ok' : 'fail'}`}>
            {exitInfo.timedOut
              ? '⏱ Se agotó el tiempo máximo de la sesión de ejecución.'
              : exitInfo.code === 0
                ? `✓ Programa finalizado correctamente (código ${exitInfo.code})`
                : `✗ El programa terminó con código ${exitInfo.code}`}
          </div>
        )}
      </div>

      {status === 'running' && (
        <div className="terminal-input-row">
          <span className="prompt">&gt;</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitLine(); }}
            placeholder="Escribí una línea de entrada y presioná Enter…"
            spellCheck={false}
          />
          <button onClick={submitLine}>Enviar</button>
        </div>
      )}
    </div>
  );
}
