import React, { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useProjectStorage } from './hooks/useProjectStorage.js';
import { useRunSession } from './hooks/useRunSession.js';
import FileExplorer from './components/FileExplorer.jsx';
import Toolbar from './components/Toolbar.jsx';
import Terminal from './components/Terminal.jsx';

export default function App() {
  const [project, setProject] = useProjectStorage();
  const session = useRunSession();
  const editorRef = useRef(null);

  const activeFile = project.files.find((f) => f.name === project.activeFile) || project.files[0];

  const updateActiveContent = useCallback(
    (content) => {
      setProject((p) => ({
        ...p,
        files: p.files.map((f) => (f.name === p.activeFile ? { ...f, content } : f)),
      }));
    },
    [setProject]
  );

  function selectFile(name) {
    setProject((p) => ({ ...p, activeFile: name }));
  }

  function addFile(name) {
    setProject((p) => {
      if (p.files.some((f) => f.name === name)) return p;
      return { ...p, files: [...p.files, { name, content: '' }], activeFile: name };
    });
  }

  function renameFile(oldName, newName) {
    const finalName = newName.endsWith('.pas') ? newName : `${newName}.pas`;
    setProject((p) => {
      if (p.files.some((f) => f.name === finalName)) return p;
      return {
        ...p,
        files: p.files.map((f) => (f.name === oldName ? { ...f, name: finalName } : f)),
        entryFile: p.entryFile === oldName ? finalName : p.entryFile,
        activeFile: p.activeFile === oldName ? finalName : p.activeFile,
      };
    });
  }

  function deleteFile(name) {
    setProject((p) => {
      const files = p.files.filter((f) => f.name !== name);
      const entryFile = p.entryFile === name ? files[0].name : p.entryFile;
      const activeFile = p.activeFile === name ? files[0].name : p.activeFile;
      return { ...p, files, entryFile, activeFile };
    });
  }

  function setEntry(name) {
    setProject((p) => ({ ...p, entryFile: name }));
  }

  function setCompilerFlags(compilerFlags) {
    setProject((p) => ({ ...p, compilerFlags }));
  }

  function handleRun() {
    session.start({
      files: project.files,
      entryFile: project.entryFile,
      compilerFlags: project.compilerFlags,
    });
  }

  function jumpToError(diag) {
    if (diag.file && diag.file !== project.activeFile) {
      selectFile(diag.file);
    }
    setTimeout(() => {
      const ed = editorRef.current;
      if (!ed || !diag.line) return;
      ed.revealLineInCenter(diag.line);
      ed.setPosition({ lineNumber: diag.line, column: diag.column || 1 });
      ed.focus();
    }, 30);
  }

  const running = session.status === 'compiling' || session.status === 'running';
  const statusLabel = {
    idle: '',
    compiling: 'Compilando…',
    running: 'Ejecutando…',
    'compile-error': 'Error de compilación',
    exited: session.exitInfo && !session.exitInfo.timedOut && session.exitInfo.code === 0
      ? 'Ejecución exitosa'
      : 'Ejecución terminada',
  }[session.status] || '';

  return (
    <div className="app-shell">
      <Toolbar
        entryFile={project.entryFile}
        compilerFlags={project.compilerFlags}
        onCompilerFlagsChange={setCompilerFlags}
        onRun={handleRun}
        running={running}
        statusLabel={statusLabel}
      />

      <div className="main-grid">
        <FileExplorer
          files={project.files}
          activeFile={project.activeFile}
          entryFile={project.entryFile}
          onSelect={selectFile}
          onAdd={addFile}
          onRename={renameFile}
          onDelete={deleteFile}
          onSetEntry={setEntry}
        />

        <div className="editor-pane">
          <Editor
            key={activeFile.name}
            height="100%"
            defaultLanguage="pascal"
            theme="vs-dark"
            value={activeFile.content}
            onChange={(v) => updateActiveContent(v ?? '')}
            onMount={(editor) => { editorRef.current = editor; }}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
              minimap: { enabled: false },
              automaticLayout: true,
              tabSize: 3,
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        <div className="bottom-pane">
          <Terminal
            status={session.status}
            compileResult={session.compileResult}
            transcript={session.transcript}
            exitInfo={session.exitInfo}
            connectionError={session.connectionError}
            onSendLine={session.sendLine}
            onStop={session.stop}
            onJumpToError={jumpToError}
          />
        </div>
      </div>
    </div>
  );
}
