# Conteo FEUC - Election Dashboard

A modernized static dashboard for visualizing vote counting in FEUC (Federación de Estudiantes de la Universidad Católica) elections. Originally built for 2017, completely modernized for the 2026 election cycle.

## Tech Stack

- **Build Tool**: [Vite](https://vitejs.dev/) (replaced legacy Gulp 3)
- **Template Engine**: [Pug](https://pugjs.org/)
- **Styling**: [Sass](https://sass-lang.com/) + [Bulma CSS](https://bulma.io/)
- **Data Visualization**: [Chart.js](https://www.chartjs.org/)
- **Data Binding**: [Rivets.js](http://rivetsjs.com/)
- **Data Source**: Microsoft Excel (SharePoint) via automated pipeline

## Features

- **Real-time Vote Visualization**: Pie charts and bar graphs for Lista FEUC, Consejero Superior, and Presupuesto Participativo
- **Dynamic Header**: Automatically adapts between first-round (ranked party list) and second-round (2-party bar) display
- **Territory Breakdown**: View results by campus territory
- **Day-by-Day Analysis**: Toggle between Day 1, Day 2, or combined totals
- **Mesa-Level Detail**: Drill down to individual voting tables
- **Participation Tracking**: Monitor voter turnout by territory
- **Auto-Detection**: Active parties are automatically detected from the Excel file — no manual config editing needed to switch election rounds
- **Automated Color Generation**: SCSS color classes are generated from `config/election.json` at build time

## Installation

```bash
# Clone the repository
git clone https://github.com/wachunei/conteo2017.git
cd conteo2017-master

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env to add your SharePoint URL (optional — can use --file flag instead)
```

## Running Locally

### Development Mode
```bash
npm run dev
```
Starts Vite dev server with hot reload at `http://localhost:3000`.

### Fetch Latest Data
```bash
# From SharePoint (requires SHEET_URL in .env)
npm run fetch-data

# From a local Excel file
npm run fetch-data -- --file temp/your-excel-file.xlsx

# With a custom total voter count (overrides config/election.json)
npm run fetch-data -- --file temp/your-excel-file.xlsx --total-voters 26501
```
Downloads/parses the Excel, auto-detects active parties, and generates `public/data.json`.

### Build for Production
```bash
npm run build
```
Fetches data, generates SCSS colors, compiles Pug templates, and builds optimized static files in `dist/`.

### Preview Production Build
```bash
npm run preview
```

### Test Excel Compatibility
```bash
npm run test-excel -- temp/your-excel-file.xlsx
```
Validates an Excel file against config maps. Reports any unmapped territories, mesas, parties, or projects.

## Project Structure

```
conteo2017-master/
├── config/
│   ├── election.json             # Election metadata, parties, projects, colors
│   └── territories.json          # Territory & mesa mappings (rarely changes)
├── public/
│   └── data.json                 # Generated vote data (auto-created)
├── scripts/
│   ├── fetch-data.js             # Excel download, validation, parser
│   ├── build-html.js             # Pug compiler (injects config data)
│   ├── generate-scss-colors.js   # Generates _colors-auto.scss from config
│   └── test-excel.js             # Excel compatibility tester
├── src/
│   ├── js/
│   │   ├── main.js               # Main application logic
│   │   ├── dataFetcher.js        # JSON data loader
│   │   ├── chartVars.js          # Chart.js configuration
│   │   ├── config.js             # Reads config + runtime data
│   │   └── projectsArray.js      # Project definitions
│   ├── pug/
│   │   ├── index.pug             # Main page template
│   │   ├── vote-pills-*.pug      # Vote display pills (generated from config)
│   │   └── [other templates]     # Territories, mesas, etc.
│   ├── scss/
│   │   ├── style.scss            # Main stylesheet entry
│   │   ├── _colors-auto.scss     # Auto-generated colors (do not edit)
│   │   └── custom.scss           # Custom Bulma overrides
│   └── images/
│       └── favicon.png
├── temp/
│   └── last_count.xlsx           # Cached Excel file (gitignored)
├── .env.example                  # Environment variable template
├── .env                          # Environment variables (gitignored)
├── package.json
├── vite.config.js
└── README.md
```

## Updating for New Elections

### Simplified Workflow (No Code Changes Needed)

The system now **auto-detects** which parties are active from the Excel file itself. Switching between election rounds requires **no JSON editing**:

1. Place the new Excel file in `temp/` (or update `SHEET_URL` in `.env`)
2. Run `npm run fetch-data -- --file temp/new-file.xlsx --total-voters 26501`
3. Run `npm run build`

That's it. The script reads the Excel headers, detects which parties are present, and writes the active party list to `data.json`. The frontend reads this at runtime.

### When You Need to Edit Config

You only need to edit `config/election.json` when:

- **Adding a new party** that doesn't exist in the config yet (new party appearing in the Excel)
- **Changing party colors or display names**
- **Adding a new project** for Presupuesto Participativo
- **Changing `totalVoters`** (or use `--total-voters` CLI flag to avoid editing)

### Config File Reference

| File | Purpose | Update Frequency |
|------|---------|------------------|
| `config/election.json` | Parties, projects, colors, election metadata | Only when parties change |
| `config/territories.json` | Territory and mesa mappings | Rarely (university structure changes) |
| `.env` | SharePoint URL | Per election (or use `--file` flag) |

### How Auto-Detection Works

1. `fetch-data.js` reads the Excel header row
2. For each party in `config/election.json`, it checks if any of the party's `excelNames` appear as a column header
3. Parties found in the Excel are marked as active; missing parties are inactive
4. The detected active party keys are written to `data.json` as `activeParties`
5. The election type (`firstRound` or `secondRound`) is derived: >2 active parties = first round
6. At runtime, `src/js/config.js` reads `activeParties` from the fetched data instead of the `active` flags

This means the `active` field in `election.json` is now a **fallback only** (used before data loads). You generally don't need to change it.

### Excel Structure Requirements

The parser expects:
- Sheets named "Directiva FEUC", "Consejería Superior", and optionally "Presupuestos Participativos"
- Paired columns for each party (Day 1, Day 2)
- Column headers matching `excelNames` in `config/election.json`
- Columns: Campus, Territorio, Mesa, then party columns, then Blancos, Nulos

### Validation Rules

- **Hard Fail**: Unknown Excel column found → Add it to `config/election.json` first
- **Info**: Config party not in Excel → Party simply not active for this round (no action needed)
- **Skip**: Territorial sheets are automatically skipped

## Environment Variables

Create a `.env` file (see `.env.example`):

```env
SHEET_URL=https://your-sharepoint-site.com/path/to/excel.xlsx?download=1
```

Leave `SHEET_URL` empty to use `--file` flag instead.

## Data Pipeline

1. **Configuration**: `config/election.json` defines all parties, projects, colors, and Excel column mappings
2. **Color Generation**: `scripts/generate-scss-colors.js` reads `election.json` and generates `src/scss/_colors-auto.scss` with SCSS variables and `.bar-*` classes
3. **HTML Compilation**: `scripts/build-html.js` injects config data into Pug templates (election name, year, vote-pills)
4. **Fetch Script**: `scripts/fetch-data.js` downloads/parses Excel, auto-detects active parties, validates, and generates `public/data.json`
5. **Frontend**: `src/js/config.js` reads runtime data from `data.json` (active parties, election type, total voters)

### Output: `public/data.json`
```json
{
  "dia1": { "lista": {...}, "sup": {...}, "ppto": {...} },
  "dia2": { "lista": {...}, "sup": {...}, "ppto": {...} },
  "total": { "lista": {...}, "sup": {...}, "ppto": {...} },
  "activeParties": { "lista": ["nau", "mg", ...], "sup": [...], "projects": [...] },
  "electionType": "firstRound",
  "totalVoters": 26501
}
```

## Testing New Excel Files

Before using a new Excel file in production, test it for compatibility:

```bash
# 1. Run the test script
npm run test-excel -- temp/new-election.xlsx

# 2. Check the output
# - OK = ready to use
# - UNMAPPED = need to update config/election.json or config/territories.json
```

If there are unmapped entries, update the config files (not the scripts — all maps are in `config/`).

## Deployment

The `dist/` folder contains static files suitable for any static host:

- **Vercel**: Connect GitHub repo, build command: `npm run build`, output: `dist`
- **Netlify**: Same configuration as Vercel
- **GitHub Pages**: Use GitHub Actions to build and deploy
- **AWS S3**: Upload `dist/` contents to S3 bucket

### Automated Updates

For live election night updates, set up a GitHub Action to run every 5 minutes:

```yaml
name: Update Data
on:
  schedule:
    - cron: '*/5 * * * *'
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run fetch-data
      - run: npm run build
      - run: npm run deploy
```

## Troubleshooting

### Data Not Updating
- Check `.env` has correct `SHEET_URL` (or use `--file` flag)
- Verify Excel is publicly accessible
- Check `temp/last_count.xlsx` cache isn't stale (delete it to force re-download)

### Wrong Totals
- Ensure Excel has "Total" row at the end
- Check territory/mesa mappings in `config/territories.json`
- Verify column headers match `excelNames` in `config/election.json`

### Build Errors
- Delete `node_modules` and `package-lock.json`, then `npm install`
- Ensure Node.js version is 18+ (check with `node --version`)

### Header Shows Wrong Election Type
- The header auto-detects from the Excel: >2 parties = first round, 2 parties = second round
- Run `npm run fetch-data` to regenerate `data.json` with the correct election type
- Refresh the page (the dev server serves `data.json` statically)

## Git Ignore

The following files are excluded from version control:

- `node_modules/` — Dependencies
- `dist/` — Build output
- `public/data.json` — Generated data
- `src/scss/_colors-auto.scss` — Auto-generated SCSS
- `*.xlsx`, `*.xls` — Excel data files
- `temp/` — Cache directory
- `.env` — Environment variables

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## License

ISC License — See original repository for details.

## Acknowledgments

- Original 2017 version by [@wachunei](https://github.com/wachunei)
- FEUC student organizations
- El PUClítico journalism team