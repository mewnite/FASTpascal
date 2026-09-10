// Parses Free Pascal Compiler (FPC) console output into structured diagnostics.
//
// Typical FPC line formats:
//   principal.pas(12,5) Error: Identifier not found "foo"
//   definiciones.pas(3) Fatal: Can't find unit System
//   Fatal: Compilation aborted
//
// We keep this deliberately generic: it only understands FPC's own message
// format, it does not know anything about any particular program's logic.

const LINE_COL_RE =
  /^(?<file>[^\s(][^()]*?)\((?<line>\d+)(?:,(?<col>\d+))?\)\s+(?<severity>Error|Fatal|Warning|Note|Hint)\s*:\s*(?<message>.*)$/;

const GENERIC_RE = /^(?<severity>Error|Fatal|Warning|Note|Hint)\s*:\s*(?<message>.*)$/;

export function parseFpcOutput(rawOutput) {
  const lines = (rawOutput || '').split(/\r?\n/);
  const diagnostics = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let m = LINE_COL_RE.exec(trimmed);
    if (m && m.groups) {
      diagnostics.push({
        file: m.groups.file.trim(),
        line: Number(m.groups.line),
        column: m.groups.col ? Number(m.groups.col) : null,
        severity: m.groups.severity.toLowerCase(),
        message: m.groups.message.trim(),
        raw: line,
      });
      continue;
    }

    m = GENERIC_RE.exec(trimmed);
    if (m && m.groups) {
      diagnostics.push({
        file: null,
        line: null,
        column: null,
        severity: m.groups.severity.toLowerCase(),
        message: m.groups.message.trim(),
        raw: line,
      });
    }
  }

  return diagnostics;
}

export function hasFatalOrError(diagnostics) {
  return diagnostics.some((d) => d.severity === 'error' || d.severity === 'fatal');
}
