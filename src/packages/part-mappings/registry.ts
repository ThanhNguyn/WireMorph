/**
 * WireMorph — Verified Component & Pin Mapping Registry
 *
 * Every entry defines verified Fritzing moduleIdRef patterns, Wokwi part types,
 * pin-to-connector mappings, pin equivalence rules, property transformations,
 * and verification fixture references.
 */

export interface PinMappingDefinition {
  /** Canonical pin identifier used in IR */
  canonicalId: string;
  /** Human-readable name shown in inspection tables */
  displayName: string;
  /** Primary Fritzing connectorId exported when generating .fzz */
  fritzingConnectorId: string;
  /** Additional accepted Fritzing connectorId aliases on import */
  fritzingConnectorAliases: string[];
  /** Primary Wokwi pin name exported when generating diagram.json */
  wokwiPinName: string;
  /** Additional accepted Wokwi pin aliases on import */
  wokwiPinAliases: string[];
  /** Optional internal electrical equivalence group (e.g., pushbutton 1.l and 1.r) */
  equivalenceGroup?: string;
}

export interface PropertyMappingRule {
  name: string;
  fritzingPropertyName: string;
  wokwiAttrName: string;
  description: string;
  toWokwi: (fritzingProps: Record<string, string>, moduleIdRef: string) => {
    value: string;
    status: 'preserved' | 'transformed' | 'approximated';
    note?: string;
  };
  toFritzing: (wokwiAttrs: Record<string, string>) => {
    value: string;
    status: 'preserved' | 'transformed' | 'approximated';
    note?: string;
  };
}

export interface ComponentMappingDefinition {
  /** Canonical component family ID */
  canonicalType: string;
  /** Human-readable component name */
  displayName: string;
  /** Category for registry filtering */
  category: 'Microcontroller' | 'Passive' | 'Output / Display' | 'Input / Switch' | 'Sensor' | 'Prototyping';
  /** Primary Fritzing moduleIdRef used when exporting to .fzz */
  primaryFritzingModuleId: string;
  /** Fritzing part file reference path inside .fz */
  fritzingModulePath: string;
  /** All known Fritzing moduleIdRef strings or substrings that match this component */
  fritzingModuleAliases: string[];
  /** Primary Wokwi part type used when exporting to diagram.json */
  wokwiPartType: string;
  /** Accepted Wokwi part type aliases */
  wokwiTypeAliases: string[];
  /** Default instance prefix (e.g., "esp", "led", "r", "btn") */
  instancePrefix: string;
  /** Supported conversion directions */
  supportedDirections: Array<'fritzing-to-wokwi' | 'wokwi-to-fritzing'>;
  /** Verification status */
  verificationStatus: 'verified-bidirectional' | 'verified-forward';
  /** Fixture ID that tests this mapping */
  verifiedByFixture: string;
  /** Documented limitations and differences between formats */
  knownLimitations: string[];
  /** Property transformation rules */
  propertyRules: PropertyMappingRule[];
  /** Complete pin mapping table */
  pins: PinMappingDefinition[];
}

/**
 * Helper to normalize resistance strings from Fritzing (e.g., "220Ω", "220", "4.7kΩ", "10k", "1MΩ")
 * into Wokwi numeric ohm strings (e.g., "220", "4700", "10000", "1000000")
 */
export function normalizeResistanceToOhms(raw: string | undefined): {
  ohmsString: string;
  approximated: boolean;
  note?: string;
} {
  if (!raw || raw.trim() === '') {
    return {
      ohmsString: '220',
      approximated: true,
      note: 'Missing resistance property in source; defaulted to 220 Ω.',
    };
  }
  const cleaned = raw
    .trim()
    .replace(/ohms?/gi, '')
    .replace(/Ω/g, '')
    .replace(/\s+/g, '');

  const match = /^(\d+(?:\.\d+)?)([kKmM]?)$/.exec(cleaned);
  if (!match) {
    return {
      ohmsString: '220',
      approximated: true,
      note: `Unrecognized resistance format "${raw}"; approximated to 220 Ω.`,
    };
  }
  const num = parseFloat(match[1]);
  const suffix = match[2].toLowerCase();
  let multiplier = 1;
  if (suffix === 'k') multiplier = 1_000;
  if (suffix === 'm') multiplier = 1_000_000;
  const totalOhms = Math.round(num * multiplier);
  return {
    ohmsString: String(totalOhms),
    approximated: false,
    note: raw !== String(totalOhms) ? `Normalized "${raw}" to "${totalOhms}" Ω.` : undefined,
  };
}

/**
 * Helper to map Fritzing LED color/wavelength into Wokwi LED color attribute
 */
export function normalizeLedColorToWokwi(
  fritzingProps: Record<string, string>,
  moduleIdRef: string
): { color: string; status: 'preserved' | 'transformed' | 'approximated'; note?: string } {
  const rawColor = (fritzingProps.color || fritzingProps.Color || moduleIdRef || '').toLowerCase();
  if (rawColor.includes('green') || rawColor.includes('555nm') || rawColor.includes('565nm')) {
    return { color: 'green', status: 'transformed', note: `Mapped LED color "${fritzingProps.color || moduleIdRef}" to "green".` };
  }
  if (rawColor.includes('blue') || rawColor.includes('470nm') || rawColor.includes('430nm')) {
    return { color: 'blue', status: 'transformed', note: `Mapped LED color "${fritzingProps.color || moduleIdRef}" to "blue".` };
  }
  if (rawColor.includes('yellow') || rawColor.includes('590nm') || rawColor.includes('585nm')) {
    return { color: 'yellow', status: 'transformed', note: `Mapped LED color "${fritzingProps.color || moduleIdRef}" to "yellow".` };
  }
  if (rawColor.includes('orange') || rawColor.includes('605nm')) {
    return { color: 'orange', status: 'transformed', note: `Mapped LED color "${fritzingProps.color || moduleIdRef}" to "orange".` };
  }
  if (rawColor.includes('white')) {
    return { color: 'white', status: 'transformed', note: `Mapped LED color "${fritzingProps.color || moduleIdRef}" to "white".` };
  }
  if (rawColor.includes('red') || rawColor.includes('633nm') || rawColor.includes('650nm')) {
    return { color: 'red', status: 'preserved' };
  }
  return {
    color: 'red',
    status: 'approximated',
    note: 'LED color was unspecified in Fritzing part; defaulted to "red".',
  };
}

export function normalizeWokwiLedColorToFritzing(color: string | undefined): string {
  switch ((color || 'red').toLowerCase()) {
    case 'green':
      return 'Green (565nm)';
    case 'blue':
      return 'Blue (470nm)';
    case 'yellow':
      return 'Yellow (590nm)';
    case 'orange':
      return 'Orange (605nm)';
    case 'white':
      return 'White (6500K)';
    default:
      return 'Red (633nm)';
  }
}

/**
 * ESP32 DevKit V1 30-pin standard mapping table
 */
const ESP32_DEVKIT_V1_PINS: PinMappingDefinition[] = [
  { canonicalId: '3V3', displayName: '3.3V Power (3V3)', fritzingConnectorId: 'connector0', fritzingConnectorAliases: ['3V3', '3.3V', 'pin1'], wokwiPinName: '3V3', wokwiPinAliases: ['3V3.1'] },
  { canonicalId: 'EN', displayName: 'Enable (EN)', fritzingConnectorId: 'connector1', fritzingConnectorAliases: ['EN', 'RST', 'pin2'], wokwiPinName: 'EN', wokwiPinAliases: [] },
  { canonicalId: 'VP', displayName: 'GPIO 36 / SVP (VP)', fritzingConnectorId: 'connector2', fritzingConnectorAliases: ['VP', 'GPIO36', 'D36', 'pin3'], wokwiPinName: 'VP', wokwiPinAliases: ['D36'] },
  { canonicalId: 'VN', displayName: 'GPIO 39 / SVN (VN)', fritzingConnectorId: 'connector3', fritzingConnectorAliases: ['VN', 'GPIO39', 'D39', 'pin4'], wokwiPinName: 'VN', wokwiPinAliases: ['D39'] },
  { canonicalId: 'D34', displayName: 'GPIO 34 (D34)', fritzingConnectorId: 'connector4', fritzingConnectorAliases: ['D34', 'GPIO34', 'IO34', 'pin5'], wokwiPinName: 'D34', wokwiPinAliases: ['34'] },
  { canonicalId: 'D35', displayName: 'GPIO 35 (D35)', fritzingConnectorId: 'connector5', fritzingConnectorAliases: ['D35', 'GPIO35', 'IO35', 'pin6'], wokwiPinName: 'D35', wokwiPinAliases: ['35'] },
  { canonicalId: 'D32', displayName: 'GPIO 32 (D32)', fritzingConnectorId: 'connector6', fritzingConnectorAliases: ['D32', 'GPIO32', 'IO32', 'pin7'], wokwiPinName: 'D32', wokwiPinAliases: ['32'] },
  { canonicalId: 'D33', displayName: 'GPIO 33 (D33)', fritzingConnectorId: 'connector7', fritzingConnectorAliases: ['D33', 'GPIO33', 'IO33', 'pin8'], wokwiPinName: 'D33', wokwiPinAliases: ['33'] },
  { canonicalId: 'D25', displayName: 'GPIO 25 (D25)', fritzingConnectorId: 'connector8', fritzingConnectorAliases: ['D25', 'GPIO25', 'IO25', 'pin9'], wokwiPinName: 'D25', wokwiPinAliases: ['25'] },
  { canonicalId: 'D26', displayName: 'GPIO 26 (D26)', fritzingConnectorId: 'connector9', fritzingConnectorAliases: ['D26', 'GPIO26', 'IO26', 'pin10'], wokwiPinName: 'D26', wokwiPinAliases: ['26'] },
  { canonicalId: 'D27', displayName: 'GPIO 27 (D27)', fritzingConnectorId: 'connector10', fritzingConnectorAliases: ['D27', 'GPIO27', 'IO27', 'pin11'], wokwiPinName: 'D27', wokwiPinAliases: ['27'] },
  { canonicalId: 'D14', displayName: 'GPIO 14 (D14)', fritzingConnectorId: 'connector11', fritzingConnectorAliases: ['D14', 'GPIO14', 'IO14', 'pin12'], wokwiPinName: 'D14', wokwiPinAliases: ['14'] },
  { canonicalId: 'D12', displayName: 'GPIO 12 (D12)', fritzingConnectorId: 'connector12', fritzingConnectorAliases: ['D12', 'GPIO12', 'IO12', 'pin13'], wokwiPinName: 'D12', wokwiPinAliases: ['12'] },
  { canonicalId: 'GND.1', displayName: 'Ground (GND.1)', fritzingConnectorId: 'connector13', fritzingConnectorAliases: ['GND', 'GND1', 'GND.1', 'pin14'], wokwiPinName: 'GND.1', wokwiPinAliases: ['GND'], equivalenceGroup: 'ESP32_GND' },
  { canonicalId: 'D13', displayName: 'GPIO 13 (D13)', fritzingConnectorId: 'connector14', fritzingConnectorAliases: ['D13', 'GPIO13', 'IO13', 'pin15'], wokwiPinName: 'D13', wokwiPinAliases: ['13'] },
  { canonicalId: 'D23', displayName: 'GPIO 23 / MOSI (D23)', fritzingConnectorId: 'connector15', fritzingConnectorAliases: ['D23', 'GPIO23', 'IO23', 'pin16'], wokwiPinName: 'D23', wokwiPinAliases: ['23'] },
  { canonicalId: 'D22', displayName: 'GPIO 22 / SCL (D22)', fritzingConnectorId: 'connector16', fritzingConnectorAliases: ['D22', 'GPIO22', 'IO22', 'SCL', 'pin17'], wokwiPinName: 'D22', wokwiPinAliases: ['22'] },
  { canonicalId: 'TX0', displayName: 'GPIO 1 / UART0 TX (TX0)', fritzingConnectorId: 'connector17', fritzingConnectorAliases: ['TX0', 'TX', 'GPIO1', 'D1', 'pin18'], wokwiPinName: 'TX0', wokwiPinAliases: ['TX', 'D1'] },
  { canonicalId: 'RX0', displayName: 'GPIO 3 / UART0 RX (RX0)', fritzingConnectorId: 'connector18', fritzingConnectorAliases: ['RX0', 'RX', 'GPIO3', 'D3', 'pin19'], wokwiPinName: 'RX0', wokwiPinAliases: ['RX', 'D3'] },
  { canonicalId: 'D21', displayName: 'GPIO 21 / SDA (D21)', fritzingConnectorId: 'connector19', fritzingConnectorAliases: ['D21', 'GPIO21', 'IO21', 'SDA', 'pin20'], wokwiPinName: 'D21', wokwiPinAliases: ['21'] },
  { canonicalId: 'GND.2', displayName: 'Ground (GND.2)', fritzingConnectorId: 'connector20', fritzingConnectorAliases: ['GND2', 'GND.2', 'pin21'], wokwiPinName: 'GND.2', wokwiPinAliases: ['GND.3'], equivalenceGroup: 'ESP32_GND' },
  { canonicalId: 'D19', displayName: 'GPIO 19 / MISO (D19)', fritzingConnectorId: 'connector21', fritzingConnectorAliases: ['D19', 'GPIO19', 'IO19', 'pin22'], wokwiPinName: 'D19', wokwiPinAliases: ['19'] },
  { canonicalId: 'D18', displayName: 'GPIO 18 / SCK (D18)', fritzingConnectorId: 'connector22', fritzingConnectorAliases: ['D18', 'GPIO18', 'IO18', 'pin23'], wokwiPinName: 'D18', wokwiPinAliases: ['18'] },
  { canonicalId: 'D5', displayName: 'GPIO 5 / CS (D5)', fritzingConnectorId: 'connector23', fritzingConnectorAliases: ['D5', 'GPIO5', 'IO5', 'pin24'], wokwiPinName: 'D5', wokwiPinAliases: ['5'] },
  { canonicalId: 'TX2', displayName: 'GPIO 17 / UART2 TX (TX2)', fritzingConnectorId: 'connector24', fritzingConnectorAliases: ['TX2', 'GPIO17', 'D17', 'IO17', 'pin25'], wokwiPinName: 'TX2', wokwiPinAliases: ['D17', '17'] },
  { canonicalId: 'RX2', displayName: 'GPIO 16 / UART2 RX (RX2)', fritzingConnectorId: 'connector25', fritzingConnectorAliases: ['RX2', 'GPIO16', 'D16', 'IO16', 'pin26'], wokwiPinName: 'RX2', wokwiPinAliases: ['D16', '16'] },
  { canonicalId: 'D4', displayName: 'GPIO 4 (D4)', fritzingConnectorId: 'connector26', fritzingConnectorAliases: ['D4', 'GPIO4', 'IO4', 'pin27'], wokwiPinName: 'D4', wokwiPinAliases: ['4'] },
  { canonicalId: 'D2', displayName: 'GPIO 2 (D2)', fritzingConnectorId: 'connector27', fritzingConnectorAliases: ['D2', 'GPIO2', 'IO2', 'pin28'], wokwiPinName: 'D2', wokwiPinAliases: ['2'] },
  { canonicalId: 'D15', displayName: 'GPIO 15 (D15)', fritzingConnectorId: 'connector28', fritzingConnectorAliases: ['D15', 'GPIO15', 'IO15', 'pin29'], wokwiPinName: 'D15', wokwiPinAliases: ['15'] },
  { canonicalId: 'VIN', displayName: '5V Input (VIN)', fritzingConnectorId: 'connector29', fritzingConnectorAliases: ['VIN', '5V', 'VCC', 'pin30'], wokwiPinName: 'VIN', wokwiPinAliases: ['5V'] },
];

/**
 * ESP32 DevKitC V4 38-pin custom part mapping table (ESP32_DevKitc_V4_1.fzp ↔ board-esp32-devkit-c-v4)
 */
const ESP32_DEVKIT_C_V4_PINS: PinMappingDefinition[] = [
  { canonicalId: '3V3', displayName: '3.3V Power (Pin 1 / 3V3)', fritzingConnectorId: 'connector0', fritzingConnectorAliases: ['3V3', '3.3V', 'Pin 1'], wokwiPinName: '3V3', wokwiPinAliases: ['3V3.1'] },
  { canonicalId: 'EN', displayName: 'Enable (Pin 2 / EN)', fritzingConnectorId: 'connector1', fritzingConnectorAliases: ['EN', 'RST', 'Pin 2'], wokwiPinName: 'EN', wokwiPinAliases: [] },
  { canonicalId: 'VP', displayName: 'GPIO 36 / SVP (Pin 3 / VP)', fritzingConnectorId: 'connector2', fritzingConnectorAliases: ['VP', '36', 'D36', 'GPIO36', 'Pin 3'], wokwiPinName: 'VP', wokwiPinAliases: ['36', 'D36'] },
  { canonicalId: 'VN', displayName: 'GPIO 39 / SVN (Pin 4 / VN)', fritzingConnectorId: 'connector3', fritzingConnectorAliases: ['VN', '39', 'D39', 'GPIO39', 'Pin 4'], wokwiPinName: 'VN', wokwiPinAliases: ['39', 'D39'] },
  { canonicalId: '34', displayName: 'GPIO 34 / ADC1_CH6 (Pin 5 / 34)', fritzingConnectorId: 'connector4', fritzingConnectorAliases: ['34', 'D34', 'GPIO34', 'Pin 5'], wokwiPinName: '34', wokwiPinAliases: ['D34'] },
  { canonicalId: '35', displayName: 'GPIO 35 / ADC1_CH7 (Pin 6 / 35)', fritzingConnectorId: 'connector5', fritzingConnectorAliases: ['35', 'D35', 'GPIO35', 'Pin 6'], wokwiPinName: '35', wokwiPinAliases: ['D35'] },
  { canonicalId: '32', displayName: 'GPIO 32 / ADC1_CH4 (Pin 7 / 32)', fritzingConnectorId: 'connector6', fritzingConnectorAliases: ['32', 'D32', 'GPIO32', 'Pin 7'], wokwiPinName: '32', wokwiPinAliases: ['D32'] },
  { canonicalId: '33', displayName: 'GPIO 33 / ADC1_CH5 (Pin 8 / 33)', fritzingConnectorId: 'connector7', fritzingConnectorAliases: ['33', 'D33', 'GPIO33', 'Pin 8'], wokwiPinName: '33', wokwiPinAliases: ['D33'] },
  { canonicalId: '25', displayName: 'GPIO 25 / DAC1 (Pin 9 / 25)', fritzingConnectorId: 'connector8', fritzingConnectorAliases: ['25', 'D25', 'GPIO25', 'Pin 9'], wokwiPinName: '25', wokwiPinAliases: ['D25'] },
  { canonicalId: '26', displayName: 'GPIO 26 / DAC2 (Pin 10 / 26)', fritzingConnectorId: 'connector9', fritzingConnectorAliases: ['26', 'D26', 'GPIO26', 'Pin 10'], wokwiPinName: '26', wokwiPinAliases: ['D26'] },
  { canonicalId: '27', displayName: 'GPIO 27 (Pin 11 / 27)', fritzingConnectorId: 'connector10', fritzingConnectorAliases: ['27', 'D27', 'GPIO27', 'Pin 11'], wokwiPinName: '27', wokwiPinAliases: ['D27'] },
  { canonicalId: '14', displayName: 'GPIO 14 (Pin 12 / 14)', fritzingConnectorId: 'connector11', fritzingConnectorAliases: ['14', 'D14', 'GPIO14', 'Pin 12'], wokwiPinName: '14', wokwiPinAliases: ['D14'] },
  { canonicalId: '12', displayName: 'GPIO 12 (Pin 13 / 12)', fritzingConnectorId: 'connector12', fritzingConnectorAliases: ['12', 'D12', 'GPIO12', 'Pin 13'], wokwiPinName: '12', wokwiPinAliases: ['D12'] },
  { canonicalId: 'GND.1', displayName: 'Ground Left (Pin 14 / GND.1)', fritzingConnectorId: 'connector13', fritzingConnectorAliases: ['GND', 'GND.1', 'GND1', 'Pin 14'], wokwiPinName: 'GND.1', wokwiPinAliases: ['GND'], equivalenceGroup: 'ESP32_V4_GND' },
  { canonicalId: '13', displayName: 'GPIO 13 (Pin 15 / 13)', fritzingConnectorId: 'connector14', fritzingConnectorAliases: ['13', 'D13', 'GPIO13', 'Pin 15'], wokwiPinName: '13', wokwiPinAliases: ['D13'] },
  { canonicalId: 'SD2', displayName: 'GPIO 9 / SD2 (Pin 16 / D2)', fritzingConnectorId: 'connector15', fritzingConnectorAliases: ['SD2', '9', 'GPIO9', 'Pin 16'], wokwiPinName: 'D2', wokwiPinAliases: ['SD2', '9'] },
  { canonicalId: 'SD3', displayName: 'GPIO 10 / SD3 (Pin 17 / D3)', fritzingConnectorId: 'connector16', fritzingConnectorAliases: ['SD3', '10', 'GPIO10', 'Pin 17'], wokwiPinName: 'D3', wokwiPinAliases: ['SD3', '10'] },
  { canonicalId: 'CMD', displayName: 'GPIO 11 / CMD (Pin 18 / CMD)', fritzingConnectorId: 'connector17', fritzingConnectorAliases: ['CMD', '11', 'GPIO11', 'Pin 18'], wokwiPinName: 'CMD', wokwiPinAliases: ['11'] },
  { canonicalId: '5V', displayName: '5V Power Input (Pin 19 / 5V)', fritzingConnectorId: 'connector18', fritzingConnectorAliases: ['5V', 'VIN', 'VCC', 'Pin 19'], wokwiPinName: '5V', wokwiPinAliases: ['VIN'] },
  { canonicalId: 'CLK', displayName: 'GPIO 6 / CLK (Pin 20 / CLK)', fritzingConnectorId: 'connector19', fritzingConnectorAliases: ['CLK', '6', 'GPIO6', 'Pin 20'], wokwiPinName: 'CLK', wokwiPinAliases: ['6'] },
  { canonicalId: 'SD0', displayName: 'GPIO 7 / SD0 (Pin 21 / D0)', fritzingConnectorId: 'connector20', fritzingConnectorAliases: ['SD0', '7', 'GPIO7', 'Pin 21'], wokwiPinName: 'D0', wokwiPinAliases: ['SD0', '7'] },
  { canonicalId: 'SD1', displayName: 'GPIO 8 / SD1 (Pin 22 / D1)', fritzingConnectorId: 'connector21', fritzingConnectorAliases: ['SD1', '8', 'GPIO8', 'Pin 22'], wokwiPinName: 'D1', wokwiPinAliases: ['SD1', '8'] },
  { canonicalId: '15', displayName: 'GPIO 15 / ADC2_CH3 (Pin 23 / 15)', fritzingConnectorId: 'connector22', fritzingConnectorAliases: ['15', 'D15', 'GPIO15', 'Pin 23'], wokwiPinName: '15', wokwiPinAliases: ['D15'] },
  { canonicalId: '2', displayName: 'GPIO 2 (Pin 24 / 2)', fritzingConnectorId: 'connector23', fritzingConnectorAliases: ['2', 'D2', 'GPIO2', 'Pin 24'], wokwiPinName: '2', wokwiPinAliases: ['D2'] },
  { canonicalId: '0', displayName: 'GPIO 0 / BOOT (Pin 25 / 0)', fritzingConnectorId: 'connector24', fritzingConnectorAliases: ['0', 'D0', 'GPIO0', 'Pin 25'], wokwiPinName: '0', wokwiPinAliases: ['D0'] },
  { canonicalId: '4', displayName: 'GPIO 4 (Pin 26 / 4)', fritzingConnectorId: 'connector25', fritzingConnectorAliases: ['4', 'D4', 'GPIO4', 'Pin 26'], wokwiPinName: '4', wokwiPinAliases: ['D4'] },
  { canonicalId: '16', displayName: 'GPIO 16 / RX2 (Pin 27 / 16)', fritzingConnectorId: 'connector26', fritzingConnectorAliases: ['16', 'D16', 'RX2', 'GPIO16', 'Pin 27'], wokwiPinName: '16', wokwiPinAliases: ['D16', 'RX2'] },
  { canonicalId: '17', displayName: 'GPIO 17 / TX2 (Pin 28 / 17)', fritzingConnectorId: 'connector27', fritzingConnectorAliases: ['17', 'D17', 'TX2', 'GPIO17', 'Pin 28'], wokwiPinName: '17', wokwiPinAliases: ['D17', 'TX2'] },
  { canonicalId: '5', displayName: 'GPIO 5 (Pin 29 / 5)', fritzingConnectorId: 'connector28', fritzingConnectorAliases: ['5', 'D5', 'GPIO5', 'Pin 29'], wokwiPinName: '5', wokwiPinAliases: ['D5'] },
  { canonicalId: '18', displayName: 'GPIO 18 / SCK (Pin 30 / 18)', fritzingConnectorId: 'connector29', fritzingConnectorAliases: ['18', 'D18', 'GPIO18', 'Pin 30'], wokwiPinName: '18', wokwiPinAliases: ['D18'] },
  { canonicalId: '19', displayName: 'GPIO 19 / MISO (Pin 31 / 19)', fritzingConnectorId: 'connector30', fritzingConnectorAliases: ['19', 'D19', 'GPIO19', 'Pin 31'], wokwiPinName: '19', wokwiPinAliases: ['D19'] },
  { canonicalId: 'GND.2', displayName: 'Ground Right-Mid (Pin 32 / GND.2)', fritzingConnectorId: 'connector31', fritzingConnectorAliases: ['GND.2', 'GND2', 'Pin 32'], wokwiPinName: 'GND.2', wokwiPinAliases: [], equivalenceGroup: 'ESP32_V4_GND' },
  { canonicalId: '21', displayName: 'GPIO 21 / SDA (Pin 33 / 21)', fritzingConnectorId: 'connector32', fritzingConnectorAliases: ['21', 'D21', 'SDA', 'GPIO21', 'Pin 33'], wokwiPinName: '21', wokwiPinAliases: ['D21'] },
  { canonicalId: 'RX', displayName: 'GPIO 3 / UART0 RX (Pin 34 / RX)', fritzingConnectorId: 'connector33', fritzingConnectorAliases: ['RX', 'RX0', '3', 'GPIO3', 'Pin 34'], wokwiPinName: 'RX', wokwiPinAliases: ['RX0'] },
  { canonicalId: 'TX', displayName: 'GPIO 1 / UART0 TX (Pin 35 / TX)', fritzingConnectorId: 'connector34', fritzingConnectorAliases: ['TX', 'TX0', '1', 'GPIO1', 'Pin 35'], wokwiPinName: 'TX', wokwiPinAliases: ['TX0'] },
  { canonicalId: '22', displayName: 'GPIO 22 / SCL (Pin 36 / 22)', fritzingConnectorId: 'connector35', fritzingConnectorAliases: ['22', 'D22', 'SCL', 'GPIO22', 'Pin 36'], wokwiPinName: '22', wokwiPinAliases: ['D22'] },
  { canonicalId: '23', displayName: 'GPIO 23 / MOSI (Pin 37 / 23)', fritzingConnectorId: 'connector36', fritzingConnectorAliases: ['23', 'D23', 'GPIO23', 'Pin 37'], wokwiPinName: '23', wokwiPinAliases: ['D23'] },
  { canonicalId: 'GND.3', displayName: 'Ground Top-Right (Pin 38 / GND.3)', fritzingConnectorId: 'connector37', fritzingConnectorAliases: ['GND.3', 'GND3', 'Pin 38'], wokwiPinName: 'GND.3', wokwiPinAliases: [], equivalenceGroup: 'ESP32_V4_GND' },
];

export const PART_MAPPING_REGISTRY: ComponentMappingDefinition[] = [
  {
    canonicalType: 'esp32-devkit-v1',
    displayName: 'ESP32 DevKit V1 (30-Pin)',
    category: 'Microcontroller',
    primaryFritzingModuleId: 'ESP32-DevKitC-30P-ModuleID',
    fritzingModulePath: 'core/ESP32-DevKitC-30P.fzp',
    fritzingModuleAliases: [
      'ESP32-DevKitC-30P-ModuleID',
      'ESP32-DevKitv1',
      'DOIT Esp32 DevKit v1',
      'ESP32_DevKit_V1',
      'HiLetgo ESP32',
      'ESP32-WROOM-32D',
      'esp32-devkit-v1',
    ],
    wokwiPartType: 'wokwi-esp32-devkit-v1',
    wokwiTypeAliases: ['wokwi-esp32-devkit-v1', 'board-esp32-devkit-v1'],
    instancePrefix: 'esp',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'esp32-led-blink',
    knownLimitations: [
      'Maps standard 30-pin DOIT ESP32 DevKit V1 pinout (connector0..connector29).',
      'GND.1 and GND.2 share a common ground plane and belong to equivalence group ESP32_GND.',
    ],
    propertyRules: [],
    pins: ESP32_DEVKIT_V1_PINS,
  },
  {
    canonicalType: 'esp32-devkit-c-v4',
    displayName: 'ESP32 DevKitC V4 (38-Pin)',
    category: 'Microcontroller',
    primaryFritzingModuleId: 'ESP32_DevKitc_V4_1',
    fritzingModulePath: 'ESP32_DevKitc_V4_1.fzp',
    fritzingModuleAliases: [
      'ESP32_DevKitc_V4_1',
      'ESP32_DevKitc_V4',
      'ESP32 DevKitc V4',
      'ESP32 DevKitC V4',
      'ESP32-DevKitC-V4',
      'ESP32-DevKitC-38P',
    ],
    wokwiPartType: 'board-esp32-devkit-c-v4',
    wokwiTypeAliases: ['board-esp32-devkit-c-v4'],
    instancePrefix: 'esp',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'esp32-v4-adc-pwm',
    knownLimitations: [
      'Maps the 38-pin Espressif ESP32-DevKitC V4 custom Fritzing part (ESP32_DevKitc_V4_1.fzp, connector0..connector37) ↔ Wokwi board-esp32-devkit-c-v4.',
      'GND.1 (connector13), GND.2 (connector31), and GND.3 (connector37) share the common ESP32_V4_GND plane.',
      'SPI flash pins (D0..D3, CLK, CMD on Pins 16..22) should not be used for general GPIO.',
    ],
    propertyRules: [],
    pins: ESP32_DEVKIT_C_V4_PINS,
  },
  {
    canonicalType: 'led-5mm',
    displayName: '5mm Standard LED',
    category: 'Output / Display',
    primaryFritzingModuleId: '5mm-LED-Red-ModuleID',
    fritzingModulePath: 'core/LED-generic-5mm.fzp',
    fritzingModuleAliases: [
      '5mm-LED-Red-ModuleID',
      '5mmColorLEDModuleID',
      'ColorLEDModuleID',
      'Red (633nm) LED',
      'Green (565nm) LED',
      'Blue (470nm) LED',
      'Yellow (590nm) LED',
      'LED-generic-5mm',
      '5mm LED',
    ],
    wokwiPartType: 'wokwi-led',
    wokwiTypeAliases: ['wokwi-led'],
    instancePrefix: 'led',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'esp32-led-blink',
    knownLimitations: [
      'Fritzing models wavelength (e.g., "Red (633nm)") while Wokwi uses discrete color names ("red", "green", "blue", "yellow", "orange", "white").',
      'Wokwi simulation-specific attributes (gamma, fps, lightColor) are omitted when exporting back to Fritzing.',
    ],
    propertyRules: [
      {
        name: 'LED Color',
        fritzingPropertyName: 'color',
        wokwiAttrName: 'color',
        description: 'Transforms Fritzing LED wavelength/color string ↔ Wokwi color attribute.',
        toWokwi: (props, moduleIdRef) => {
          const res = normalizeLedColorToWokwi(props, moduleIdRef);
          return { value: res.color, status: res.status, note: res.note };
        },
        toFritzing: (attrs) => {
          const val = normalizeWokwiLedColorToFritzing(attrs.color);
          return {
            value: val,
            status: attrs.color ? 'transformed' : 'approximated',
            note: `Mapped Wokwi color "${attrs.color || 'red'}" to Fritzing wavelength "${val}".`,
          };
        },
      },
    ],
    pins: [
      {
        canonicalId: 'C',
        displayName: 'Cathode (-)',
        fritzingConnectorId: 'connector0',
        fritzingConnectorAliases: ['cathode', 'pin0', 'C'],
        wokwiPinName: 'C',
        wokwiPinAliases: ['cathode'],
      },
      {
        canonicalId: 'A',
        displayName: 'Anode (+)',
        fritzingConnectorId: 'connector1',
        fritzingConnectorAliases: ['anode', 'pin1', 'A'],
        wokwiPinName: 'A',
        wokwiPinAliases: ['anode'],
      },
    ],
  },
  {
    canonicalType: 'resistor-axial',
    displayName: 'Axial Through-Hole Resistor',
    category: 'Passive',
    primaryFritzingModuleId: 'ResistorModuleID',
    fritzingModulePath: 'core/resistor.fzp',
    fritzingModuleAliases: [
      'ResistorModuleID',
      '220 Ohm Resistor',
      '10k Ohm Resistor',
      '4.7k Ohm Resistor',
      'Generic Resistor',
      'resistor_220',
      'resistor',
    ],
    wokwiPartType: 'wokwi-resistor',
    wokwiTypeAliases: ['wokwi-resistor'],
    instancePrefix: 'r',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'esp32-led-blink',
    knownLimitations: [
      'Fritzing tolerance and power rating properties (e.g., ±5%, 0.25W) have no Wokwi equivalent and are omitted with an informational note.',
      'Resistor terminals are non-polarized (Terminal 1 and Terminal 2 are electrically symmetric).',
    ],
    propertyRules: [
      {
        name: 'Resistance (Ω)',
        fritzingPropertyName: 'resistance',
        wokwiAttrName: 'value',
        description: 'Normalizes Fritzing resistance value (e.g., "220Ω", "10kΩ") ↔ Wokwi numeric ohm string.',
        toWokwi: (props) => {
          const raw = props.resistance || props.Resistance || props.value;
          const norm = normalizeResistanceToOhms(raw);
          return {
            value: norm.ohmsString,
            status: norm.approximated ? 'approximated' : raw === norm.ohmsString ? 'preserved' : 'transformed',
            note: norm.note,
          };
        },
        toFritzing: (attrs) => {
          const norm = normalizeResistanceToOhms(attrs.value);
          return {
            value: `${norm.ohmsString}Ω`,
            status: norm.approximated ? 'approximated' : 'transformed',
            note: norm.note || `Formatted Wokwi value "${attrs.value}" as "${norm.ohmsString}Ω".`,
          };
        },
      },
    ],
    pins: [
      {
        canonicalId: '1',
        displayName: 'Pin 0 / Terminal 1',
        fritzingConnectorId: 'connector0',
        fritzingConnectorAliases: ['pin0', 'leg0', '1'],
        wokwiPinName: '1',
        wokwiPinAliases: ['p1'],
      },
      {
        canonicalId: '2',
        displayName: 'Pin 1 / Terminal 2',
        fritzingConnectorId: 'connector1',
        fritzingConnectorAliases: ['pin1', 'leg1', '2'],
        wokwiPinName: '2',
        wokwiPinAliases: ['p2'],
      },
    ],
  },
  {
    canonicalType: 'pushbutton-tactile',
    displayName: '4-Pin Tactile Pushbutton Switch',
    category: 'Input / Switch',
    primaryFritzingModuleId: 'Tactile-Pushbutton-ModuleID',
    fritzingModulePath: 'core/pushbutton.fzp',
    fritzingModuleAliases: [
      'Tactile-Pushbutton-ModuleID',
      '20A9BBEE34_ST',
      'pushbutton_4_horizontal',
      'pushbutton_4_horizontal.fzp',
      'Pushbutton',
      'Tactile Pushbutton',
      '4-leg Tactile Switch',
      'Omron B3F Pushbutton',
    ],
    wokwiPartType: 'wokwi-pushbutton',
    wokwiTypeAliases: ['wokwi-pushbutton', 'wokwi-pushbutton-6mm'],
    instancePrefix: 'btn',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'resistor-pushbutton-io',
    knownLimitations: [
      'Pins 1.l and 1.r are internally bridged (Pole 1); Pins 2.l and 2.r are internally bridged (Pole 2).',
      'Wokwi key-binding and bounce attributes are simulation-only and omitted during Fritzing export.',
    ],
    propertyRules: [
      {
        name: 'Cap Color',
        fritzingPropertyName: 'color',
        wokwiAttrName: 'color',
        description: 'Preserves pushbutton cap color when specified.',
        toWokwi: (props) => ({
          value: (props.color || 'green').toLowerCase(),
          status: props.color ? 'preserved' : 'transformed',
          note: props.color ? undefined : 'Defaulted button cap color to "green".',
        }),
        toFritzing: (attrs) => ({
          value: attrs.color || 'green',
          status: attrs.color ? 'preserved' : 'transformed',
        }),
      },
    ],
    pins: [
      {
        canonicalId: '1.l',
        displayName: 'Pole 1 Left (Pin 1 / 1.l)',
        fritzingConnectorId: 'connector0',
        fritzingConnectorAliases: ['pin1', 'leg0', '1.l'],
        wokwiPinName: '1.l',
        wokwiPinAliases: ['1'],
        equivalenceGroup: 'BTN_POLE_1',
      },
      {
        canonicalId: '1.r',
        displayName: 'Pole 1 Right (Pin 2 / 1.r)',
        fritzingConnectorId: 'connector1',
        fritzingConnectorAliases: ['pin2', 'leg1', '1.r'],
        wokwiPinName: '1.r',
        wokwiPinAliases: [],
        equivalenceGroup: 'BTN_POLE_1',
      },
      {
        canonicalId: '2.l',
        displayName: 'Pole 2 Left (Pin 3 / 2.l)',
        fritzingConnectorId: 'connector2',
        fritzingConnectorAliases: ['pin3', 'leg2', '2.l'],
        wokwiPinName: '2.l',
        wokwiPinAliases: ['2'],
        equivalenceGroup: 'BTN_POLE_2',
      },
      {
        canonicalId: '2.r',
        displayName: 'Pole 2 Right (Pin 4 / 2.r)',
        fritzingConnectorId: 'connector3',
        fritzingConnectorAliases: ['pin4', 'leg3', '2.r'],
        wokwiPinName: '2.r',
        wokwiPinAliases: [],
        equivalenceGroup: 'BTN_POLE_2',
      },
    ],
  },
  {
    canonicalType: 'dht22-sensor',
    displayName: 'DHT22 Temperature & Humidity Sensor',
    category: 'Sensor',
    primaryFritzingModuleId: 'DHT22-Humidity-Temperature-ModuleID',
    fritzingModulePath: 'core/DHT22.fzp',
    fritzingModuleAliases: [
      'DHT22-Humidity-Temperature-ModuleID',
      'DHT22 Humidity and Temperature Sensor',
      'RHT03 / DHT22',
      'AM2302',
    ],
    wokwiPartType: 'wokwi-dht22',
    wokwiTypeAliases: ['wokwi-dht22'],
    instancePrefix: 'dht',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'wokwi-multi-sensor-iot',
    knownLimitations: [
      'Pin 3 (NC / Not Connected) is present on the 4-pin package but carries no electrical signal.',
      'Wokwi initial temperature and humidity slider attributes are omitted in Fritzing export.',
    ],
    propertyRules: [],
    pins: [
      {
        canonicalId: 'VCC',
        displayName: 'Power Supply (VCC / Pin 1)',
        fritzingConnectorId: 'connector0',
        fritzingConnectorAliases: ['VCC', 'VDD', 'pin1'],
        wokwiPinName: 'VCC',
        wokwiPinAliases: ['VDD'],
      },
      {
        canonicalId: 'SDA',
        displayName: 'Data Signal (SDA / DATA / Pin 2)',
        fritzingConnectorId: 'connector1',
        fritzingConnectorAliases: ['SDA', 'DATA', 'OUT', 'pin2'],
        wokwiPinName: 'SDA',
        wokwiPinAliases: ['DATA'],
      },
      {
        canonicalId: 'NC',
        displayName: 'Not Connected (NC / Pin 3)',
        fritzingConnectorId: 'connector2',
        fritzingConnectorAliases: ['NC', 'pin3'],
        wokwiPinName: 'NC',
        wokwiPinAliases: [],
      },
      {
        canonicalId: 'GND',
        displayName: 'Ground (GND / Pin 4)',
        fritzingConnectorId: 'connector3',
        fritzingConnectorAliases: ['GND', 'pin4'],
        wokwiPinName: 'GND',
        wokwiPinAliases: [],
      },
    ],
  },
  {
    canonicalType: 'hc-sr04-ultrasonic',
    displayName: 'HC-SR04 Ultrasonic Distance Sensor',
    category: 'Sensor',
    primaryFritzingModuleId: 'HC-SR04-Ultrasonic-ModuleID',
    fritzingModulePath: 'core/hc-sr04.fzp',
    fritzingModuleAliases: [
      'HC-SR04-Ultrasonic-ModuleID',
      'HC-SR04 Ultrasonic Rangefinder',
      'HC-SR04',
    ],
    wokwiPartType: 'wokwi-hc-sr04',
    wokwiTypeAliases: ['wokwi-hc-sr04'],
    instancePrefix: 'ultrasonic',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'wokwi-multi-sensor-iot',
    knownLimitations: [
      'Physical 5V ECHO voltage divider requirements on 3.3V ESP32 inputs should still be verified by the engineer.',
    ],
    propertyRules: [],
    pins: [
      {
        canonicalId: 'VCC',
        displayName: '5V Supply (VCC)',
        fritzingConnectorId: 'connector0',
        fritzingConnectorAliases: ['VCC', 'pin1'],
        wokwiPinName: 'VCC',
        wokwiPinAliases: [],
      },
      {
        canonicalId: 'TRIG',
        displayName: 'Trigger Input (TRIG)',
        fritzingConnectorId: 'connector1',
        fritzingConnectorAliases: ['TRIG', 'pin2'],
        wokwiPinName: 'TRIG',
        wokwiPinAliases: [],
      },
      {
        canonicalId: 'ECHO',
        displayName: 'Echo Output (ECHO)',
        fritzingConnectorId: 'connector2',
        fritzingConnectorAliases: ['ECHO', 'pin3'],
        wokwiPinName: 'ECHO',
        wokwiPinAliases: [],
      },
      {
        canonicalId: 'GND',
        displayName: 'Ground (GND)',
        fritzingConnectorId: 'connector3',
        fritzingConnectorAliases: ['GND', 'pin4'],
        wokwiPinName: 'GND',
        wokwiPinAliases: [],
      },
    ],
  },
  {
    canonicalType: 'ssd1306-oled-i2c',
    displayName: 'SSD1306 128x64 I2C OLED Display',
    category: 'Output / Display',
    primaryFritzingModuleId: 'SSD1306-OLED-I2C-ModuleID',
    fritzingModulePath: 'core/ssd1306-oled.fzp',
    fritzingModuleAliases: [
      'SSD1306-OLED-I2C-ModuleID',
      'SSD1306 OLED 128x64 I2C',
      'Monochrome 0.96" 128x64 I2C OLED',
    ],
    wokwiPartType: 'board-ssd1306',
    wokwiTypeAliases: ['board-ssd1306', 'wokwi-ssd1306'],
    instancePrefix: 'oled',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'wokwi-multi-sensor-iot',
    knownLimitations: [
      'Maps 4-pin I2C breakout (GND, VCC/VDD, SCL, SDA). SPI 7-pin SSD1306 variants are not mapped.',
    ],
    propertyRules: [],
    pins: [
      {
        canonicalId: 'GND',
        displayName: 'Ground (GND)',
        fritzingConnectorId: 'connector0',
        fritzingConnectorAliases: ['GND', 'pin1'],
        wokwiPinName: 'GND',
        wokwiPinAliases: [],
      },
      {
        canonicalId: 'VCC',
        displayName: 'Power Supply (VCC / VDD)',
        fritzingConnectorId: 'connector1',
        fritzingConnectorAliases: ['VCC', 'VDD', 'VIN', 'pin2'],
        wokwiPinName: 'VCC',
        wokwiPinAliases: ['VDD', 'VIN'],
      },
      {
        canonicalId: 'SCL',
        displayName: 'I2C Clock (SCL)',
        fritzingConnectorId: 'connector2',
        fritzingConnectorAliases: ['SCL', 'SCK', 'pin3'],
        wokwiPinName: 'SCL',
        wokwiPinAliases: [],
      },
      {
        canonicalId: 'SDA',
        displayName: 'I2C Data (SDA)',
        fritzingConnectorId: 'connector3',
        fritzingConnectorAliases: ['SDA', 'pin4'],
        wokwiPinName: 'SDA',
        wokwiPinAliases: [],
      },
    ],
  },
  {
    canonicalType: 'potentiometer-rotary',
    displayName: 'Rotary Potentiometer (10kΩ)',
    category: 'Input / Switch',
    primaryFritzingModuleId: 'Rotary-Potentiometer-ModuleID',
    fritzingModulePath: 'core/potentiometer.fzp',
    fritzingModuleAliases: [
      'Rotary-Potentiometer-ModuleID',
      '3234DFDC00PotentiometerModuleID',
      'pot_big_4.fzp',
      'pot_big',
      'Rotary Potentiometer (Small)',
      'Trimmer Potentiometer',
      'Potentiometer',
    ],
    wokwiPartType: 'wokwi-potentiometer',
    wokwiTypeAliases: ['wokwi-potentiometer'],
    instancePrefix: 'pot',
    supportedDirections: ['fritzing-to-wokwi', 'wokwi-to-fritzing'],
    verificationStatus: 'verified-bidirectional',
    verifiedByFixture: 'esp32-v4-adc-pwm',
    knownLimitations: [
      'Outer terminals VCC (connector0 / Leg 1) and GND (connector2 / Leg 2) are resistive track ends; SIG (connector1 / Wiper) is the center terminal.',
    ],
    propertyRules: [
      {
        name: 'Track Resistance',
        fritzingPropertyName: 'maximum resistance',
        wokwiAttrName: 'value',
        description: 'Preserves potentiometer track resistance.',
        toWokwi: (props) => {
          const norm = normalizeResistanceToOhms(
            props['Maximum Resistance'] || props['maximum resistance'] || props.resistance || '10kΩ'
          );
          return { value: norm.ohmsString, status: 'transformed' };
        },
        toFritzing: (attrs) => {
          const norm = normalizeResistanceToOhms(attrs.value || '10000');
          return { value: `${norm.ohmsString}Ω`, status: 'transformed' };
        },
      },
    ],
    pins: [
      {
        canonicalId: 'VCC',
        displayName: 'Track End 1 (VCC / Leg 1)',
        fritzingConnectorId: 'connector0',
        fritzingConnectorAliases: ['leg1', 'pin1', 'VCC'],
        wokwiPinName: 'VCC',
        wokwiPinAliases: [],
      },
      {
        canonicalId: 'SIG',
        displayName: 'Wiper Signal (SIG / Wiper)',
        fritzingConnectorId: 'connector1',
        fritzingConnectorAliases: ['wiper', 'pin2', 'SIG'],
        wokwiPinName: 'SIG',
        wokwiPinAliases: [],
      },
      {
        canonicalId: 'GND',
        displayName: 'Track End 2 (GND / Leg 2)',
        fritzingConnectorId: 'connector2',
        fritzingConnectorAliases: ['leg2', 'pin3', 'GND'],
        wokwiPinName: 'GND',
        wokwiPinAliases: [],
      },
    ],
  },
];

/**
 * Identifies whether a Fritzing moduleIdRef is a breadboard or wire element.
 */
export function isFritzingBreadboardModule(moduleIdRef: string): boolean {
  const lower = moduleIdRef.toLowerCase();
  return lower.includes('breadboard');
}

export function isFritzingWireModule(moduleIdRef: string): boolean {
  const lower = moduleIdRef.toLowerCase();
  return lower === 'wiremoduleid' || lower.includes('wire');
}

/**
 * Computes the electrical strip group on a standard solderless breadboard for a given pin/connector ID.
 * For example:
 * - "pin1A", "pin1B", "pin1C", "pin1D", "pin1E" or "1a".."1e" -> "ROW_1_TOP_HALF"
 * - "pin1F", "pin1G", "pin1H", "pin1I", "pin1J" or "1f".."1j" -> "ROW_1_BOTTOM_HALF"
 * - Power rails: "pin_tp_1" / "tp.1" -> "RAIL_TOP_POS", "tn.1" -> "RAIL_TOP_NEG", etc.
 */
export function getBreadboardStripNetId(breadboardInstanceId: string, connectorId: string): string {
  const clean = connectorId.trim();
  // Match standard row+column e.g. "pin12A", "connector12a", "12a", "row12_colA"
  const rowColMatch = /(?:pin|connector)?(\d{1,2})([a-jA-J])$/.exec(clean);
  if (rowColMatch) {
    const row = rowColMatch[1];
    const col = rowColMatch[2].toUpperCase();
    const side = ['A', 'B', 'C', 'D', 'E'].includes(col) ? 'ABCDE' : 'FGHIJ';
    return `BB_${breadboardInstanceId}_ROW_${row}_${side}`;
  }

  // Match power rails e.g. tp, tn, bp, bn, +top, -top, +bottom, -bottom, bus_gnd, bus_vcc
  const lower = clean.toLowerCase();
  if (lower.startsWith('tp') || lower.includes('top_pos') || lower.includes('vcc_top') || /^pin\d+[wW]$/.test(clean)) {
    return `BB_${breadboardInstanceId}_RAIL_TOP_POS`;
  }
  if (lower.startsWith('tn') || lower.includes('top_neg') || lower.includes('gnd_top') || /^pin\d+[xX]$/.test(clean)) {
    return `BB_${breadboardInstanceId}_RAIL_TOP_NEG`;
  }
  if (lower.startsWith('bp') || lower.includes('bot_pos') || lower.includes('vcc_bot') || /^pin\d+[yY]$/.test(clean)) {
    return `BB_${breadboardInstanceId}_RAIL_BOT_POS`;
  }
  if (lower.startsWith('bn') || lower.includes('bot_neg') || lower.includes('gnd_bot') || /^pin\d+[zZ]$/.test(clean)) {
    return `BB_${breadboardInstanceId}_RAIL_BOT_NEG`;
  }

  return `BB_${breadboardInstanceId}_HOLE_${clean}`;
}

/**
 * Lookup mapping by Fritzing moduleIdRef, part path, or title/family properties
 */
export function findMappingByFritzingModule(
  moduleIdRef: string,
  properties: Record<string, string> = {},
  modulePath = ''
): ComponentMappingDefinition | undefined {
  const normalizedModule = moduleIdRef.trim().toLowerCase();
  const normalizedPath = modulePath.trim().toLowerCase();
  const family = (properties.family || properties.type || '').trim().toLowerCase();

  for (const mapping of PART_MAPPING_REGISTRY) {
    if (mapping.primaryFritzingModuleId.toLowerCase() === normalizedModule) {
      return mapping;
    }
    for (const alias of mapping.fritzingModuleAliases) {
      const lowerAlias = alias.toLowerCase();
      if (normalizedModule === lowerAlias || normalizedModule.includes(lowerAlias)) {
        return mapping;
      }
      if (normalizedPath && (normalizedPath === lowerAlias || normalizedPath.endsWith(lowerAlias))) {
        return mapping;
      }
      if (family && family === lowerAlias) {
        return mapping;
      }
    }
  }
  return undefined;
}

/**
 * Lookup mapping by Wokwi part type
 */
export function findMappingByWokwiType(wokwiType: string): ComponentMappingDefinition | undefined {
  const normalized = wokwiType.trim().toLowerCase();
  for (const mapping of PART_MAPPING_REGISTRY) {
    if (mapping.wokwiPartType.toLowerCase() === normalized) {
      return mapping;
    }
    if (mapping.wokwiTypeAliases.some((a) => a.toLowerCase() === normalized)) {
      return mapping;
    }
  }
  return undefined;
}

/**
 * Lookup pin definition within a component mapping by Fritzing connectorId
 */
export function findPinByFritzingConnector(
  mapping: ComponentMappingDefinition,
  connectorId: string,
  sourceModuleIdRef = ''
): PinMappingDefinition | undefined {
  const norm = connectorId.trim().toLowerCase();

  // Fritzing's horizontal 4-pin tactile pushbutton (20A9BBEE34_ST / pushbutton_4_horizontal.fzp)
  // rotates the pole layout so connector2 & connector0 are Pole 1 (1.l / 1.r) and connector3 & connector1 are Pole 2 (2.l / 2.r).
  if (
    mapping.canonicalType === 'pushbutton-tactile' &&
    (sourceModuleIdRef.toLowerCase().includes('20a9bbee34') ||
      sourceModuleIdRef.toLowerCase().includes('horizontal'))
  ) {
    if (norm === 'connector2') return mapping.pins.find((p) => p.canonicalId === '1.l');
    if (norm === 'connector3') return mapping.pins.find((p) => p.canonicalId === '2.l');
    if (norm === 'connector0') return mapping.pins.find((p) => p.canonicalId === '1.r');
    if (norm === 'connector1') return mapping.pins.find((p) => p.canonicalId === '2.r');
  }

  return mapping.pins.find(
    (p) =>
      p.fritzingConnectorId.toLowerCase() === norm ||
      p.canonicalId.toLowerCase() === norm ||
      p.fritzingConnectorAliases.some((a) => a.toLowerCase() === norm)
  );
}

/**
 * Lookup pin definition within a component mapping by Wokwi pin name
 */
export function findPinByWokwiPinName(
  mapping: ComponentMappingDefinition,
  wokwiPin: string
): PinMappingDefinition | undefined {
  const norm = wokwiPin.trim().toLowerCase();
  return mapping.pins.find(
    (p) =>
      p.wokwiPinName.toLowerCase() === norm ||
      p.canonicalId.toLowerCase() === norm ||
      p.wokwiPinAliases.some((a) => a.toLowerCase() === norm)
  );
}
