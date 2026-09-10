import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuid } from 'uuid';
import { runInSandbox } from './sandbox.js';
import { parseFpcOutput, hasFatalOrError } from './parseErrors.js';

// TMP_ROOT is the path *this process* uses to actually write files (via fs).
// HOST_TMP_ROOT is the path the *host* docker engine should use in `-v`
// mounts when spawning sandbox containers. These differ only when the
// backend itself runs inside a container (docker-compose full setup) with
// its tmp dir bind-mounted from a known host path — see README "Modo A vs
// Modo B". When the backend runs directly on the host (recommended, no
// DinD), the two are identical.
const TMP_ROOT = process.env.FASTPASCAL_TMP_DIR || path.join(os.tmpdir(), 'fastpascal-runs');
const HOST_TMP_ROOT = process.env.FASTPASCAL_HOST_TMP_DIR || TMP_ROOT;

const SAFE_FILENAME_RE = /^[A-Za-z0-9_.-]+\.pas$/;

function assertSafeFileList(files, entryFile) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Se requiere al menos un archivo .pas');
  }
  for (const f of files) {
    if (!f || typeof f.name !== 'string' || typeof f.content !== 'string') {
      throw new Error('Cada archivo debe tener { name, content }');
    }
    if (!SAFE_FILENAME_RE.test(f.name)) {
      throw new Error(`Nombre de archivo inválido: "${f.name}". Sólo letras, números, "_", "-", "." y extensión .pas`);
    }
  }
  const names = files.map((f) => f.name);
  if (new Set(names).size !== names.length) {
    throw new Error('Hay archivos con nombres duplicados');
  }
  if (!names.includes(entryFile)) {
    throw new Error(`El archivo de entrada "${entryFile}" no existe en el proyecto`);
  }
}

/**
 * Writes the project's .pas files to a fresh temp directory on the host.
 * This directory is then bind-mounted (read/write) into the sandbox
 * container. No file content is inspected or altered — files are written
 * byte-for-byte as provided by the client.
 */
async function materializeProject(files) {
  const runId = uuid();
  const dir = path.join(TMP_ROOT, runId);
  await fs.mkdir(dir, { recursive: true, mode: 0o777 });
  for (const f of files) {
    await fs.writeFile(path.join(dir, f.name), f.content, { encoding: 'utf8' });
  }
  // World-writable so the non-root sandbox user (uid 1000) can write
  // .o/.ppu/binary artifacts produced by fpc into this same directory.
  await fs.chmod(dir, 0o777);
  // `dir` is where *this process* writes/reads files.
  // `hostDir` is what gets passed to `docker run -v ...` (see HOST_TMP_ROOT).
  const hostDir = path.join(HOST_TMP_ROOT, runId);
  return { dir, hostDir, runId };
}

async function cleanup(dir) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Writes the files + runs `fpc` (compile stage only). Does not run the
 * resulting binary and does not clean up the temp dir — the caller decides
 * what happens next (batch run, interactive run, or just showing errors),
 * and is responsible for eventually calling the returned `cleanup()`.
 */
export async function prepareAndCompile({
  files,
  entryFile,
  compilerFlags = '',
  compileTimeoutMs = 15_000,
}) {
  assertSafeFileList(files, entryFile);

  if (!/^[A-Za-z0-9_\-\s.]*$/.test(compilerFlags)) {
    throw new Error('Los flags del compilador contienen caracteres no permitidos');
  }

  const { dir, hostDir } = await materializeProject(files);
  const binaryName = entryFile.replace(/\.pas$/i, '');

  const compileCmd = ['fpc', '-Fu.', '-FE.', compilerFlags.trim(), entryFile]
    .filter(Boolean)
    .join(' ');

  const t0 = Date.now();
  const compileRes = await runInSandbox({
    hostDir,
    command: compileCmd,
    timeoutMs: compileTimeoutMs,
  });
  const combinedOutput = [compileRes.stdout, compileRes.stderr].filter(Boolean).join('\n');
  const diagnostics = parseFpcOutput(combinedOutput);
  const success =
    !compileRes.timedOut && compileRes.code === 0 && !hasFatalOrError(diagnostics);

  return {
    dir,
    hostDir,
    binaryName,
    success,
    compile: {
      code: compileRes.code,
      output: combinedOutput,
      diagnostics,
      timedOut: compileRes.timedOut,
      ms: Date.now() - t0,
    },
    cleanup: () => cleanup(dir),
  };
}

/**
 * Compiles and (if compilation succeeds) runs a Pascal project in one shot,
 * with all of stdin supplied up front (non-interactive/batch mode).
 * Kept for simple programs that don't need interactive input; the main UI
 * uses the streaming WebSocket flow instead (see server.js `/ws/run`) which
 * supports typing input while the program is running.
 *
 * @param {Object} opts
 * @param {{name:string, content:string}[]} opts.files
 * @param {string} opts.entryFile - name of the .pas file containing `program ...;`
 * @param {string} opts.stdin - text fed to the running program's stdin
 * @param {string} [opts.compilerFlags] - extra flags passed to fpc, e.g. "-Sh -O2"
 * @param {number} [opts.compileTimeoutMs]
 * @param {number} [opts.runTimeoutMs]
 */
export async function compileAndRun({
  files,
  entryFile,
  stdin = '',
  compilerFlags = '',
  compileTimeoutMs = 15_000,
  runTimeoutMs = 8_000,
}) {
  const prep = await prepareAndCompile({ files, entryFile, compilerFlags, compileTimeoutMs });
  const result = {
    stage: prep.success ? 'run' : 'compile',
    success: false,
    compile: prep.compile,
    run: null,
    binaryName: prep.binaryName,
  };

  try {
    if (!prep.success) return result;

    const t1 = Date.now();
    const runRes = await runInSandbox({
      hostDir: prep.hostDir,
      command: `./${prep.binaryName}`,
      stdin,
      timeoutMs: runTimeoutMs,
    });

    result.run = {
      code: runRes.code,
      stdout: runRes.stdout,
      stderr: runRes.stderr,
      timedOut: runRes.timedOut,
      ms: Date.now() - t1,
    };
    result.success = !runRes.timedOut && runRes.code === 0;
    return result;
  } finally {
    await prep.cleanup();
  }
}
