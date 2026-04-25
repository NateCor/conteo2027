# Conteo 2027 - FEUC Election Dashboard

A modernized static dashboard for visualizing vote counting in FEUC (Federación de Estudiantes de la Universidad Católica) elections. Originally built for 2017, completely modernized for the 2027 election cycle.

## 🚀 Tech Stack

- **Build Tool**: [Vite](https://vitejs.dev/) (replaced legacy Gulp 3)
- **Template Engine**: [Pug](https://pugjs.org/)
- **Styling**: [Sass](https://sass-lang.com/) + [Bulma CSS](https://bulma.io/)
- **Data Visualization**: [Chart.js](https://www.chartjs.org/)
- **Data Binding**: [Rivets.js](http://rivetsjs.com/)
- **Data Source**: Microsoft Excel (SharePoint) via automated pipeline

## 📊 Features

- **Real-time Vote Visualization**: Pie charts and bar graphs for Lista FEUC, Consejero Superior, and Presupuesto Participativo
- **Territory Breakdown**: View results by campus territory (Campus San Joaquín, Casa Central, Lo Contador, Oriente, Villarrica)
- **Day-by-Day Analysis**: Toggle between Day 1, Day 2, or combined totals
- **Mesa-Level Detail**: Drill down to individual voting tables
- **Participation Tracking**: Monitor voter turnout by territory
- **Automated Data Pipeline**: Fetches latest data from Excel and transforms it to JSON

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/your-org/conteo2026.git
cd conteo2026

# Install dependencies
npm install
```

## 🏃 Running Locally

### Development Mode
```bash
npm run dev
```
Starts Vite dev server with hot reload at `http://localhost:3000`

### Fetch Latest Data
```bash
npm run fetch-data
```
Downloads Excel from SharePoint, parses it, and generates `public/data.json`

### Build for Production
```bash
npm run build
```
Generates optimized static files in `dist/` folder

### Preview Production Build
```bash
npm run preview
```
Serves the production build locally for testing

### 🧪 Test Excel Compatibility
```bash
npm run test-excel -- ./temp/your-excel-file.xlsx
```
Tests an Excel file for compatibility with the dashboard parser. Shows:
- All territories and mesas found
- Any unmapped names that need configuration updates
- Column structure analysis
- Generates `temp/test-output.json` for review

## 📁 Project Structure

```
conteo2026/
├── config/
│   ├── election.json             # Election metadata, parties & projects
│   └── territories.json          # Territory & mesa mappings (rarely changes)
├── public/
│   └── data.json                 # Generated vote data (auto-created)
├── scripts/
│   ├── fetch-data.js            # Excel download & parser
│   ├── build-html.js            # Pug compiler
│   └── test-excel.js            # Excel compatibility tester
├── src/
│   ├── js/
│   │   ├── main.js              # Main application logic
│   │   ├── dataFetcher.js       # JSON data loader
│   │   ├── chartVars.js         # Chart.js configuration
│   │   ├── config.js            # Reads from config/election.json
│   │   ├── projectsArray.js     # Project definitions
│   │   └── movementColors.js    # Legacy color definitions
│   ├── pug/
│   │   ├── index.pug            # Main page template
│   │   ├── vote-pills-*.pug     # Vote display pills
│   │   └── [other templates]    # Territories, mesas, etc.
│   ├── scss/
│   │   ├── style.scss           # Main stylesheet
│   │   └── custom.scss          # Custom Bulma overrides
│   └── images/
│       └── favicon.png
├── temp/
│   └── last_count.xlsx          # Cached Excel file
├── .env                         # Environment variables (SHEET_URL)
├── package.json
├── vite.config.js
└── README.md
```

## 🔄 Updating for New Elections

### Quick Start (3 steps)
1. Edit `config/election.json` with new party/project names
2. Update the Excel file on SharePoint (ensure column headers match config)
3. Run `npm run fetch-data`

### Detailed Guide

#### Step 1: Update `config/election.json`

This is the **single source of truth** for all election-specific data:

```json
{
  "election": {
    "name": "Elecciones FEUC 2027",
    "year": 2027,
    "round": "Primera Vuelta",
    "totalVoters": 27000,
    "lastUpdated": "2027-10-22"
  },
  "parties": {
    "lista": [
      {
        "key": "nau",
        "excelNames": ["NAU!", "Candidaturas NAU!"],
        "displayName": "NAU!",
        "color": "#6fd528",
        "active": true
      },
      // Add all parties here
    ]
  }
}
```

**Important:**
- `excelNames`: Must match the Excel column headers exactly
- `displayName`: What appears on the dashboard
- `active`: Set to `true` for parties participating in this election
- The fetch script will **hard fail** if it finds unknown Excel columns

#### Step 2: Update Excel on SharePoint
- Ensure column headers match the `excelNames` in config
- Ensure sheet names match expected format (Directiva FEUC, Consejería Superior, etc.)

#### Step 3: Fetch and Build
```bash
npm run fetch-data   # Downloads and validates Excel
npm run build        # Builds the dashboard
```

### Configuration Files

| File | Purpose | Update Frequency |
|------|---------|------------------|
| `config/election.json` | Parties, projects, election metadata | Every election |
| `config/territories.json` | Territory and mesa mappings | Rarely (university structure changes) |
| `.env` | SharePoint URL | Per election |

### Validation Rules
- **Hard Fail**: Unknown Excel column found → Add it to config first
- **Warning**: Config party not in Excel → Party didn't participate
- **Success**: All Excel columns match config exactly

### Error Messages
```
[ERROR] Found unknown party in Excel: "New Party X"
         → Add it to config/election.json first!
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
SHEET_URL=https://your-sharepoint-site.com/path/to/excel.xlsx?download=1
```

## 📥 Data Pipeline

The system uses a centralized configuration and automated data pipeline:

1. **Configuration**: `config/election.json`
   - Defines party names, colors, and Excel column mappings
   - Defines project names and colors
   - Single source of truth for election-specific data

2. **Territory Mapping**: `config/territories.json`
   - Maps Excel territory/mesa names to dashboard IDs
   - Rarely changes between elections

3. **Fetch Script**: `scripts/fetch-data.js`
   - Downloads Excel from SharePoint URL
   - Validates Excel columns against configuration
   - Fails hard on unknown parties (enforces correct configuration)
   - Warns on missing parties (they may not have participated)
   - Strips `>>` prefixes from Excel columns automatically
   - Caches to `temp/last_count.xlsx`
   - Falls back to cache if download fails

4. **Output**: Generates `public/data.json` with structure:
   ```json
   {
     "dia1": { "lista": {...}, "sup": {...}, "ppto": {...} },
     "dia2": { "lista": {...}, "sup": {...}, "ppto": {...} },
     "total": { "lista": {...}, "sup": {...}, "ppto": {...} }
   }
   ```

### Excel Structure

The parser expects paired columns for each party (Day 1, Day 2):
- Columns 3-4: First party
- Columns 5-6: Second party
- And so on...

The configuration file tells the parser which Excel column names map to which internal keys.

## 🗺️ Territory Mapping

Excel territory names are mapped to dashboard IDs in `config/territories.json`:

| Excel Name | Dashboard ID |
|------------|--------------|
| Agronomía y Sistemas Naturales | agro |
| Ciencias Biológicas | csbio |
| Ciencias de la Salud | salud |
| College | coll |
| Ing. Comercial | comer |
| ... | ... |

See `config/territories.json` for complete territory and mesa mappings.

**Note:** Territory changes are rare. Only update this file if the university creates/closes departments or renames territories.

## 🚀 Deployment

### Static Hosting (Recommended)

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
    - cron: '*/5 * * * *'  # Every 5 minutes
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run fetch-data
      - run: npm run build
      - run: npm run deploy  # Your deploy command
```

## 🧪 Testing New Excel Files

Before using a new Excel file in production, test it for compatibility:

```bash
# 1. Copy the Excel to temp/
cp "path/to/new-election.xlsx" temp/new-election.xlsx

# 2. Run the test script
npm run test-excel -- temp/new-election.xlsx

# 3. Check the output
# - ✅ All mapped = ready to use
# - ❌ Unmapped entries = need to update TERRITORY_MAP or MESA_MAP
```

If there are unmapped entries, update the maps in `scripts/fetch-data.js` before using the file.

## 🐛 Troubleshooting

### Data Not Updating
- Check `.env` file has correct `SHEET_URL`
- Verify Excel is publicly accessible
- Check `temp/last_count.xlsx` cache isn't stale

### Wrong Totals
- Ensure Excel has "Total" row at the end
- Check territory/mesa mappings in `fetch-data.js`
- Verify column indices match expected structure

### Build Errors
- Delete `node_modules` and `package-lock.json`, then `npm install`
- Ensure Node.js version is 18+ (check with `node --version`)

## 🚫 Git Ignore

The following files are excluded from version control:

- `node_modules/` - Dependencies (reinstall with `npm install`)
- `dist/` - Build output (regenerate with `npm run build`)
- `public/data.json` - Generated data (regenerate with `npm run fetch-data`)
- `temp/last_count.xlsx` - Cached Excel file
- `.env` - Environment variables (contains SHEET_URL)
- `.DS_Store` - macOS metadata
- `.vscode/`, `.idea/` - IDE settings

## 📝 Legacy Notes

⚠️ This codebase contains legacy elements from the 2017 version:
- Some variable names use old party abbreviations
- Project IDs (tdicai, tdicoll, caco, etc.) are historical
- Color scheme maintained for consistency

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## 📄 License

ISC License - See original repository for details.

## 🙏 Acknowledgments

- Original 2017 version by [@wachunei](https://github.com/wachunei)
- FEUC student organizations
- El PUClítico journalism team

---

**Note**: This is a fork/modernization of the original 2017 codebase, updated for Node.js 20+, Vite build system, and the 2026 election cycle.
