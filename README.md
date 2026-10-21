# WireMorph — Fritzing ↔ Wokwi Circuit Converter

**WireMorph** is a local, browser-based electronic circuit diagram converter between **Fritzing** (`.fzz` ZIP archives / `.fz` XML sketches) and **Wokwi** (`diagram.json` hardware simulation files), purpose-built for ESP32 and embedded-systems developers using Fritzing, PlatformIO, and Wokwi in VS Code.

---

## 1. Capabilities & Engineering Philosophy

- **Fritzing `.fzz` → Wokwi `diagram.json`**:
  - Extracts `.fzz` ZIP containers in the browser (`JSZip`), enforcing archive safety bounds (compressed/uncompressed byte limits, max entry count, path traversal protection).
  - Parses internal `.fz` XML sketch files and embedded `.fzp` custom part definitions using strict XML validation (`fast-xml-parser`).
  - Resolves electrical nets across `WireModuleID` chains and solderless breadboards (`Breadboard-RSR03MB102`, `Half+Breadboard`), unifying 5-hole terminal strips (`A–E`, `F–J`) and power rails (`tp`, `tn`, `bp`, `bn`).
  - Transforms component properties (e.g. normalizing `220Ω`, `4.7kΩ`, `10k` to numeric Wokwi ohm values; mapping LED wavelengths to discrete Wokwi colors).
- **Wokwi `diagram.json` → Fritzing `.fzz`**:
  - Strictly validates `diagram.json` schema, unique component IDs, and `partId:pinName` connection endpoints.
  - Packages a real, extractable Fritzing `.fzz` ZIP archive containing a valid `.fz` XML sketch (`<module>`, `<views>`, `<instances>`, `<breadboardView>`, `<schematicView>`, and `<WireModuleID>` instances) alongside `.fzp` part definitions and breadboard `.svg` vector graphics.
  - Self-verifies every exported `.fzz` archive by re-extracting and validating all internal XML documents before enabling download.
- **Explicit Loss & Diagnostic Reporting**:
  - Never claims universal or lossless conversion. Distinguishes between `preserved`, `transformed`, `approximated`, `unsupported`, and `rejected` outcomes.
  - Blocks unsafe export when blocking errors (such as duplicate IDs, dangling connections, or unresolved connector IDs on supported parts) are detected.

---

## 2. Project Architecture

```text
src/
├── packages/
│   ├── conversion-core/
│   │   ├── types.ts           # Format-independent Intermediate Representation (IR) & report types
│   │   ├── pipeline.ts        # Bidirectional conversion orchestrator & Markdown/JSON report formatter
│   │   └── pipeline.test.ts   # Automated unit & integration test suite (node:test)
│   ├── part-mappings/
│   │   └── registry.ts        # Verified component & pin mapping registry, property normalizers, breadboard solver
│   ├── fritzing-adapter/
│   │   ├── importer.ts        # .fzz ZIP extractor, .fz/.fzp XML parser, and breadboard/wire net graph solver
│   │   └── exporter.ts        # .fzz ZIP generator with .fz sketch, .fzp part defs, .svg assets & self-validation
│   ├── wokwi-adapter/
│   │   ├── importer.ts        # Wokwi diagram.json parser & strict endpoint/ID validator
│   │   └── exporter.ts        # Wokwi diagram.json generator & post-export schema verifier
│   └── fixtures/
│       └── circuits.ts        # Representative .fzz and diagram.json fixtures for testing & live inspection
├── components/
│   ├── CircuitTopologyCanvas.tsx    # Interactive SVG netlist and topological visualizer
│   ├── ConversionPreviewPanel.tsx   # Inspection tables, diagnostics filter, archive inspector & export actions
│   ├── PartRegistryView.tsx         # Searchable documentation of verified component & pin mappings
│   └── LimitationsAndGuideView.tsx  # Format comparison matrix & PlatformIO + Wokwi VS Code workflow guide
└── utils/
    └── download.ts            # Local browser Blob download helpers
```

---

## 3. Supported & Tested Component Mappings

| Component Family | Fritzing `moduleIdRef` (Primary) | Wokwi `type` | Mapped Pins | Verification Fixture |
|---|---|---|---|---|
| **ESP32 DevKit V1 (30-Pin)** | `ESP32-DevKitC-30P-ModuleID` | `wokwi-esp32-devkit-v1` | 30 pins (`connector0..29` ↔ `3V3`, `EN`, `VP`, `VN`, `D34..VIN`) | `esp32-led-blink` |
| **ESP32 DevKitC V4 (38-Pin)** | `ESP32_DevKitc_V4_1` | `board-esp32-devkit-c-v4` | 38 pins (`connector0..37` ↔ `3V3`, `EN`, `VP`, `VN`, `34..GND.3`) | `esp32-v4-adc-pwm` |
| **5mm Standard LED** | `5mm-LED-Red-ModuleID` / `5mmColorLEDModuleID` | `wokwi-led` | `connector0` ↔ `C` (Cathode), `connector1` ↔ `A` (Anode) | `esp32-led-blink` |
| **Axial Resistor** | `ResistorModuleID` | `wokwi-resistor` | `connector0` ↔ `1`, `connector1` ↔ `2` | `esp32-led-blink` |
| **4-Pin Tactile Pushbutton** | `Tactile-Pushbutton-ModuleID` / `20A9BBEE34_ST` | `wokwi-pushbutton` | `connector0..3` ↔ `1.l`, `1.r`, `2.l`, `2.r` | `resistor-pushbutton-io` |
| **DHT22 Temp/Humidity Sensor** | `DHT22-Humidity-Temperature-ModuleID` | `wokwi-dht22` | `connector0..3` ↔ `VCC`, `SDA`, `NC`, `GND` | `wokwi-multi-sensor-iot` |
| **HC-SR04 Ultrasonic Sensor** | `HC-SR04-Ultrasonic-ModuleID` | `wokwi-hc-sr04` | `connector0..3` ↔ `VCC`, `TRIG`, `ECHO`, `GND` | `wokwi-multi-sensor-iot` |
| **SSD1306 I2C OLED (128x64)** | `SSD1306-OLED-I2C-ModuleID` | `board-ssd1306` | `connector0..3` ↔ `GND`, `VCC`, `SCL`, `SDA` | `wokwi-multi-sensor-iot` |
| **Rotary Potentiometer** | `Rotary-Potentiometer-ModuleID` / `3234DFDC00PotentiometerModuleID` | `wokwi-potentiometer` | `connector0..2` ↔ `VCC`/`GND`, `SIG`, `GND`/`VCC` | `esp32-v4-adc-pwm` |
| **Solderless Breadboard** | `Breadboard-RSR03MB102` | `wokwi-breadboard` | 5-hole terminal strips (`A–E`, `F–J`) & power rails (`tp`, `tn`, `bp`, `bn`) | `resistor-pushbutton-io` |

---

## 4. Commands to Run, Test, and Build

```bash
# Install dependencies
npm install

# Run automated unit and integration tests
npm test

# Run TypeScript strict type checking
npm run lint

# Start local development server on port 3000
npm run dev

# Build static production bundle into dist/
npm run build
```

---

## 5. GitHub Pages & Static Hosting Deployment

WireMorph is a 100% client-side static web application with zero backend dependencies. `vite.config.ts` is pre-configured with `base: './'` (relative asset paths) and `public/.nojekyll`, so the compiled `dist/` bundle works automatically on any GitHub Pages repository URL (`https://<username>.github.io/<repo-name>/`) or custom domain without editing paths.

### Option A: Automated Deployment via GitHub Actions (Recommended)
This project includes `.github/workflows/deploy.yml`:
1. Push this repository to GitHub (branch `main` or `master`).
2. In your GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Every push to `main` / `master` (or manual trigger in the **Actions** tab) automatically runs `npm test`, builds `dist/`, and publishes to GitHub Pages.

### Option B: Manual `dist/` Upload or Cloudflare Pages / Vercel / Netlify
- Run `npm run build` locally and upload the generated `dist/` folder, or set the build command to `npm run build` and output directory to `dist`.

---

## 6. Known Limitations

1. **PCB & Schematic Layer Geometry**: Fritzing's `<pcbView>` copper traces and `<schematicView>` symbol coordinates have no equivalent in Wokwi's single-canvas simulator and are omitted during `Fritzing → Wokwi` conversion.
2. **Orthogonal Wire Bend Hints**: Wokwi's wire routing vectors (e.g., `["v-10", "h120"]`) are approximated as direct point-to-point breadboard wires when exporting to Fritzing `.fzz`.
3. **Unmapped Components**: Components outside the verified registry (such as custom breakouts or SPI displays) are flagged as `Unsupported` in the conversion report rather than guessed.
