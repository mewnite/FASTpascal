import { useEffect, useState } from 'react';

const STORAGE_KEY = 'fastpascal.project.v1';

const DEFAULT_PROJECT = {
  files: [
    {
      name: 'main.pas',
      content:
        'program main;\n' +
        'var\n' +
        '   nombre : string;\n' +
        'begin\n' +
        '   write(\'Ingrese su nombre: \');\n' +
        '   readln(nombre);\n' +
        '   writeln(\'Hola, \', nombre, \'!\');\n' +
        'end.\n',
    },
  ],
  entryFile: 'main.pas',
  activeFile: 'main.pas',
  compilerFlags: '',
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROJECT;
    const parsed = JSON.parse(raw);
    if (!parsed.files || parsed.files.length === 0) return DEFAULT_PROJECT;
    return parsed;
  } catch {
    return DEFAULT_PROJECT;
  }
}

export function useProjectStorage() {
  const [project, setProject] = useState(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  return [project, setProject];
}

export { DEFAULT_PROJECT };
