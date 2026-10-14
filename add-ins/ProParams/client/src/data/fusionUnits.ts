/**
 * Unit tokens Fusion 360 accepts on a user parameter.
 * These match the Parameters dialog unit list (the string stored in `parameter.unit`).
 * An empty symbol is unitless. "Text" creates a text parameter.
 */

export type FusionUnit = {
  symbol: string;
  label: string;
  category: string;
  keywords?: string[];
};

type UnitDef = {
  symbol: string;
  label: string;
  keywords?: string[];
};

const CATALOG: { category: string; units: UnitDef[] }[] = [
  {
    category: 'General',
    units: [
      { symbol: '', label: 'Unitless', keywords: ['none', 'number', 'ul'] },
      { symbol: 'Text', label: 'Text', keywords: ['string'] },
    ],
  },
  {
    category: 'Length',
    units: [
      { symbol: 'mm', label: 'Millimeter', keywords: ['millimetre'] },
      { symbol: 'cm', label: 'Centimeter', keywords: ['centimetre'] },
      { symbol: 'm', label: 'Meter', keywords: ['metre'] },
      { symbol: 'in', label: 'Inch', keywords: ['inches'] },
      { symbol: 'ft', label: 'Foot', keywords: ['feet'] },
      { symbol: 'micron', label: 'Micron', keywords: ['micrometer', 'micrometre', 'um', 'μm'] },
      { symbol: 'mil', label: 'Mil', keywords: ['thou'] },
      { symbol: 'hm', label: 'Hectometer', keywords: ['hectometre'] },
      { symbol: 'yd', label: 'Yard' },
      { symbol: 'mi', label: 'Mile' },
      { symbol: 'nauticalMile', label: 'Nautical Mile', keywords: ['nmi', 'nm'] },
    ],
  },
  {
    category: 'Angle',
    units: [
      { symbol: 'deg', label: 'Degree', keywords: ['degrees', 'angle'] },
      { symbol: 'rad', label: 'Radian', keywords: ['radians'] },
      { symbol: 'grad', label: 'Gradian', keywords: ['gon', 'grade'] },
    ],
  },
  {
    category: 'Mass',
    units: [
      { symbol: 'g', label: 'Gram' },
      { symbol: 'kg', label: 'Kilogram' },
      { symbol: 'lbmass', label: 'Pound Mass', keywords: ['lb', 'lbs', 'lbm', 'pound'] },
      { symbol: 'ouncemass', label: 'Ounce Mass', keywords: ['oz', 'ounce'] },
      { symbol: 'slug', label: 'Slug' },
      { symbol: 'tonmass', label: 'Ton Mass', keywords: ['ton'] },
    ],
  },
  {
    category: 'Time',
    units: [
      { symbol: 's', label: 'Second', keywords: ['sec'] },
      { symbol: 'min', label: 'Minute' },
      { symbol: 'hr', label: 'Hour', keywords: ['hour'] },
    ],
  },
  {
    category: 'Temperature',
    units: [
      { symbol: 'C', label: 'Celsius', keywords: ['centigrade', 'c'] },
      { symbol: 'F', label: 'Fahrenheit', keywords: ['f'] },
      { symbol: 'K', label: 'Kelvin' },
      { symbol: 'R', label: 'Rankine' },
    ],
  },
  {
    category: 'Area',
    units: [
      { symbol: 'acre', label: 'Acre' },
      { symbol: 'circular_mil', label: 'Circular Mil', keywords: ['cmil'] },
    ],
  },
  {
    category: 'Volume',
    units: [
      { symbol: 'l', label: 'Liter', keywords: ['litre'] },
      { symbol: 'gal', label: 'Gallon' },
      { symbol: 'qt', label: 'Quart' },
      { symbol: 'pt', label: 'Pint' },
      { symbol: 'cup', label: 'Cup' },
      { symbol: 'fl_oz', label: 'Fluid Ounce', keywords: ['floz', 'fl oz'] },
    ],
  },
  {
    category: 'Speed',
    units: [
      { symbol: 'mps', label: 'Meter per Second', keywords: ['m/s'] },
      { symbol: 'fps', label: 'Foot per Second', keywords: ['ft/s'] },
      { symbol: 'mph', label: 'Mile per Hour', keywords: ['mi/h'] },
      { symbol: 'knots', label: 'Knot', keywords: ['kn', 'kt'] },
    ],
  },
  {
    category: 'Angular Velocity',
    units: [{ symbol: 'rpm', label: 'Revolution per Minute', keywords: ['rev/min'] }],
  },
  {
    category: 'Force',
    units: [
      { symbol: 'N', label: 'Newton' },
      { symbol: 'dyne', label: 'Dyne' },
      { symbol: 'lbforce', label: 'Pound Force', keywords: ['lbf'] },
      { symbol: 'ounceforce', label: 'Ounce Force', keywords: ['ozf'] },
      { symbol: 'tonforce', label: 'Ton Force' },
    ],
  },
  {
    category: 'Pressure',
    units: [
      { symbol: 'Pa', label: 'Pascal' },
      { symbol: 'mPa', label: 'Millipascal' },
      { symbol: 'MPa', label: 'Megapascal' },
      { symbol: 'bar', label: 'Bar' },
      { symbol: 'psi', label: 'Pound per Square Inch' },
      { symbol: 'psf', label: 'Pound per Square Foot' },
      { symbol: 'ksi', label: 'Kip per Square Inch', keywords: ['kilopound'] },
      { symbol: 'atm', label: 'Atmosphere' },
      { symbol: 'inH2O', label: 'Inch of Water' },
      { symbol: 'ftH2O', label: 'Foot of Water' },
      { symbol: 'mH2O', label: 'Meter of Water' },
      { symbol: 'mmHg', label: 'Millimeter of Mercury', keywords: ['torr'] },
      { symbol: 'inHg', label: 'Inch of Mercury' },
    ],
  },
  {
    category: 'Power',
    units: [
      { symbol: 'W', label: 'Watt' },
      { symbol: 'hp', label: 'Horsepower' },
    ],
  },
  {
    category: 'Energy',
    units: [
      { symbol: 'J', label: 'Joule' },
      { symbol: 'erg', label: 'Erg' },
      { symbol: 'calorie', label: 'Calorie', keywords: ['cal'] },
      { symbol: 'Btu', label: 'British Thermal Unit', keywords: ['btu'] },
    ],
  },
  {
    category: 'Flow Rate',
    units: [
      { symbol: 'CCS', label: 'Cubic Centimeter per Second', keywords: ['cm^3/s', 'cc/s'] },
      { symbol: 'CIS', label: 'Cubic Inch per Second', keywords: ['in^3/s'] },
      { symbol: 'CFM', label: 'Cubic Foot per Minute', keywords: ['ft^3/min'] },
      { symbol: 'CMH', label: 'Cubic Meter per Hour', keywords: ['m^3/h'] },
      { symbol: 'GPH', label: 'Gallon per Hour', keywords: ['gal/h'] },
      { symbol: 'LPH', label: 'Liter per Hour', keywords: ['l/h'] },
    ],
  },
  {
    category: 'Frequency',
    units: [{ symbol: 'Hz', label: 'Hertz' }],
  },
  {
    category: 'Electrical',
    units: [
      { symbol: 'A', label: 'Ampere', keywords: ['amp', 'current'] },
      { symbol: 'V', label: 'Volt', keywords: ['voltage'] },
      { symbol: 'ohm', label: 'Ohm', keywords: ['resistance', 'ω'] },
      { symbol: 'columb', label: 'Coulomb', keywords: ['coulomb', 'charge'] },
      { symbol: 'farad', label: 'Farad', keywords: ['capacitance'] },
      { symbol: 'S', label: 'Siemens', keywords: ['conductance'] },
      { symbol: 'mho', label: 'Mho' },
      { symbol: 'H', label: 'Henry', keywords: ['inductance'] },
    ],
  },
  {
    category: 'Magnetic',
    units: [
      { symbol: 'Wb', label: 'Weber' },
      { symbol: 'maxwell', label: 'Maxwell' },
      { symbol: 'T', label: 'Tesla' },
      { symbol: 'gamma', label: 'Gamma' },
      { symbol: 'gauss', label: 'Gauss' },
      { symbol: 'oersted', label: 'Oersted' },
    ],
  },
  {
    category: 'Light',
    units: [
      { symbol: 'cd', label: 'Candela' },
      { symbol: 'lm', label: 'Lumen' },
      { symbol: 'lx', label: 'Lux' },
      { symbol: 'EV', label: 'Exposure Value' },
    ],
  },
  {
    category: 'Other',
    units: [
      { symbol: 'mole', label: 'Mole', keywords: ['mol', 'substance'] },
      { symbol: 'sr', label: 'Steradian', keywords: ['solid angle'] },
      { symbol: 'poise', label: 'Poise', keywords: ['viscosity'] },
      { symbol: 'pcs', label: 'Pieces', keywords: ['piece', 'count', 'each'] },
      { symbol: 'dol', label: 'Dollar', keywords: ['currency', 'usd'] },
    ],
  },
];

export const FUSION_UNITS: FusionUnit[] = CATALOG.flatMap((group) =>
  group.units.map((unit) => ({ ...unit, category: group.category }))
);

const UNIT_BY_SYMBOL = new Map(FUSION_UNITS.map((unit) => [unit.symbol, unit]));

export function findUnit(symbol: string): FusionUnit | undefined {
  return UNIT_BY_SYMBOL.get(symbol);
}

function scoreUnit(unit: FusionUnit, query: string, folded: string): number {
  const symbol = unit.symbol.toLowerCase();
  const label = unit.label.toLowerCase();
  const keywords = unit.keywords?.map((keyword) => keyword.toLowerCase()) ?? [];

  if (unit.symbol === query) return 100;
  if (symbol && symbol === folded) return 90;
  if (label === folded) return 85;
  if (keywords.some((keyword) => keyword === folded)) return 80;
  if (symbol.startsWith(folded)) return 70;
  if (label.startsWith(folded)) return 60;
  if (keywords.some((keyword) => keyword.startsWith(folded))) return 50;
  if (symbol.includes(folded)) return 40;
  if (label.includes(folded)) return 30;
  if (keywords.some((keyword) => keyword.includes(folded))) return 20;
  if (unit.category.toLowerCase().includes(folded)) return 10;
  return 0;
}

/** Ranked matches. An empty query returns the full catalog in Fusion's group order. */
export function searchUnits(query: string): FusionUnit[] {
  const trimmed = query.trim();
  if (!trimmed) return FUSION_UNITS;

  const folded = trimmed.toLowerCase();
  return FUSION_UNITS
    .map((unit, index) => ({ unit, index, score: scoreUnit(unit, trimmed, folded) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.unit);
}

/**
 * Resolve a typed query to one unit symbol.
 * Empty input is unitless. Returns undefined when several units match.
 */
export function resolveUnitQuery(query: string): string | undefined {
  const trimmed = query.trim();
  if (!trimmed) return '';

  const exact = UNIT_BY_SYMBOL.get(trimmed);
  if (exact) return exact.symbol;

  const folded = trimmed.toLowerCase();
  const symbolMatches = FUSION_UNITS.filter((unit) => unit.symbol.toLowerCase() === folded);
  if (symbolMatches.length === 1) return symbolMatches[0].symbol;

  const named = FUSION_UNITS.filter(
    (unit) =>
      unit.label.toLowerCase() === folded ||
      unit.keywords?.some((keyword) => keyword.toLowerCase() === folded)
  );
  if (named.length === 1) return named[0].symbol;

  return undefined;
}
