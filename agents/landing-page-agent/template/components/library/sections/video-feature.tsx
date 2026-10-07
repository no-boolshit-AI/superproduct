import type { ReactNode } from "react";
import { Dialog, Icon, Media, Section, SectionIntro, type SectionTone } from "@/components/ui";

/**
 * SECTION 30 · Video
 * A poster with a play button that opens a working modal player.
 * `video` = an .mp4 path or an embeddable URL (https://…/embed/…) supplied in the brief.
 * Without a video, use a labelled placeholder poster and say so in the plan.
 */
export function VideoFeature({ id, kicker, title, lead, poster, posterAlt, video, videoTitle, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; poster?: string; posterAlt?: string; video?: string; videoTitle: string; tone?: SectionTone }) {
  const isFile = video && /\.(mp4|webm)$/i.test(video);
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="center" />
        <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl">
          {poster ? <img src={poster} alt={posterAlt ?? ""} className="aspect-video w-full object-cover" /> : <div className="aspect-video w-full bg-brand-deep" />}
          <div className="absolute inset-0 grid place-items-center">
            <Dialog
              title={videoTitle}
              trigger={
                <span className="flex items-center gap-3 rounded-full bg-canvas py-2 pl-2 pr-5 text-label text-ink shadow-lg">
                  <span className="grid size-11 place-items-center rounded-full bg-accent text-on-accent">
                    <Icon name="play" className="size-5" />
                  </span>
                  Play video
                </span>
              }
            >
              {video ? (
                isFile ? (
                  <video src={video} controls className="aspect-video w-full rounded-lg bg-ink" />
                ) : (
                  <iframe src={video} title={videoTitle} allow="autoplay; fullscreen; picture-in-picture" className="aspect-video w-full rounded-lg" />
                )
              ) : (
                <Media label="Video supplied by the brand" className="aspect-video" />
              )}
            </Dialog>
          </div>
        </div>
      </div>
    </Section>
  );
}
