# Conteo FEUC 2027

Página de resultados en vivo de las elecciones FEUC (Federación de Estudiantes de la Pontificia Universidad Católica de Chile), hecha para El PUClítico. Lee la planilla online donde se cuentan los votos y muestra los resultados mesa a mesa, por territorio y en total, sin que nadie tenga que recargar la página.

Basada en el [conteo2017](https://github.com/wachunei/conteo2017) original de Pedro Pablo Aste Kompen, modernizada para 2027 por Nathan Cortez.

---

## Guía rápida (sin conocimientos técnicos)

### Qué hace la página

- **Arriba:** el ranking de listas para Directiva FEUC y Consejería Superior, y cuántas mesas van escrutadas ("Mesas escrutadas: 37 de 114").
- **Insignias:** mientras se cuenta, las dos primeras listas muestran "Va 1°" y "Va 2°". Solo cuando todas las mesas de esa votación están escrutadas cambian a "Avanza". Si hay empate en el segundo lugar, las listas empatadas muestran "Empate". No existe una insignia "Gana", a propósito.
- **Detalle:** resultados por día (Día 1, Día 2, ambos), por mesa, por territorio, Consejerías Territoriales, participación por territorio y Presupuesto Participativo (esta última sección se oculta sola si la planilla no la trae).
- **En vivo:** la página revisa si hay datos nuevos cada 15 segundos y se actualiza sola. La píldora junto al título dice "● En vivo · actualizado HH:MM:SS". Si dice "Reconectando…", la página sigue mostrando los últimos números buenos mientras vuelve la conexión.
- **Modo oscuro:** el interruptor "Modo oscuro" de arriba cambia los colores. Todos parten en modo claro; la elección queda guardada en ese dispositivo.

### De dónde salen los números

1. El equipo anota los votos en la planilla online (Excel en SharePoint/OneDrive).
2. Un programa revisa esa planilla cada 20 segundos y, si cambió, genera un archivo nuevo con los resultados (`public/data.json`).
3. La página de cada persona lee ese archivo cada 15 segundos.

En total, un cambio en la planilla aparece en pantalla en menos de un minuto. Si la planilla queda a medio editar o con un error, el programa la rechaza y la página sigue mostrando los últimos datos válidos.

### Cambios comunes

Casi todo se cambia en **un solo archivo: `config/election.json`**. Ábrelo con cualquier editor de texto (en GitHub: abre el archivo y presiona el lápiz ✏️).

| Quiero cambiar... | Dónde |
|---|---|
| El nombre visible de una lista | `config/election.json` → la lista → `displayName` |
| El color de una lista | `config/election.json` → la lista → `color` (formato `#RRGGBB`) |
| El título de la página ("Elecciones FEUC 2027") | `config/election.json` → `election` → `name` |
| La cantidad de personas habilitadas para votar | `config/election.json` → `election` → `totalVoters` |
| Cada cuánto se actualiza la página | `config/election.json` → `election` → `refreshSeconds` |
| La dirección final del sitio (para la vista previa en WhatsApp) | `config/election.json` → `election` → `siteUrl` |
| Los textos "En vivo", "Avanza", "Va", "Empate" | `src/js/main.js`, bloque `TEXTOS` al inicio |
| Títulos de secciones ("Total Universidad", "Mesas", etc.) | `src/pug/`, un archivo por sección (marcados con ✏️) |
| Créditos y enlaces del pie de página | `src/pug/footer.pug` |
| Texto de la vista previa al compartir el link | `src/pug/head.pug` (línea marcada con ✏️) |
| Imagen de la vista previa al compartir el link | Reemplaza `public/og-image.png` (1200×630 px) |
| Color de marca (encabezado celeste) | `src/scss/style.scss`, primera línea |
| Colores del modo oscuro | `src/scss/_dark.scss` (bloque marcado con ✏️) |
| El link de la planilla online | Archivo `.env` (copia `.env.example`) |

Todos los lugares pensados para editar a mano están marcados en el código con **✏️ EDITABLE**.

**Ejemplo: renombrar una lista.** En `config/election.json`, una lista se ve así:

```json
{
  "key": "cero",
  "excelNames": ["Trinidad y Amanda", "0%"],
  "displayName": "Trinidad y Amanda",
  "color": "#FFD700",
  "active": false
}
```

- `displayName` es el nombre que ve la gente. Se puede cambiar libremente.
- `color` es el color de la lista en gráficos y píldoras.
- `excelNames` son los encabezados **exactos** que esa lista tiene en la planilla. Si el equipo cambia el encabezado en el Excel, agrega el nuevo nombre aquí.
- `key` es un identificador interno. **No lo cambies** una vez que la lista existe.

Una misma lista puede aparecer en varias secciones (`lista` = Directiva FEUC, `sup` = Consejería Superior, `ct` = Consejerías Territoriales). Si cambias su nombre o color, cámbialo en cada sección donde aparece.

### Reglas para no romper nada

- En `config/election.json`: el texto va entre comillas dobles `"así"`, va una coma entre elementos y **no** va coma después del último. Si el sitio deja de funcionar tras una edición, casi siempre es una coma o comilla.
- En los archivos `.pug`: no cambies los espacios al inicio de las líneas, ni lo que está entre llaves `{...}` o paréntesis `(...)`. Cambia solo el texto visible.
- Una lista nueva que aparezca en la planilla **debe agregarse primero** a `config/election.json`. Si no, el programa se detiene a propósito y avisa qué encabezado no reconoce, en vez de perder votos en silencio.
- Si tienes dudas, pide a alguien técnico que revise antes de publicar.

---

## Technical reference

### Stack

- **Build:** [Vite](https://vitejs.dev/) 5, Node.js 18+ (tested on 22)
- **Templates:** [Pug](https://pugjs.org/), compiled to `index.html` by `scripts/build-html.js`
- **Styles:** Sass + [Bulma](https://bulma.io/) 0.2.3
- **Charts / binding:** [Chart.js](https://www.chartjs.org/) 2, [Rivets.js](http://rivetsjs.com/)
- **Data:** an Excel workbook (SharePoint link or local file) parsed into `public/data.json`

### Quick start

```bash
git clone https://github.com/NateCor/conteo2027.git
cd conteo2027
npm install
cp .env.example .env          # optional: paste the SharePoint share link as SHEET_URL
npm run fetch-data -- --file path/to/count.xlsx   # or without --file to use SHEET_URL
npm run dev
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Generates SCSS colors, compiles Pug, starts the Vite dev server |
| `npm run fetch-data` | Downloads `SHEET_URL` (or `-- --file x.xlsx`), validates, writes `public/data.json` |
| `npm run fetch-data -- --total-voters N` | Overrides `election.totalVoters` for participation math |
| `npm run build` | fetch-data + colors + Pug + production build into `dist/` |
| `npm run test-excel -- file.xlsx` | Reports unmapped territories, mesas, lists or projects in a workbook |
| `SHEET_URL='<link>' node scripts/live-poll.js 20` | Election-night loop: re-fetches every 20 s, rewrites `data.json` only on change |

### Live pipeline

1. `scripts/live-poll.js` runs `fetch-data.js` every N seconds. A sheet that fails validation (mid-edit, unknown header) exits non-zero and `data.json` is left untouched.
2. `fetch-data.js` writes `data.json` atomically (temp file + rename), so a viewer never reads a half-written file.
3. `src/js/liveRefresh.js` re-fetches `data.json` every `election.refreshSeconds`. It re-renders only when the content changed and keeps the viewer's selections. A failed or unparseable response keeps the last good data. It backs off on errors (60 s max) and pauses while the tab is hidden. A time-bucket query parameter (`?t=`) keeps CDN caches from serving data older than one interval.

SharePoint `:x:/g/personal/...` share links are rewritten to the download endpoint automatically. A non-xlsx response (login page, viewer HTML) is rejected with a clear message.

### Project structure

```
config/
  election.json        # ✏️ lists, colors, names, election metadata (single source of truth)
  territories.json     # Excel territory/mesa names → internal ids (57 mesas, 22 territories)
  padron.json          # eligible voters per territory (Tricel padrón) for participation %
scripts/
  fetch-data.js        # download, validation, parsing → public/data.json
  live-poll.js         # election-night polling loop
  build-html.js        # Pug → index.html (injects config)
  generate-scss-colors.js  # election.json colors → src/scss/_colors-auto.scss
  test-excel.js        # workbook compatibility check
src/
  js/main.js           # page logic, charts, header ranking and badges (✏️ TEXTOS block)
  js/liveRefresh.js    # auto-refresh loop
  js/config.js         # config + runtime data helpers
  js/dataFetcher.js    # default data object built from config
  pug/                 # page templates (✏️ section titles, footer, link-preview text)
  scss/style.scss      # entry; ✏️ brand color
  scss/custom.scss     # layout and component styles
  scss/_dark.scss      # dark theme (html.dark)
public/
  data.json            # generated results (tracked, but regenerate; never hand-edit)
  og-image.png         # link-preview image
```

### Excel format

- Sheets: **"Directiva FEUC"**, **"Consejería Superior"**, optional **"Presupuestos Participativos"** and **"Consejerías Territoriales"**.
- Main sheets: Campus, Territorio, Mesa, then one Día 1 / Día 2 column pair per list, then Blancos, Nulos and a per-day "Mesas Escrutada" checkbox pair (booleans or ☐/☑).
- Consejerías Territoriales: one 5-column block per list ("Candidaturas X": Nombre, Día 1, Día 2, Total, Total Global). The parser cross-checks every candidate against "Total Global".
- Rows labelled "Total" or "% de válidamente emitidas" are skipped. Totals are computed, not read.
- An unknown list header is a hard failure: add it to `config/election.json` (`excelNames`) first. A configured list missing from the sheet just isn't active this round.
- First vs. second round is detected from the number of lists in the sheet. `election.round` only controls the header before data loads.

### Pitfalls

- List `key`s and project `key`s share one namespace (SCSS classes, chart keys). Check for collisions before adding one.
- `public/data.json` is tracked but generated. Don't commit regenerated test data, and don't run `git checkout -- public/data.json` while the live poller is serving.
- New bindings that show counts or percentages need the Rivets formatters `| num` / `| pc` (Chilean format: 4.142 · 57,89 %).
- Bulma 0.2.3 has no dark-mode support. New components need explicit `html.dark` overrides in `_dark.scss`.

### Deployment

The build is a static site (`dist/`) for any static host. The plan is a subdomain of elpuclitico.cl on free static hosting. A subpath deployment would need `base` set in `vite.config.js`.

Speed of live updates depends on how `data.json` is republished. A scheduled GitHub Actions job runs every 5 minutes at best and is often delayed, which is too slow for election night. Pushing `data.json` straight to the host whenever `live-poll.js` sees a change (e.g. Cloudflare Pages direct upload) keeps updates within seconds.

### Credits and license

- Original 2017 version by [Pedro Pablo Aste Kompen (@wachunei)](https://github.com/wachunei) for El PUClítico.
- Modernized for 2027 by [Nathan Cortez (@NateCor)](https://github.com/NateCor).
- The site footer declares [CC BY-NC-ND 4.0](http://creativecommons.org/licenses/by-nc-nd/4.0/).
