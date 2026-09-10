import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { compileAndRun } from './compiler.js';
import { attachRunWebSocket } from './ws.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'fastpascal-backend' });
});

// Batch/non-interactive endpoint: all stdin supplied up front. Kept for
// programs that don't need interactive input. The UI's main "Ejecutar"
// button uses the streaming WebSocket flow (/ws/run) instead, which
// supports typing input while the program runs -- see src/ws.js.
app.post('/api/run', async (req, res) => {
  const { files, entryFile, stdin, compilerFlags } = req.body || {};

  try {
    const result = await compileAndRun({
      files,
      entryFile,
      stdin: stdin || '',
      compilerFlags: compilerFlags || '',
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error desconocido' });
  }
});

const server = http.createServer(app);
attachRunWebSocket(server);

server.listen(PORT, () => {
  console.log(`FASTPASCAL backend escuchando en http://localhost:${PORT}`);
  console.log(`WebSocket de ejecucion interactiva en ws://localhost:${PORT}/ws/run`);
});
