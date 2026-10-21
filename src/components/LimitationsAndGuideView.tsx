import React from 'react';
import { ExternalLink, FileCode2, Layers, ShieldAlert, Terminal } from 'lucide-react';

interface LimitationsAndGuideViewProps {
  mode: 'limitations' | 'platformio-guide';
}

export const LimitationsAndGuideView: React.FC<LimitationsAndGuideViewProps> = ({ mode }) => {
  if (mode === 'limitations') {
    return (
      <div className="space-y-6">
        <div className="border border-slate-200 bg-white rounded-lg p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Known Format Limitations & Loss Accounting Matrix
              </h1>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-3xl">
                Fritzing and Wokwi were designed for different engineering tasks: Fritzing models
                physical breadboard prototyping, schematic capture, and PCB copper layout, whereas
                Wokwi models real-time microcontroller instruction simulation and interactive
                peripherals. WireMorph never claims universal or lossless conversion—every conversion
                audits and reports what is preserved, transformed, approximated, or omitted.
              </p>
            </div>
          </div>
        </div>

        <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">
              Format Representation Comparison (Fritzing .fzz vs. Wokwi diagram.json)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                  <th className="py-3 px-4">Circuit Dimension</th>
                  <th className="py-3 px-4">Fritzing (.fzz / .fz XML)</th>
                  <th className="py-3 px-4">Wokwi (diagram.json)</th>
                  <th className="py-3 px-4">WireMorph Conversion Behavior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    Electrical Connectivity
                  </td>
                  <td className="py-3 px-4">
                    Explicit <code className="font-mono">&lt;connect&gt;</code> graph across
                    component connectors, <code className="font-mono">WireModuleID</code> instances,
                    and breadboard holes.
                  </td>
                  <td className="py-3 px-4">
                    Explicit point-to-point endpoint pairs{' '}
                    <code className="font-mono">[&quot;partA:pinA&quot;, &quot;partB:pinB&quot;]</code>.
                  </td>
                  <td className="py-3 px-4 text-emerald-800 font-medium">
                    Preserved / Transformed (Breadboard 5-hole strips & wire chains are resolved into
                    direct netlist connections).
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    Breadboard Substrate
                  </td>
                  <td className="py-3 px-4">
                    Components plug into <code className="font-mono">pin12A..pin12E</code> and power
                    rails on a <code className="font-mono">Breadboard-RSR03MB102</code> instance.
                  </td>
                  <td className="py-3 px-4">
                    Most Wokwi simulations wire pins directly without a breadboard instance.
                  </td>
                  <td className="py-3 px-4 text-blue-800 font-medium">
                    Transformed (WireMorph solves internal breadboard strip equivalence so electrical
                    nets remain intact).
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    Schematic & PCB Copper Views
                  </td>
                  <td className="py-3 px-4">
                    Separate <code className="font-mono">&lt;breadboardView&gt;</code>,{' '}
                    <code className="font-mono">&lt;schematicView&gt;</code>, and{' '}
                    <code className="font-mono">&lt;pcbView&gt;</code> layers.
                  </td>
                  <td className="py-3 px-4">Single unified 2D hardware simulation canvas.</td>
                  <td className="py-3 px-4 text-amber-800 font-medium">
                    Omitted on Fritzing → Wokwi (PCB traces and schematic layout have no Wokwi
                    equivalent and are logged in the report).
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    Wire Routing Geometry
                  </td>
                  <td className="py-3 px-4">
                    Bezier control points or straight <code className="font-mono">x1,y1,x2,y2</code>{' '}
                    wire segments.
                  </td>
                  <td className="py-3 px-4">
                    Orthogonal vector hints (e.g., <code className="font-mono">[&quot;v-10&quot;, &quot;h120&quot;]</code>).
                  </td>
                  <td className="py-3 px-4 text-amber-800 font-medium">
                    Approximated on Wokwi → Fritzing (Electrical endpoints and wire colors are
                    preserved; orthogonal bends become direct breadboard wires).
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    Passive & Manufacturing Metadata
                  </td>
                  <td className="py-3 px-4">
                    Includes tolerance (<code className="font-mono">±5%</code>), power rating, pin
                    spacing, and part numbers.
                  </td>
                  <td className="py-3 px-4">
                    Includes simulation attributes (<code className="font-mono">value</code>,{' '}
                    <code className="font-mono">bounce</code>, <code className="font-mono">gamma</code>).
                  </td>
                  <td className="py-3 px-4 text-blue-800 font-medium">
                    Primary values (<code className="font-mono">220Ω ↔ 220</code>, LED color) are
                    transformed; non-applicable attributes are listed as omitted.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    Unmapped / Custom Parts
                  </td>
                  <td className="py-3 px-4">
                    Arbitrary <code className="font-mono">.fzp</code> user parts.
                  </td>
                  <td className="py-3 px-4">
                    Custom C/Rust Wokwi chips (<code className="font-mono">chip-*</code>).
                  </td>
                  <td className="py-3 px-4 text-amber-800 font-medium">
                    Explicitly flagged as Unsupported; never silently dropped or fabricated.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-slate-200 bg-white rounded-lg p-5 space-y-2.5">
            <h3 className="text-base font-bold text-slate-900">
              Why Visual Positions Never Imply Connectivity
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              In Fritzing sketches, placing a component leg visually on top of a breadboard hole or
              another pin without establishing a <code className="font-mono">&lt;connect&gt;</code>{' '}
              node in the XML does not create an electrical connection. WireMorph strictly parses the
              documented <code className="font-mono">&lt;connectors&gt;</code> graph rather than
              guessing connectivity from 2D pixel overlap.
            </p>
          </div>
          <div className="border border-slate-200 bg-white rounded-lg p-5 space-y-2.5">
            <h3 className="text-base font-bold text-slate-900">
              Safety Gate Policy on Ambiguous Pins
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              If a supported component (such as an ESP32 DevKit V1) contains a connection on an
              unrecognized or out-of-range connector ID, WireMorph halts export and flags a blocking
              error diagnostic (<code className="font-mono">ERR_FRITZING_UNRESOLVED_CONNECTOR</code>
              ). This prevents subtle hardware bugs where a sensor or actuator would be wired to the
              wrong GPIO pin in simulation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 bg-white rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Terminal className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Using WireMorph with PlatformIO & Wokwi in VS Code
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-3xl">
              Follow this workflow to move your ESP32 hardware designs between Fritzing breadboard
              documentation and live firmware simulation in VS Code using PlatformIO and Wokwi.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-slate-200 bg-white rounded-lg p-5 space-y-3">
          <div className="text-xs font-mono font-semibold text-blue-700">01. Convert Circuit</div>
          <h2 className="text-base font-bold text-slate-900">
            Export diagram.json from Your Fritzing .fzz Sketch
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            In Fritzing, save your project as a shareable archive (
            <code className="font-mono">File → Save As Shareable (.fzz)</code>). Drop the{' '}
            <code className="font-mono">.fzz</code> file into WireMorph, review the pin mappings and
            diagnostics table, and click <strong>Download diagram.json</strong>.
          </p>
        </div>

        <div className="border border-slate-200 bg-white rounded-lg p-5 space-y-3">
          <div className="text-xs font-mono font-semibold text-blue-700">
            02. Configure PlatformIO
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Place diagram.json & wokwi.toml in Your Project Root
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Copy the downloaded <code className="font-mono">diagram.json</code> into the root folder
            of your PlatformIO ESP32 project alongside <code className="font-mono">platformio.ini</code>{' '}
            and create a <code className="font-mono">wokwi.toml</code> file pointing to your compiled
            firmware binary.
          </p>
        </div>

        <div className="border border-slate-200 bg-white rounded-lg p-5 space-y-3">
          <div className="text-xs font-mono font-semibold text-blue-700">
            03. Run Simulator & Sync Back
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Simulate in VS Code & Export Back to Fritzing (.fzz)
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Press <code className="font-mono">F1 → Wokwi: Start Simulator</code> in VS Code. If you
            add sensors or change GPIO pins in <code className="font-mono">diagram.json</code>, load
            it into WireMorph&apos;s <strong>Wokwi → Fritzing</strong> mode to generate an updated{' '}
            <code className="font-mono">.fzz</code> project.
          </p>
        </div>
      </div>

      {/* Reference Configuration Snippets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-900">platformio.ini</span>
            <span className="text-xs text-slate-500">ESP32 DevKit V1 Configuration</span>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
            <code>{`[env:esp32doit-devkit-v1]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
monitor_speed = 115200
lib_deps =
  beegee-tokyo/DHT sensor library for ESPx@^1.19
  adafruit/Adafruit SSD1306@^2.5.7`}</code>
          </pre>
        </div>

        <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-900">wokwi.toml</span>
            <span className="text-xs text-slate-500">Wokwi for VS Code Firmware Link</span>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
            <code>{`[wokwi]
version = 1
firmware = ".pio/build/esp32doit-devkit-v1/firmware.bin"
elf = ".pio/build/esp32doit-devkit-v1/firmware.elf"`}</code>
          </pre>
        </div>
      </div>

      {/* Official File-Format Specification Links */}
      <div className="border border-slate-200 bg-white rounded-lg p-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-slate-700" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">
            Official File-Format Specifications & Documentation
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <a
            href="https://github.com/fritzing/fritzing-app/wiki/2.2-Sketch-file-format"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50/30 transition-colors flex items-center justify-between gap-2"
          >
            <div>
              <div className="font-semibold text-slate-900">Fritzing Sketch File Format (2.2)</div>
              <div className="text-slate-500 mt-0.5">Official .fz / .fzz XML specification</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          </a>

          <a
            href="https://github.com/fritzing/fritzing-app/wiki/2.1-part-file-format"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50/30 transition-colors flex items-center justify-between gap-2"
          >
            <div>
              <div className="font-semibold text-slate-900">Fritzing Part File Format (2.1)</div>
              <div className="text-slate-500 mt-0.5">Official .fzp & connector specification</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          </a>

          <a
            href="https://github.com/fritzing/fritzing-app/wiki/2.-Developer-Guide"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50/30 transition-colors flex items-center justify-between gap-2"
          >
            <div>
              <div className="font-semibold text-slate-900">Fritzing Developer Guide</div>
              <div className="text-slate-500 mt-0.5">Architecture & view layer documentation</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          </a>

          <a
            href="https://docs.wokwi.com/diagram-format"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50/30 transition-colors flex items-center justify-between gap-2"
          >
            <div>
              <div className="font-semibold text-slate-900">Wokwi diagram.json Format</div>
              <div className="text-slate-500 mt-0.5">Official parts & connections schema</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          </a>

          <a
            href="https://docs.wokwi.com/vscode/platformio"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50/30 transition-colors flex items-center justify-between gap-2"
          >
            <div>
              <div className="font-semibold text-slate-900">Wokwi + PlatformIO Workflow</div>
              <div className="text-slate-500 mt-0.5">VS Code extension & wokwi.toml guide</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          </a>

          <div className="p-3.5 border border-slate-200 rounded-md bg-slate-50 flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-900">100% Local Browser Execution</div>
              <div className="text-slate-500 mt-0.5">Zero cloud uploads · Zero telemetry</div>
            </div>
            <FileCode2 className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
};
