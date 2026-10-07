/**
 * Site-wide settings: brand, metadata, navigation and footer.
 * The agent rewrites this file for every page it builds. Placeholder values below.
 */

export type NavLink = { label: string; href: string };
export type FooterColumn = { title: string; links: { label: string; href: string }[] };

export type SiteConfig = {
  brand: { name: string; logoSrc?: string };
  metadata: { title: string; description: string };
  nav: { links: NavLink[]; cta: { label: string; href: string } };
  footer: {
    tagline: string;
    social: { label: string; href: string }[];
    columns: FooterColumn[];
    legal: string[];
  };
};

export const site = {
  brand: { name: "Your brand" },
  metadata: {
    title: "Your brand",
    description: "Replace with a 155-character description of the product.",
  },
  nav: {
    links: [{ label: "Section", href: "#section" }],
    cta: { label: "Primary action", href: "#" },
  },
  footer: {
    tagline: "One line about the product.",
    social: [],
    columns: [{ title: "Explore", links: [{ label: "Section", href: "#section" }] }],
    legal: ["© 2026 Your company"],
  },
} satisfies SiteConfig;
