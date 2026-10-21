import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import {
  ComponentMappingDefinition,
  PART_MAPPING_REGISTRY,
} from '../packages/part-mappings/registry';

interface PartRegistryViewProps {
  onSelectFixture: (fixtureId: string) => void;
}

export const PartRegistryView: React.FC<PartRegistryViewProps> = ({ onSelectFixture }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedCanonicalType, setExpandedCanonicalType] = useState<string | null>(
    'esp32-devkit-v1'
  );

  const categories = useMemo(() => {
    const cats = new Set<string>(['All']);
    for (const part of PART_MAPPING_REGISTRY) {
      cats.add(part.category);
    }
    return Array.from(cats);
  }, []);

  const filteredParts = useMemo(() => {
    return PART_MAPPING_REGISTRY.filter((part) => {
      if (selectedCategory !== 'All' && part.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${part.displayName} ${part.canonicalType} ${part.primaryFritzingModuleId} ${part.wokwiPartType} ${part.fritzingModuleAliases.join(' ')}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 bg-white rounded-lg p-6">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-900">
            Verified Component & Pin Mapping Registry
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            WireMorph uses a deterministic, data-driven registry to translate between Fritzing{' '}
            <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">moduleIdRef</code>{' '}
            definitions and Wokwi simulator component types. Unknown or unverified parts are never
            guessed—they are reported explicitly in the conversion diagnostics.
          </p>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <label htmlFor="registry-search" className="sr-only">
              Search component mappings
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="registry-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search moduleId, Wokwi type, or pin..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredParts.map((part: ComponentMappingDefinition) => {
          const isExpanded = expandedCanonicalType === part.canonicalType;
          return (
            <div
              key={part.canonicalType}
              className="border border-slate-200 bg-white rounded-lg overflow-hidden"
            >
              <div className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>{part.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 font-medium">Bidirectional Verified</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{part.pins.length} mapped pins</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{part.displayName}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-700 pt-0.5">
                    <span>Fritzing: {part.primaryFritzingModuleId}</span>
                    <span aria-hidden="true" className="text-slate-400">
                      ↔
                    </span>
                    <span>Wokwi: {part.wokwiPartType}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectFixture(part.verifiedByFixture)}
                    className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    Load Verification Fixture ({part.verifiedByFixture})
                  </button>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedCanonicalType(isExpanded ? null : part.canonicalType)
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                        Hide Pinout Table
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                        Inspect {part.pins.length} Pins & Rules
                      </>
                    )}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-200 bg-slate-50/50 p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1.5">
                        Recognized Fritzing Module IDs & Aliases
                      </h3>
                      <p className="font-mono text-slate-700 leading-relaxed">
                        {part.fritzingModuleAliases.join(' · ')}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1.5">
                        Known Limitations & Equivalence Notes
                      </h3>
                      <ul className="list-disc list-inside space-y-1 text-slate-700">
                        {part.knownLimitations.map((lim, i) => (
                          <li key={i}>{lim}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-md bg-white overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                          <th className="py-2 px-3">Canonical Pin</th>
                          <th className="py-2 px-3">Description</th>
                          <th className="py-2 px-3">Fritzing connectorId</th>
                          <th className="py-2 px-3">Accepted Fritzing Aliases</th>
                          <th className="py-2 px-3">Wokwi Pin Name</th>
                          <th className="py-2 px-3">Equivalence Group</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                        {part.pins.map((pin) => (
                          <tr key={pin.canonicalId} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {pin.canonicalId}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-700">
                              {pin.displayName}
                            </td>
                            <td className="py-2 px-3 text-blue-700">{pin.fritzingConnectorId}</td>
                            <td className="py-2 px-3 text-slate-600">
                              {pin.fritzingConnectorAliases.join(', ') || '—'}
                            </td>
                            <td className="py-2 px-3 text-emerald-700 font-semibold">
                              {pin.wokwiPinName}
                            </td>
                            <td className="py-2 px-3 text-slate-500">
                              {pin.equivalenceGroup ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
