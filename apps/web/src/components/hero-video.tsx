"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

type HeroVideoProps = {
  src: string;
  poster: string;
  className?: string;
  /** Media query controlling when this video should actually load & play. */
  query: string;
};

/**
 * Above-the-fold hero video. Unlike `LazyVideo`, this loads eagerly (no
 * IntersectionObserver) since the hero is always visible on first paint.
 * `query` gates the src so only the currently-rendered breakpoint variant
 * (desktop vs compact) fetches the file, avoiding a duplicate download.
 * `poster` shows a static frame immediately so there's no blank flash
 * while the video itself is still downloading.
 */
export function HeroVideo({ src, poster, className, query }: HeroVideoProps) {
  const shouldLoad = useMediaQuery(query);

  return (
    <video
      className={className}
      src={shouldLoad ? src : undefined}
      poster={poster}
      autoPlay={shouldLoad}
      muted
      loop
      playsInline
      preload={shouldLoad ? "auto" : "none"}
      aria-hidden="true"
    />
  );
}
