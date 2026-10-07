import { Wordmark } from "@/components/ui/wordmark";
import type { SiteConfig } from "@/site.config";

/** Footer in the centred page container: brand + tagline, link columns, legal row. */
export function Footer({ site }: { site: SiteConfig }) {
  const { footer, brand } = site;
  return (
    <footer className="border-t border-line bg-surface">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-5 lg:col-span-4">
          <Wordmark name={brand.name} logoSrc={brand.logoSrc} />
          <p className="max-w-xs text-body text-muted">{footer.tagline}</p>
          {footer.social.length > 0 && (
            <ul className="flex flex-wrap gap-5">
              {footer.social.map((s) => (
                <li key={s.label}>
                  <a href={s.href} className="text-label text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7 lg:col-start-6">
          {footer.columns.slice(0, 4).map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-4">
              <p className="kicker text-faint">{col.title}</p>
              <ul className="flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-label text-ink-soft hover:text-ink">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 sm:flex-row sm:justify-between">
          {footer.legal.map((l) => (
            <p key={l} className="text-small text-muted">
              {l}
            </p>
          ))}
        </div>
      </div>
    </footer>
  );
}
