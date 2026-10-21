import JSZip from 'jszip';

export interface SampleFixtureMeta {
  id: string;
  title: string;
  subtitle: string;
  direction: 'fritzing-to-wokwi' | 'wokwi-to-fritzing';
  fileName: string;
  expectedOutcome: 'clean' | 'warnings-unsupported' | 'error-rejected';
  description: string;
}

export const SAMPLE_FIXTURES: SampleFixtureMeta[] = [
  {
    id: 'esp32-led-blink',
    title: 'ESP32 + LED + 220Ω Resistor Blink (.fzz)',
    subtitle: 'Verified Fritzing Archive → Wokwi',
    direction: 'fritzing-to-wokwi',
    fileName: 'esp32_led_blink.fzz',
    expectedOutcome: 'clean',
    description:
      'Minimal ESP32 DevKit V1 circuit driving a 5mm Red LED on GPIO 2 (connector27) through a 220Ω current-limiting resistor returning to GND.1 (connector13).',
  },
  {
    id: 'resistor-pushbutton-io',
    title: 'ESP32 + Pushbutton + Pull-Down Resistor on Breadboard (.fzz)',
    subtitle: 'Breadboard Strip Net Solver → Wokwi',
    direction: 'fritzing-to-wokwi',
    fileName: 'esp32_pushbutton_breadboard.fzz',
    expectedOutcome: 'clean',
    description:
      'Tactile pushbutton and 10kΩ pull-down resistor wired across a Half Breadboard (5-hole terminal strips 12A–12E and 15A–15E) with a green status LED on GPIO 4.',
  },
  {
    id: 'wokwi-multi-sensor-iot',
    title: 'Wokwi ESP32 + DHT22 + SSD1306 OLED + Pushbutton + LED (diagram.json)',
    subtitle: 'Multi-Connection Wokwi → Fritzing .fzz Archive',
    direction: 'wokwi-to-fritzing',
    fileName: 'diagram.json',
    expectedOutcome: 'clean',
    description:
      'Complete Wokwi telemetry circuit featuring an ESP32 DevKit V1, DHT22 environment sensor, SSD1306 I2C OLED display, tactile pushbutton, and status LED with resistor.',
  },
  {
    id: 'esp32-v4-adc-pwm',
    title: 'ESP32-DevKitC V4 (38-Pin Custom .fzp) + Potentiometer ADC + PWM LED (.fzz)',
    subtitle: 'Week 5 Custom Part + 38-Pin Board ↔ Wokwi',
    direction: 'fritzing-to-wokwi',
    fileName: 'bai3a_adc1_filter_ledc.fzz',
    expectedOutcome: 'clean',
    description:
      'Authentic Fritzing 1.0 archive embedding custom part ESP32_DevKitc_V4_1.fzp (38-pin), 10kΩ rotary potentiometer (3234DFDC00PotentiometerModuleID) on GPIO 34, and 220Ω PWM LED on GPIO 18.',
  },
  {
    id: 'fritzing-unsupported-part',
    title: 'ESP32 + LED + Unmapped BMP280 Barometer (.fzz)',
    subtitle: 'Partial Conversion & Unsupported Part Diagnostics',
    direction: 'fritzing-to-wokwi',
    fileName: 'esp32_bmp280_unmapped.fzz',
    expectedOutcome: 'warnings-unsupported',
    description:
      'Demonstrates transparent handling when a circuit contains an unsupported Fritzing part (BMP280 Barometric Sensor): supported ESP32 + LED connections are preserved while BMP280 generates explicit unsupported diagnostics.',
  },
  {
    id: 'fritzing-ambiguous-pin',
    title: 'Ambiguous / Unresolved Connector ID Fixture (.fzz)',
    subtitle: 'Safety Gate Rejection Test',
    direction: 'fritzing-to-wokwi',
    fileName: 'esp32_unresolved_connector99.fzz',
    expectedOutcome: 'error-rejected',
    description:
      'Contains a connection to non-existent connector99 on ESP32. Demonstrates that WireMorph refuses to guess unknown electrical connections and blocks unsafe export.',
  },
];

/**
 * 1. Minimal ESP32 + LED + 220Ω Resistor Fritzing `.fz` XML
 * Topology:
 * - ESP32 (modelIndex 101) connector27 (D2) -> Wire1 (501) -> Resistor R1 (102) connector0 (1)
 * - Resistor R1 (102) connector1 (2) -> Wire2 (502) -> LED1 (103) connector1 (A)
 * - LED1 (103) connector0 (C) -> Wire3 (503) -> ESP32 (101) connector13 (GND.1)
 */
export function getEsp32LedBlinkFzXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="0.9.10">
  <views>
    <view name="breadboardView" backgroundColor="#f8fafc" gridSize="0.1in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>
  </views>
  <instances>
    <instance moduleIdRef="ESP32-DevKitC-30P-ModuleID" modelIndex="101" path="core/ESP32-DevKitC-30P.fzp">
      <title>ESP1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="80" y="90" rotation="0"/>
          <connectors>
            <connector connectorId="connector27" layer="breadboard">
              <connects>
                <connect connectorId="connector0" modelIndex="501" layer="breadboardWire"/>
              </connects>
            </connector>
            <connector connectorId="connector13" layer="breadboard">
              <connects>
                <connect connectorId="connector1" modelIndex="503" layer="breadboardWire"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="ResistorModuleID" modelIndex="102" path="core/resistor.fzp">
      <property name="resistance" value="220Ω"/>
      <property name="tolerance" value="±5%"/>
      <title>R1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="250" y="130" rotation="90"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboard">
              <connects>
                <connect connectorId="connector1" modelIndex="501" layer="breadboardWire"/>
              </connects>
            </connector>
            <connector connectorId="connector1" layer="breadboard">
              <connects>
                <connect connectorId="connector0" modelIndex="502" layer="breadboardWire"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="5mm-LED-Red-ModuleID" modelIndex="103" path="core/LED-generic-5mm.fzp">
      <property name="color" value="Red (633nm)"/>
      <title>LED1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="370" y="100" rotation="0"/>
          <connectors>
            <connector connectorId="connector1" layer="breadboard">
              <connects>
                <connect connectorId="connector1" modelIndex="502" layer="breadboardWire"/>
              </connects>
            </connector>
            <connector connectorId="connector0" layer="breadboard">
              <connects>
                <connect connectorId="connector0" modelIndex="503" layer="breadboardWire"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="501" path=":/resources/parts/core/wire.fzp">
      <title>Wire1</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="150" y="130" x1="0" y1="0" x2="100" y2="0" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#2563eb" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects>
                <connect connectorId="connector27" modelIndex="101" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects>
                <connect connectorId="connector0" modelIndex="102" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="502" path=":/resources/parts/core/wire.fzp">
      <title>Wire2</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="290" y="130" x1="0" y1="0" x2="80" y2="-20" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#dc2626" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects>
                <connect connectorId="connector1" modelIndex="102" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects>
                <connect connectorId="connector1" modelIndex="103" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="503" path=":/resources/parts/core/wire.fzp">
      <title>Wire3</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="370" y="140" x1="0" y1="0" x2="-250" y2="40" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#000000" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects>
                <connect connectorId="connector0" modelIndex="103" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects>
                <connect connectorId="connector13" modelIndex="101" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
  </instances>
</module>`;
}

/**
 * 2. Resistor + Pushbutton + LED on a Breadboard `.fz` XML
 * Tests breadboard 5-hole strip resolution (pin12A == pin12C == pin12E, and power rail tn)
 */
export function getResistorPushbuttonBreadboardFzXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="0.9.10">
  <instances>
    <instance moduleIdRef="Breadboard-RSR03MB102" modelIndex="10" path="core/breadboard.fzp">
      <title>BB1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="1.5" x="200" y="80" rotation="0"/>
          <connectors>
            <connector connectorId="pin12A" layer="breadboard">
              <connects>
                <connect connectorId="connector2" modelIndex="202" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="pin12C" layer="breadboard">
              <connects>
                <connect connectorId="connector0" modelIndex="203" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="pin12E" layer="breadboard">
              <connects>
                <connect connectorId="connector1" modelIndex="601" layer="breadboardWire"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="ESP32-DevKitC-30P-ModuleID" modelIndex="201" path="core/ESP32-DevKitC-30P.fzp">
      <title>ESP1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="60" y="90" rotation="0"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboard">
              <connects>
                <connect connectorId="connector0" modelIndex="202" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector11" layer="breadboard">
              <connects>
                <connect connectorId="connector0" modelIndex="601" layer="breadboardWire"/>
              </connects>
            </connector>
            <connector connectorId="connector26" layer="breadboard">
              <connects>
                <connect connectorId="connector1" modelIndex="204" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector13" layer="breadboard">
              <connects>
                <connect connectorId="connector1" modelIndex="203" layer="breadboard"/>
                <connect connectorId="connector0" modelIndex="204" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="Tactile-Pushbutton-ModuleID" modelIndex="202" path="core/pushbutton.fzp">
      <property name="color" value="blue"/>
      <title>BTN1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="240" y="140" rotation="0"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboard">
              <connects>
                <connect connectorId="connector0" modelIndex="201" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector2" layer="breadboard">
              <connects>
                <connect connectorId="pin12A" modelIndex="10" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="ResistorModuleID" modelIndex="203" path="core/resistor.fzp">
      <property name="resistance" value="10kΩ"/>
      <title>R_PULLDOWN</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="260" y="210" rotation="0"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboard">
              <connects>
                <connect connectorId="pin12C" modelIndex="10" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector1" layer="breadboard">
              <connects>
                <connect connectorId="connector13" modelIndex="201" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="5mm-LED-Red-ModuleID" modelIndex="204" path="core/LED-generic-5mm.fzp">
      <property name="color" value="Green (565nm)"/>
      <title>LED_STATUS</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="360" y="130" rotation="0"/>
          <connectors>
            <connector connectorId="connector1" layer="breadboard">
              <connects>
                <connect connectorId="connector26" modelIndex="201" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector0" layer="breadboard">
              <connects>
                <connect connectorId="connector13" modelIndex="201" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="601" path=":/resources/parts/core/wire.fzp">
      <title>Wire_Sense</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="120" y="160" x1="0" y1="0" x2="120" y2="0" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#eab308" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects>
                <connect connectorId="connector11" modelIndex="201" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects>
                <connect connectorId="pin12E" modelIndex="10" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
  </instances>
</module>`;
}

/**
 * 3. Multi-connection Wokwi `diagram.json` (ESP32 + DHT22 + SSD1306 OLED + Pushbutton + LED + Resistor)
 */
export function getWokwiMultiSensorDiagramJson(): string {
  return JSON.stringify(
    {
      version: 1,
      author: 'Embedded Systems Lab',
      editor: 'wokwi',
      parts: [
        {
          type: 'wokwi-esp32-devkit-v1',
          id: 'esp1',
          top: 40,
          left: 60,
          attrs: {},
        },
        {
          type: 'wokwi-dht22',
          id: 'dht1',
          top: 30,
          left: 260,
          attrs: { temperature: '24.5', humidity: '55' },
        },
        {
          type: 'board-ssd1306',
          id: 'oled1',
          top: 170,
          left: 260,
          attrs: { i2cAddress: '0x3c' },
        },
        {
          type: 'wokwi-pushbutton',
          id: 'btn1',
          top: 260,
          left: 260,
          attrs: { color: 'blue', bounce: '1' },
        },
        {
          type: 'wokwi-led',
          id: 'led1',
          top: 50,
          left: 410,
          attrs: { color: 'green' },
        },
        {
          type: 'wokwi-resistor',
          id: 'r1',
          top: 130,
          left: 410,
          rotate: 90,
          attrs: { value: '220' },
        },
      ],
      connections: [
        ['esp1:3V3', 'dht1:VCC', 'red', ['v-10', 'h120']],
        ['esp1:D15', 'dht1:SDA', 'gold', ['h110']],
        ['esp1:GND.1', 'dht1:GND', 'black', ['h110']],
        ['esp1:3V3', 'oled1:VCC', 'red', ['h90', 'v100']],
        ['esp1:GND.2', 'oled1:GND', 'black', ['h80', 'v110']],
        ['esp1:D22', 'oled1:SCL', 'blue', ['h100']],
        ['esp1:D21', 'oled1:SDA', 'green', ['h105']],
        ['esp1:D4', 'btn1:1.l', 'purple', ['h75', 'v90']],
        ['esp1:GND.2', 'btn1:2.r', 'black', ['h80', 'v140']],
        ['esp1:D2', 'r1:1', 'orange', ['h240']],
        ['r1:2', 'led1:A', 'orange', ['v-20']],
        ['led1:C', 'esp1:GND.1', 'black', ['v40', 'h-260']],
      ],
      dependencies: {},
    },
    null,
    2
  );
}

/**
 * 4. Circuit with an Unsupported Component (BMP280 Barometric Sensor + valid ESP32 & LED)
 */
export function getFritzingUnsupportedPartFzXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="0.9.10">
  <instances>
    <instance moduleIdRef="ESP32-DevKitC-30P-ModuleID" modelIndex="301" path="core/ESP32-DevKitC-30P.fzp">
      <title>ESP1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="70" y="90" rotation="0"/>
          <connectors>
            <connector connectorId="connector27" layer="breadboard">
              <connects>
                <connect connectorId="connector1" modelIndex="302" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector13" layer="breadboard">
              <connects>
                <connect connectorId="connector0" modelIndex="302" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector16" layer="breadboard">
              <connects>
                <connect connectorId="connector_scl" modelIndex="303" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="5mm-LED-Red-ModuleID" modelIndex="302" path="core/LED-generic-5mm.fzp">
      <property name="color" value="Yellow (590nm)"/>
      <title>LED_WARN</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="240" y="95" rotation="0"/>
          <connectors>
            <connector connectorId="connector1" layer="breadboard">
              <connects>
                <connect connectorId="connector27" modelIndex="301" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector0" layer="breadboard">
              <connects>
                <connect connectorId="connector13" modelIndex="301" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="Bosch-BMP280-Breakout-Unmapped-ModuleID" modelIndex="303" path="user/bmp280.fzp">
      <property name="interface" value="I2C"/>
      <title>BMP280_BARO</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="280" y="210" rotation="0"/>
          <connectors>
            <connector connectorId="connector_scl" layer="breadboard">
              <connects>
                <connect connectorId="connector16" modelIndex="301" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
  </instances>
</module>`;
}

/**
 * 5. Circuit with Ambiguous / Unresolved Connector ID on a Supported Part
 */
export function getFritzingAmbiguousPinFzXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="0.9.10">
  <instances>
    <instance moduleIdRef="ESP32-DevKitC-30P-ModuleID" modelIndex="401" path="core/ESP32-DevKitC-30P.fzp">
      <title>ESP1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="80" y="80" rotation="0"/>
          <connectors>
            <connector connectorId="connector99_ambiguous" layer="breadboard">
              <connects>
                <connect connectorId="connector1" modelIndex="402" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="5mm-LED-Red-ModuleID" modelIndex="402" path="core/LED-generic-5mm.fzp">
      <property name="color" value="Red (633nm)"/>
      <title>LED1</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="240" y="80" rotation="0"/>
          <connectors>
            <connector connectorId="connector1" layer="breadboard">
              <connects>
                <connect connectorId="connector99_ambiguous" modelIndex="401" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
  </instances>
</module>`;
}

/**
 * 6. Week 5 ESP32-DevKitC V4 (38-Pin Custom .fzp) + 10kΩ Potentiometer ADC + 220Ω PWM LED
 * Mirrors tnkh-kt2/week5/bai3a_adc1/bai3a_adc1_filter_ledc.fzz with embedded part.ESP32_DevKitc_V4_1.fzp
 */
export async function buildEsp32V4AdcPwmFzzArchive(): Promise<Uint8Array> {
  const fzXml = `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="1.0.7">
  <title>Bai 3a - ADC1 GPIO34 Filter + LEDC PWM GPIO18</title>
  <views>
    <view name="breadboardView" backgroundColor="#ffffff" gridSize="0.1in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>
  </views>
  <instances>
    <instance moduleIdRef="ESP32_DevKitc_V4_1" modelIndex="1001" path="ESP32_DevKitc_V4_1.fzp">
      <title>ESP32 DevKitC V4</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="110" y="20"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboard">
              <connects><connect connectorId="connector0" modelIndex="2001" layer="breadboardWire"/></connects>
            </connector>
            <connector connectorId="connector13" layer="breadboard">
              <connects><connect connectorId="connector1" modelIndex="2002" layer="breadboardWire"/></connects>
            </connector>
            <connector connectorId="connector4" layer="breadboard">
              <connects><connect connectorId="connector1" modelIndex="2003" layer="breadboardWire"/></connects>
            </connector>
            <connector connectorId="connector29" layer="breadboard">
              <connects><connect connectorId="connector0" modelIndex="2004" layer="breadboardWire"/></connects>
            </connector>
            <connector connectorId="connector31" layer="breadboard">
              <connects><connect connectorId="connector1" modelIndex="2006" layer="breadboardWire"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="3234DFDC00PotentiometerModuleID" modelIndex="1002" path="pot_big_4.fzp">
      <property name="Maximum Resistance" value="10kΩ"/>
      <property name="knob status" value="50%"/>
      <title>RV1 - 10k Potentiometer</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="300" y="130"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboard">
              <connects><connect connectorId="connector1" modelIndex="2001" layer="breadboardWire"/></connects>
            </connector>
            <connector connectorId="connector2" layer="breadboard">
              <connects><connect connectorId="connector0" modelIndex="2002" layer="breadboardWire"/></connects>
            </connector>
            <connector connectorId="connector1" layer="breadboard">
              <connects><connect connectorId="connector0" modelIndex="2003" layer="breadboardWire"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="ResistorModuleID" modelIndex="1003" path="resistor.fzp">
      <property name="Resistance" value="220"/>
      <property name="resistance" value="220"/>
      <property name="tolerance" value="±5%"/>
      <title>R1 - 220 Ω</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="240" y="45" rotation="90"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboard">
              <connects><connect connectorId="connector1" modelIndex="2004" layer="breadboardWire"/></connects>
            </connector>
            <connector connectorId="connector1" layer="breadboard">
              <connects><connect connectorId="connector0" modelIndex="2005" layer="breadboardWire"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="5mmColorLEDModuleID" modelIndex="1004" path="LED-generic-5mm.fzp">
      <property name="color" value="Red (633nm)"/>
      <title>D1 - Red LED</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="360" y="40"/>
          <connectors>
            <connector connectorId="connector1" layer="breadboard">
              <connects><connect connectorId="connector1" modelIndex="2005" layer="breadboardWire"/></connects>
            </connector>
            <connector connectorId="connector0" layer="breadboard">
              <connects><connect connectorId="connector0" modelIndex="2006" layer="breadboardWire"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="2001" path="wire.fzp">
      <title>W_3V3_POT</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="110" y="20" x1="0" y1="0" x2="190" y2="110" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#cc1414" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects><connect connectorId="connector0" modelIndex="1001" layer="breadboard"/></connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects><connect connectorId="connector0" modelIndex="1002" layer="breadboard"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="2002" path="wire.fzp">
      <title>W_POT_GND</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="300" y="130" x1="0" y1="0" x2="-190" y2="-40" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#343a40" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects><connect connectorId="connector2" modelIndex="1002" layer="breadboard"/></connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects><connect connectorId="connector13" modelIndex="1001" layer="breadboard"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="2003" path="wire.fzp">
      <title>W_POT_SIG_GPIO34</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="300" y="130" x1="0" y1="0" x2="-190" y2="-80" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#25cc35" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects><connect connectorId="connector1" modelIndex="1002" layer="breadboard"/></connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects><connect connectorId="connector4" modelIndex="1001" layer="breadboard"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="2004" path="wire.fzp">
      <title>W_GPIO18_R1</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="180" y="45" x1="0" y1="0" x2="60" y2="0" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#25cc35" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects><connect connectorId="connector29" modelIndex="1001" layer="breadboard"/></connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects><connect connectorId="connector0" modelIndex="1003" layer="breadboard"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="2005" path="wire.fzp">
      <title>W_R1_LED_A</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="280" y="45" x1="0" y1="0" x2="80" y2="0" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#25cc35" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects><connect connectorId="connector1" modelIndex="1003" layer="breadboard"/></connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects><connect connectorId="connector1" modelIndex="1004" layer="breadboard"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
    <instance moduleIdRef="WireModuleID" modelIndex="2006" path="wire.fzp">
      <title>W_LED_C_GND</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="360" y="65" x1="0" y1="0" x2="-180" y2="30" wireFlags="64"/>
          <wireExtras mils="22.2222" color="#343a40" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects><connect connectorId="connector0" modelIndex="1004" layer="breadboard"/></connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects><connect connectorId="connector31" modelIndex="1001" layer="breadboard"/></connects>
            </connector>
          </connectors>
        </breadboardView>
      </views>
    </instance>
  </instances>
</module>`;

  const customFzpXml = `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="0.9.10" referenceFile="ESP32_DevKitc_V4_1.fzp" moduleId="ESP32_DevKitc_V4_1">
  <version>1</version>
  <title>ESP32 DevKitc V4</title>
  <properties>
    <property name="family">ESP32 DevKitc V4</property>
  </properties>
  <connectors>
    <connector id="connector0" type="male" name="Pin 1"><description>3V3</description></connector>
    <connector id="connector4" type="male" name="Pin 5"><description>34</description></connector>
    <connector id="connector13" type="male" name="Pin 14"><description>GND</description></connector>
    <connector id="connector22" type="male" name="Pin 23"><description>15</description></connector>
    <connector id="connector23" type="male" name="Pin 24"><description>2</description></connector>
    <connector id="connector25" type="male" name="Pin 26"><description>4</description></connector>
    <connector id="connector29" type="male" name="Pin 30"><description>18</description></connector>
    <connector id="connector31" type="male" name="Pin 32"><description>GND</description></connector>
  </connectors>
</module>`;

  const zip = new JSZip();
  zip.file('bai3a_adc1_filter_ledc.fz', fzXml);
  zip.file('part.ESP32_DevKitc_V4_1.fzp', customFzpXml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Helper to package a `.fz` XML string into an authentic `.fzz` ZIP archive `Uint8Array`.
 */
export async function buildFzzArchiveFromXml(
  fzXml: string,
  sketchName = 'sketch.fz'
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(sketchName, fzXml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Builds the binary payload or JSON string for any of the built-in sample fixtures by ID.
 */
export async function loadSampleFixturePayload(fixtureId: string): Promise<{
  meta: SampleFixtureMeta;
  binaryBytes?: Uint8Array;
  jsonText?: string;
}> {
  const meta = SAMPLE_FIXTURES.find((f) => f.id === fixtureId) ?? SAMPLE_FIXTURES[0];

  switch (meta.id) {
    case 'esp32-led-blink': {
      const binaryBytes = await buildFzzArchiveFromXml(
        getEsp32LedBlinkFzXml(),
        'esp32_led_blink.fz'
      );
      return { meta, binaryBytes };
    }
    case 'resistor-pushbutton-io': {
      const binaryBytes = await buildFzzArchiveFromXml(
        getResistorPushbuttonBreadboardFzXml(),
        'esp32_pushbutton_breadboard.fz'
      );
      return { meta, binaryBytes };
    }
    case 'wokwi-multi-sensor-iot': {
      return { meta, jsonText: getWokwiMultiSensorDiagramJson() };
    }
    case 'esp32-v4-adc-pwm': {
      const binaryBytes = await buildEsp32V4AdcPwmFzzArchive();
      return { meta, binaryBytes };
    }
    case 'fritzing-unsupported-part': {
      const binaryBytes = await buildFzzArchiveFromXml(
        getFritzingUnsupportedPartFzXml(),
        'esp32_bmp280_unmapped.fz'
      );
      return { meta, binaryBytes };
    }
    case 'fritzing-ambiguous-pin': {
      const binaryBytes = await buildFzzArchiveFromXml(
        getFritzingAmbiguousPinFzXml(),
        'esp32_unresolved_connector99.fz'
      );
      return { meta, binaryBytes };
    }
    default: {
      const binaryBytes = await buildFzzArchiveFromXml(
        getEsp32LedBlinkFzXml(),
        'esp32_led_blink.fz'
      );
      return { meta, binaryBytes };
    }
  }
}
