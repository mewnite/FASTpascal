# FASTPASCAL

Un Code Runner / mini-IDE para Pascal: escribís, compilás y ejecutás con
**Free Pascal Compiler (FPC) real**, sin abrir una terminal.

FASTPASCAL es genérico: no conoce ni resuelve ningún ejercicio en particular.
Sólo sabe editar → compilar → ejecutar → mostrar resultados, para cualquier
proyecto Pascal (uno o varios archivos `.pas`, con `{$INCLUDE ...}`,
`procedure`/`function`, parámetros `var`, `stdin`, etc.).

## Arquitectura

```
frontend/   React + Monaco Editor (UI del IDE)
backend/    Express API que compila/ejecuta con FPC
runner/     Imagen Docker minimalista con sólo Debian + fpc (el sandbox)
```

- El **frontend** manda el proyecto (archivos + stdin + flags) a `POST /api/run`.
- El **backend** escribe esos archivos en un directorio temporal y ejecuta
  `fpc` dentro de un contenedor **efímero y aislado** (`runner/`), nunca en
  el host directamente.
- Cada contenedor de sandbox se crea con `--rm --network none`, límites de
  memoria/CPU/procesos, filesystem de sólo lectura salvo el proyecto, y
  usuario no-root. Ver `backend/src/sandbox.js`.
- El backend no interpreta ni "arregla" el código Pascal: sólo reporta lo que
  FPC devuelve (stdout/stderr, y errores parseados con archivo/línea/columna).

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) (para el sandbox de FPC)
- [Node.js 20+](https://nodejs.org/) (si vas a correr backend/frontend fuera de Docker)

## Puesta en marcha — Modo A (recomendado, sin DinD)

Backend y frontend corren directo con Node en tu máquina; sólo el
**compilado/ejecución de Pascal** ocurre en un contenedor Docker aislado.
Es la forma más simple: no hay contenedores anidados ni rutas host/contenedor
que hacer coincidir.

```bash
# 1. Construir la imagen sandbox (una sola vez, o cuando cambie runner/Dockerfile)
docker build -t fastpascal-runner ./runner

# 2. Backend
cd backend
npm install
npm run dev          # http://localhost:4000

# 3. Frontend (otra terminal)
cd frontend
npm install
npm run dev           # http://localhost:5173
```

Abrí `http://localhost:5173`.

## Puesta en marcha — Modo B (todo en Docker Compose)

Backend y frontend también quedan containerizados. El backend usa
`docker.sock` para lanzar los contenedores sandbox como "contenedores
hermanos" del host.

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

> **Nota (Docker-in-Docker):** en este modo, `docker-compose.yml` monta
> `./backend/tmp` como bind mount y expone `FASTPASCAL_HOST_TMP_DIR` para que
> el backend sepa cómo se llama ese mismo directorio *desde el punto de vista
> del host* (necesario porque los `docker run -v ...` que dispara el backend
> los resuelve el engine del host, no el contenedor del backend). Si estás en
> macOS/Windows con rutas poco convencionales, o preferís evitarte esto por
> completo, usá el Modo A.

## Uso

1. Elegí o creá archivos `.pas` en el panel de archivos.
2. Marcá cuál es el archivo de entrada (▶ junto al archivo, el que tiene
   `program ...;`) — por defecto es `main.pas`.
3. Escribí tu código. Si usás `{$INCLUDE otro.pas}`, ese archivo tiene que
   existir en el mismo proyecto.
4. (Opcional) Ajustá flags de FPC en **⚙ Compilador** (ej: `-Sh -O2`).
5. **▶ Ejecutar**. Si compila bien, el programa arranca y queda **corriendo
   en vivo**: a medida que hace `write`/`writeln` vas viendo la salida
   aparecer en el panel de abajo, y cuando llega a un `read`/`readln` podés
   escribir el valor en el recuadro de entrada y presionar Enter (o el botón
   "Enviar") — se manda al programa en ese momento, como si fuera una
   terminal real. Podés seguir mandando líneas una por una mientras el
   programa siga vivo.
6. Si hay errores de compilación, hacé click en cualquiera para saltar a esa
   línea/archivo en el editor.
7. **■ Detener** corta la ejecución en cualquier momento si el programa quedó
   esperando algo que no vas a mandarle.

Todo el proyecto (archivos, archivo de entrada, flags) se guarda en
`localStorage` del navegador, así que sobrevive a un recargo accidental de la
página. La sesión de ejecución en sí (WebSocket) no persiste al recargar —
si recargás mientras un programa está corriendo, se corta.

## Ejecución interactiva (WebSocket)

El botón **▶ Ejecutar** abre una conexión WebSocket a `/ws/run` en vez de
mandar todo de una vez por HTTP. El backend compila, y si compila bien deja
el proceso **vivo** dentro del contenedor sandbox: el `stdout`/`stderr` se
transmite línea a línea a medida que se produce, y cada línea que escribís
en el input del terminal se manda directo al `stdin` del programa en ese
instante — así los `read`/`readln` se resuelven en tiempo real, no con un
bloque de texto precargado.

Cada sesión tiene un tope global de tiempo (`FASTPASCAL_RUN_TIMEOUT_MS`,
120s por defecto) para que un programa que quede esperando algo que nunca
llega no quede corriendo indefinidamente — pero mientras estés interactuando
normalmente, no debería notarse. El botón **■ Detener** corta la ejecución
manualmente en cualquier momento.

Sigue existiendo `POST /api/run` (todo el stdin de una sola vez, sin
interacción) por si en el futuro querés automatizar corridas o tests desde
afuera de la UI.

## Configuración del compilador

El comando que corre el backend es, siempre:

```
fpc -Fu. -FE. <flags que pusiste> <archivo de entrada>
```

- `-Fu.` y `-FE.` hacen que FPC busque units/includes y deje el ejecutable en
  el mismo directorio del proyecto (necesario para que `{$INCLUDE}` funcione
  con múltiples archivos).
- El campo de flags es libre (ej: `-Sh` modo `{$H+}` por defecto, `-O2`
  optimización, `-vw` mostrar warnings), y se valida contra una lista blanca
  de caracteres para evitar inyección de shell.

## Seguridad / sandboxing

Cada compilación y cada ejecución corren en un contenedor descartable de la
imagen `runner/`, con:

- `--network none` (sin red)
- `--memory` / `--cpus` / `--pids-limit` (límites de recursos)
- `--read-only` + `tmpfs` en `/tmp` (filesystem raíz de sólo lectura)
- `--cap-drop ALL` + `--security-opt no-new-privileges`
- usuario no-root (uid 1000)
- timeout tanto en compilación como en ejecución

Estos límites son configurables vía variables de entorno del backend
(`FASTPASCAL_MEM_LIMIT`, `FASTPASCAL_CPU_LIMIT`, `FASTPASCAL_PIDS_LIMIT`).

## Variables de entorno (backend)

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `4000` | Puerto del API |
| `FASTPASCAL_RUNNER_IMAGE` | `fastpascal-runner` | Imagen Docker del sandbox |
| `FASTPASCAL_TMP_DIR` | `os.tmpdir()/fastpascal-runs` | Dónde escribe el backend los archivos temporales |
| `FASTPASCAL_HOST_TMP_DIR` | = `FASTPASCAL_TMP_DIR` | Ruta equivalente vista desde el host (sólo Modo B) |
| `FASTPASCAL_MEM_LIMIT` | `256m` | Límite de memoria del sandbox |
| `FASTPASCAL_CPU_LIMIT` | `0.5` | Límite de CPU del sandbox |
| `FASTPASCAL_PIDS_LIMIT` | `128` | Límite de procesos del sandbox |
| `FASTPASCAL_RUN_TIMEOUT_MS` | `120000` | Tope global de una sesión interactiva de ejecución |

### Variable de entorno (frontend)

| Variable | Default | Descripción |
|---|---|---|
| `VITE_BACKEND_WS_URL` | `ws://<host-actual>:4000/ws/run` | Override manual si el backend no está en el puerto/host por defecto |

## Qué NO hace FASTPASCAL (a propósito)

No resuelve ejercicios, no genera lógica de negocio, no tiene botones para
tareas específicas y no "arregla" el código del usuario. Es un runner
genérico: cualquier proyecto Pascal compatible con FPC debería poder
compilarse y ejecutarse acá, no sólo el de un laboratorio en particular.
