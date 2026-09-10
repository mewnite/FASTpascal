import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// FASTPASCAL sandbox layer
//
// Every compile / run happens inside a short-lived, throwaway Docker
// container built from the ./runner image (see /runner/Dockerfile), which
// contains nothing but Free Pascal + a minimal Debian base.
//
// Isolation measures applied to every container:
//   --rm                 container is destroyed immediately after use
//   --network none        no network access at all
//   --memory / --memory-swap   hard memory ceiling
//   --cpus                 CPU share ceiling
//   --pids-limit           caps number of processes/threads (fork bombs)
//   --read-only + tmpfs     root filesystem is read-only, only /workspace
//                           (the mounted project dir) and /tmp are writable
//   --security-opt no-new-privileges
//   --cap-drop ALL
//   --user (non-root)
//
// This module has zero knowledge of what the Pascal program does; it just
// shells out to `docker run` with a command line and returns exit
// code / stdout / stderr.
// ---------------------------------------------------------------------------

const RUNNER_IMAGE = process.env.FASTPASCAL_RUNNER_IMAGE || 'fastpascal-runner';

const DEFAULT_MEMORY = process.env.FASTPASCAL_MEM_LIMIT || '256m';
const DEFAULT_CPUS = process.env.FASTPASCAL_CPU_LIMIT || '0.5';
const DEFAULT_PIDS = process.env.FASTPASCAL_PIDS_LIMIT || '128';

function dockerBaseArgs(hostDir) {
  return [
    'run',
    '--rm',
    '-i',
    '--network', 'none',
    '--memory', DEFAULT_MEMORY,
    '--memory-swap', DEFAULT_MEMORY,
    '--cpus', DEFAULT_CPUS,
    '--pids-limit', DEFAULT_PIDS,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--tmpfs', '/tmp:rw,size=64m,mode=1777',
    '-v', `${hostDir}:/workspace:rw`,
    '-w', '/workspace',
    '--user', '1000:1000',
    RUNNER_IMAGE,
  ];
}

/**
 * Runs an arbitrary shell command inside the sandboxed container.
 * Resolves with { code, stdout, stderr, timedOut }.
 */
export function runInSandbox({ hostDir, command, stdin = '', timeoutMs = 10_000 }) {
  return new Promise((resolve) => {
    const args = [...dockerBaseArgs(hostDir), 'sh', '-c', command];
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const killer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    child.on('error', (err) => {
      clearTimeout(killer);
      resolve({ code: -1, stdout, stderr: stderr + `\n[sandbox error] ${err.message}`, timedOut });
    });

    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr, timedOut });
    });

  if (stdin) child.stdin.write(stdin);
  child.stdin.end();
  });
}

/**
 * Spawns the sandbox container for the RUN stage without buffering
 * everything up front: stdout/stderr are streamed via callbacks as they
 * arrive, and stdin stays open so the caller can write to it incrementally
 * (e.g. one line at a time, as the user types it in the UI).
 *
 * The caller is responsible for calling `proc.stdin.write(...)` as input
 * becomes available, and for eventually killing/ending the process.
 *
 * Enforces a hard overall timeout (a program that just sits there forever
 * waiting on nothing will still get killed eventually), regardless of how
 * much interactive input it receives.
 */
export function spawnSandboxProcess({ hostDir, command, timeoutMs = 120_000, onStdout, onStderr, onClose }) {
  const args = [...dockerBaseArgs(hostDir), 'sh', '-c', command];
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

  let timedOut = false;
  const killer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  child.stdout.on('data', (d) => onStdout && onStdout(d.toString('utf8')));
  child.stderr.on('data', (d) => onStderr && onStderr(d.toString('utf8')));

  child.on('error', (err) => {
    clearTimeout(killer);
    onClose && onClose({ code: -1, timedOut, error: err.message });
  });

  child.on('close', (code) => {
    clearTimeout(killer);
    onClose && onClose({ code, timedOut, error: null });
  });

  return child;
}
