/** Types for lib/product.mjs (the product folder loader). */

export declare const MANIFEST: "product.json";
export declare const SCHEMA_VERSION: 1;
export declare const STATUSES: readonly ["verified", "draft", "template"];
export declare const ROLE_NAMES: readonly string[];
export declare const DEFAULT_PROFILES: Record<string, string[]>;

export declare class ProductError extends Error {}

export interface FindOptions {
  /** A CLI value such as --product <dir> (or the name of a product in the workspace's products/); "none" disables the product. */
  explicit?: string | null;
  /** Where PRODUCT_DIR is read from (default process.env). */
  env?: Record<string, string | undefined>;
  /** Where to start walking up looking for product/product.json, the layout before the workspace (usually the agent's own folder). */
  from?: string;
  /** The workspace whose product/ and products/ are used (default: lib/workspace.mjs → workspaceDir()). */
  workspace?: string;
}
export declare function findProductDir(opts?: FindOptions): string | null;
export declare function tryLoadProduct(opts?: FindOptions): Product | null;
export declare function loadProduct(dir: string): Product;

export declare function hexToRgb(hex: string): [number, number, number];
export declare function rgbToHex(rgb: number[]): string;
export declare function normalizeHex(hex: string): string;
export declare function luminance(hex: string): number;
export declare function contrast(a: string, b: string): number;
export declare function mix(a: string, b: string, t: number): string;
export declare function darken(c: string, t: number): string;
export declare function lighten(c: string, t: number): string;
export declare function toOklch(hex: string): { l: number; c: number; h: number };
export declare function fromOklch(c: { l: number; c: number; h: number }): string;
export declare function withContrast(color: string, bg: string, target?: number): string;
export declare function readableOn(bg: string, candidates?: string[]): string;
export declare function rgbTriplet(hex: string): string;

export interface Token {
  path: string;
  type?: string;
  value: unknown;
  description?: string;
  extensions?: Record<string, unknown>;
  deprecated?: boolean | string;
}
export declare function parseTokens(doc: unknown): Map<string, Token>;
export declare function resolveTokens(raw: Map<string, Token>): Map<string, Token>;
export declare function colorToHex(value: unknown): string;
export declare function alphaOf(value: unknown): number;
export declare function dimensionToCss(value: unknown): string;
export declare function fontStackToCss(value: unknown): string;
export declare function tokensToCss(tokens: Map<string, Token>, opts?: { selector?: string; prefix?: string }): string;

export declare function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string };
export declare function listDocs(dir: string): string[];
export declare function fileKb(abs: string): number;

export interface Roles {
  primary: string;
  onPrimary: string;
  secondary: string;
  accent: string;
  onAccent: string;
  /** The accent, made readable as text on the background (a lime brand colour becomes a deep olive). */
  accentText: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  inverse: string;
  onInverse: string;
  border: string;
}

export interface FontFile {
  path: string;
  abs: string;
  exists: boolean;
  weight?: string;
  style?: string;
  unicodeRange?: string;
}
export interface FontEntry {
  family: string;
  role?: string;
  license?: string;
  source?: string;
  files: FontFile[];
}

export interface Offering {
  id: string;
  name: string;
  kind?: string;
  audience?: string;
  summary?: string;
  price?: { from?: number; currency?: string; unit?: string; note?: string } | null;
  url?: string;
  status?: string;
  file?: string;
}

export interface Manifest {
  schemaVersion: 1;
  id: string;
  name: string;
  wordmark?: string;
  tagline?: string;
  oneLiner?: string;
  description?: string;
  category?: string;
  stage?: string;
  languages?: string[];
  website?: string;
  links?: Record<string, string>;
  company?: Record<string, string>;
  cta?: Record<string, { label: string; url: string; note?: string }>;
  audiences?: { id: string; label: string; file?: string }[];
  offerings?: Offering[];
  brand?: {
    tokens?: string;
    css?: string;
    guidelines?: string;
    voice?: string;
    messaging?: string;
    logo?: Record<string, string>;
    fonts?: { family: string; role?: string; license?: string; source?: string; files?: { path: string; weight?: string; style?: string; unicodeRange?: string }[] }[];
    shape?: "sharp" | "soft" | "round";
    imageStyle?: string;
    signature?: string;
  };
  context?: Record<string, string[]>;
  agents?: Record<string, Record<string, unknown>>;
  repos?: string[];
  updated?: string;
  [k: string]: unknown;
}

export declare class Product {
  constructor(dir: string, manifest: Manifest, tokens: Map<string, Token>);
  readonly dir: string;
  readonly manifest: Manifest;
  readonly tokens: Map<string, Token>;
  readonly id: string;
  readonly name: string;
  readonly wordmark: string;
  readonly tagline: string;
  readonly oneLiner: string;
  readonly website: string;
  readonly languages: string[];
  readonly updated: string;
  readonly roles: Roles;
  readonly fonts: FontEntry[];
  readonly shape: "sharp" | "soft" | "round";
  readonly imageStyle: string;
  readonly offerings: Offering[];
  resolve(rel: string): string;
  exists(rel: string): boolean;
  token(path: string): Token | undefined;
  color(ref: string | undefined | null): string | undefined;
  fontStack(role: string): string | undefined;
  fontFamily(role: string): string | undefined;
  fontFiles(families?: string[]): string[];
  fontFaceCss(opts?: { url?: (abs: string) => string; families?: string[] }): string;
  logo(kind?: string): string | null;
  agentConfig<T = Record<string, unknown>>(agentId: string): T;
  profilesFor(agentId: string): string[];
  contextFiles(profiles: string[]): string[];
  read(rel: string): { data: Record<string, unknown>; body: string; path: string };
  context(target: string | string[], opts?: { maxChars?: number; purpose?: string }): string;
  summary(): string;
}

export interface CheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  info: {
    docs: Record<string, number>;
    placeholders: number;
    offerings: number;
    fonts: number;
    assets: number;
    briefWords?: number;
    contrast?: Record<string, number>;
  };
  product?: Product;
}
export declare function checkProduct(dir: string, opts?: { now?: Date }): CheckResult;
