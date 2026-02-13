# Conteo 2026 - FEUC Election Dashboard

A modernized static dashboard for visualizing vote counting in FEUC (Federación de Estudiantes de la Universidad Católica) elections. Originally built for 2017, completely modernized for the 2026 election cycle.

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

## 📁 Project Structure

```
conteo2026/
├── public/
│   └── data.json                 # Generated vote data (auto-created)
├── scripts/
│   ├── fetch-data.js            # Excel download & parser
│   └── build-html.js            # Pug compiler
├── src/
│   ├── js/
│   │   ├── main.js              # Main application logic
│   │   ├── dataFetcher.js       # JSON data loader
│   │   ├── chartVars.js         # Chart.js configuration
│   │   ├── config.js            # Party/project colors & constants
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

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
SHEET_URL=https://your-sharepoint-site.com/path/to/excel.xlsx?download=1
```

### Party Configuration

Edit `src/js/config.js` to update party names and colors:

```javascript
export const PARTY_CONFIG = {
  lista: {
    nau: { name: 'NAU!', color: '#6fd528' },
    mg: { name: 'Amanecer', color: '#FFC0CB' },
    // Add more parties as needed
  }
};
```

### Total Voters (Padrón)

Update the estimated total voter count:

```javascript
export const TOTAL_VOTERS = 26500; // Update for each election cycle
```

## 📥 Data Pipeline

The system uses a two-stage data pipeline:

1. **Fetch**: `scripts/fetch-data.js`
   - Downloads Excel from SharePoint URL
   - Caches to `temp/last_count.xlsx`
   - Falls back to cache if download fails

2. **Transform**: Parses 3 sheets:
   - **Sheet 1**: Lista FEUC votes
   - **Sheet 2**: Consejería Superior votes
   - **Sheet 3**: Presupuesto Participativo votes

3. **Output**: Generates `public/data.json` with structure:
   ```json
   {
     "dia1": { "lista": {...}, "sup": {...}, "ppto": {...} },
     "dia2": { "lista": {...}, "sup": {...}, "ppto": {...} },
     "total": { "lista": {...}, "sup": {...}, "ppto": {...} }
   }
   ```

### Excel Structure

The parser expects paired columns for each party:
- Column 3-4: NAU! (Día 1, Día 2)
- Column 5-6: Amanecer (Día 1, Día 2)
- Column 7-8: Blancos (Día 1, Día 2)
- Column 9-10: Nulos (Día 1, Día 2)

## 🗺️ Territory Mapping

Excel territory names are mapped to dashboard IDs:

| Excel Name | Dashboard ID |
|------------|--------------|
| Agronomía y Sistemas Naturales | agro |
| Ciencias Biológicas | csbio |
| Ciencias de la Salud | salud |
| College | coll |
| Ing. Comercial | comer |
| ... | ... |

See `scripts/fetch-data.js` for complete `TERRITORY_MAP` and `MESA_MAP`.

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
