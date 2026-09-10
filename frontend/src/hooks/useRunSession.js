import { useCallback, useRef, useState } from 'react';

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // In dev, Vite's proxy only handles /api by default; for the WS endpoint
  // we talk to the backend origin directly if provided, otherwise assume
  // same-origin (e.g. behind a reverse proxy in production).
  const backend = import.meta.env.VITE_BACKEND_WS_URL;
  if (backend) return backend;
  return `${proto}://${window.location.hostname}:4000/ws/run`;
}

export function useRunSession() {
  const [status, setStatus] = useState('idle'); // idle | compiling | compile-error | running | exited
  const [compileResult, setCompileResult] = useState(null);
  const [transcript, setTranscript] = useState([]); // {type: 'stdout'|'stderr'|'input', text}
  const [exitInfo, setExitInfo] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const wsRef = useRef(null);

  const appendTranscript = useCallback((entry) => {
    setTranscript((t) => [...t, entry]);
  }, []);

  const start = useCallback(({ files, entryFile, compilerFlags }) => {
    // Tear down any previous session first.
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('compiling');
    setCompileResult(null);
    setTranscript([]);
    setExitInfo(null);
    setConnectionError(null);

    let ws;
    try {
      ws = new WebSocket(wsUrl());
    } catch (e) {
      setConnectionError('No se pudo abrir la conexión con el backend.');
      setStatus('idle');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', files, entryFile, compilerFlags }));
    };

    ws.onerror = () => {
      setConnectionError('Error de conexión con el backend (¿está corriendo?).');
    };

    ws.onclose = () => {
      setStatus((s) => (s === 'running' ? 'exited' : s === 'compiling' ? 'idle' : s));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'compileResult':
          setCompileResult(msg);
          if (!msg.success) setStatus('compile-error');
          break;
        case 'running':
          setStatus('running');
          break;
        case 'stdout':
          appendTranscript({ type: 'stdout', text: msg.data });
          break;
        case 'stderr':
          appendTranscript({ type: 'stderr', text: msg.data });
          break;
        case 'exit':
          setExitInfo({ code: msg.code, timedOut: msg.timedOut });
          setStatus('exited');
          break;
        case 'error':
          setConnectionError(msg.message);
          setStatus('idle');
          break;
        default:
          break;
      }
    };
  }, [appendTranscript]);

  const sendLine = useCallback((text) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'stdin', data: text }));
    appendTranscript({ type: 'input', text });
  }, [appendTranscript]);

  const stop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  return { status, compileResult, transcript, exitInfo, connectionError, start, sendLine, stop };
}
