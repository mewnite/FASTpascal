import { WebSocketServer } from 'ws';
import { prepareAndCompile } from './compiler.js';
import { spawnSandboxProcess } from './sandbox.js';

// ---------------------------------------------------------------------------
// Interactive run protocol over WebSocket (path: /ws/run)
//
// This exists so the person can type stdin *while the program is running*,
// instead of having to supply all of it up front. Same sandbox, same
// isolation rules as the batch REST endpoint — this just keeps the process
// (and its stdin pipe) alive and streams output as it's produced.
//
// Client -> server messages (JSON):
//   { type: 'start', files, entryFile, compilerFlags }
//   { type: 'stdin', data }   // one line the user typed (newline appended if missing)
//   { type: 'stop' }          // kill the running program early
//
// Server -> client messages (JSON):
//   { type: 'compiling' }
//   { type: 'compileResult', success, diagnostics, output, ms }
//   { type: 'running' }
//   { type: 'stdout', data }
//   { type: 'stderr', data }
//   { type: 'exit', code, timedOut }
//   { type: 'error', message }
// ---------------------------------------------------------------------------

const RUN_SESSION_TIMEOUT_MS = Number(process.env.FASTPASCAL_RUN_TIMEOUT_MS || 120_000);

export function attachRunWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws/run' });

  wss.on('connection', (ws) => {
    let child = null;
    let cleanupFn = null;
    let stopped = false;

    const send = (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        send({ type: 'error', message: 'Mensaje inválido (no es JSON)' });
        return;
      }

      if (msg.type === 'start') {
        if (child) {
          send({ type: 'error', message: 'Ya hay una ejecución en curso en esta sesión' });
          return;
        }
        try {
          send({ type: 'compiling' });
          const prep = await prepareAndCompile({
            files: msg.files,
            entryFile: msg.entryFile,
            compilerFlags: msg.compilerFlags || '',
          });
          cleanupFn = prep.cleanup;

          send({
            type: 'compileResult',
            success: prep.success,
            diagnostics: prep.compile.diagnostics,
            output: prep.compile.output,
            ms: prep.compile.ms,
          });

          if (!prep.success) {
            await cleanupFn();
            cleanupFn = null;
            return;
          }

          send({ type: 'running' });
          child = spawnSandboxProcess({
            hostDir: prep.hostDir,
            command: `./${prep.binaryName}`,
            timeoutMs: RUN_SESSION_TIMEOUT_MS,
            onStdout: (data) => send({ type: 'stdout', data }),
            onStderr: (data) => send({ type: 'stderr', data }),
            onClose: async ({ code, timedOut }) => {
              send({ type: 'exit', code, timedOut });
              child = null;
              if (cleanupFn) {
                await cleanupFn();
                cleanupFn = null;
              }
            },
          });
        } catch (err) {
          send({ type: 'error', message: err.message || 'Error desconocido' });
          if (cleanupFn) {
            await cleanupFn();
            cleanupFn = null;
          }
        }
        return;
      }

      if (msg.type === 'stdin') {
        if (!child || !child.stdin.writable) return;
        const data = typeof msg.data === 'string' ? msg.data : '';
        child.stdin.write(data.endsWith('\n') ? data : data + '\n');
        return;
      }

      if (msg.type === 'stop') {
        if (child) child.kill('SIGKILL');
        return;
      }
    });

    ws.on('close', async () => {
      stopped = true;
      if (child) child.kill('SIGKILL');
      if (cleanupFn) await cleanupFn().catch(() => {});
    });

    ws.on('error', () => {
      if (!stopped && child) child.kill('SIGKILL');
    });
  });

  return wss;
}
