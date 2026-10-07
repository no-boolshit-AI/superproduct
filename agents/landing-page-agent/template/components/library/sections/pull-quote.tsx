import { Avatar, Icon, QuoteText, Section, Small, type SectionTone } from "@/components/ui";

/**
 * SECTION 22 · Pull quote
 * One quote at full scale with attribution. Real, attributable quotes only.
 * Best for: a single strong customer or founder voice between denser sections.
 */
export function PullQuote({ id, quote, name, role, photo, tone = "brand-soft" }: { id?: string; quote: string; name: string; role?: string; photo?: string; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone} width="narrow">
      <figure className="flex flex-col items-center gap-8 text-center">
        <Icon name="quote" className="size-10 text-link" />
        <QuoteText>{quote}</QuoteText>
        <figcaption className="flex items-center gap-4">
          <Avatar name={name} src={photo} />
          <span className="flex flex-col text-left">
            <span className="text-label text-fg">{name}</span>
            {role && <Small>{role}</Small>}
          </span>
        </figcaption>
      </figure>
    </Section>
  );
}
