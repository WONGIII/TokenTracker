import React, { useLayoutEffect, useRef } from "react";
import { motion } from "motion/react";
import { gsap, ScrollTrigger } from "./gsap.js";
import { DownloadButtons } from "./DownloadButtons.jsx";

// three.js (~150KB gzip) is decorative and below the hero copy — keep it out
// of the landing critical path and hydrate the galaxy right after first paint.
const TokenGalaxy = React.lazy(() =>
  import("./TokenGalaxy.jsx").then((m) => ({ default: m.TokenGalaxy })),
);

export function galaxyStageClassName(animate) {
  return animate
    ? "absolute inset-x-0 bottom-0 top-0 z-0 lg:bottom-[-40vh]"
    : "absolute inset-0 z-0";
}

/**
 * Split-stage hero: the copy (headline, CTAs) sits on clean black in the upper
 * half; the token galaxy is a fully visible top-down vortex rising from the
 * bottom edge. A scrubbed ScrollTrigger writes 0..1 into `progressRef` so
 * scrolling dives the camera into the vortex while the copy drifts away.
 *
 * FORK: the install-command box and the community counter both used to sit in
 * this component and are deleted — see the notes at their old positions.
 */
export function HeroSection({
  copy,
  animate,
  effectsReady,
  githubLabel,
}) {
  const sectionRef = useRef(null);
  const copyRef = useRef(null);
  const progressRef = useRef(0);

  useLayoutEffect(() => {
    if (!animate) return undefined;
    const ctx = gsap.context(() => {
      // Raw progress for the galaxy camera (smoothed inside TokenGalaxy).
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "bottom top",
        scrub: true,
        onUpdate: (st) => {
          progressRef.current = st.progress;
        },
      });
      // One smoothed exit timeline for the whole hero: the copy leaves and the
      // section unpins the moment the stage is empty — no dead scroll at the tail.
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 0.5,
        },
      });
      tl.to(copyRef.current, { yPercent: -16, autoAlpha: 0, duration: 0.30 }, 0.08);
      tl.to({}, { duration: 0.1 });
    }, sectionRef);
    return () => ctx.revert();
  }, [animate]);

  const galaxyMode = animate && effectsReady ? "full" : "static";

  return (
    <section ref={sectionRef} className="relative">
      {/* min 52rem stage: on very short viewports the galaxy stage extends
          below the fold instead of letting the copy crash into the galaxy. */}
      <div className="relative min-h-[max(100svh,52rem)]">
        {/* Upper stage: hero copy on clean black — no particles behind it. */}
        <div
          ref={copyRef}
          className="relative z-20 mx-auto flex max-w-3xl flex-col items-center px-4 pt-28 text-center tall:pt-48 xtall:pt-56 sm:px-6 sm:pt-36 sm:xtall:pt-60"
        >
          <motion.div
            initial={animate ? { opacity: 0, y: 24 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center"
          >
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-oai-gray-400 tall:mb-5">
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--lv3-accent)] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--lv3-accent)]" />
              </span>
              {copy("landing.v3.hero.kicker")}
            </p>

            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-[2.75rem] sm:tall:text-[3.25rem] sm:xtall:text-6xl lg:xtall:text-[4rem]">
              {copy("landing.v2.hero.title_line1")}
              <br />
              <span
                className="bg-gradient-to-b from-white via-[color:var(--lv3-accent-soft)] to-[color:var(--lv3-accent)] bg-clip-text font-bold tracking-tight text-transparent"
                style={{ WebkitTextStroke: "1px rgba(255, 255, 255, 0.12)" }}
              >
                {copy("landing.v2.hero.title_line2")}
              </span>
            </h1>

            {/* FORK: the "npx --yes tokentracker-cli" install line is gone on
                purpose — that package is upstream's, and installing it would give
                you the original tracker, not this build. The download buttons
                below are the only install path this fork publishes. */}
            <div className="mt-8 w-full xtall:mt-10">
              <DownloadButtons copy={copy} githubLabel={githubLabel} />
            </div>
          </motion.div>
        </div>

        {/* The galaxy canvas covers the whole viewport — no container edge can
            slice it — while the disc itself is parked in the lower half, with
            the live counter floating on its bright core. */}
        <div className={galaxyStageClassName(animate)}>
          <React.Suspense fallback={null}>
            <TokenGalaxy mode={galaxyMode} progressRef={progressRef} />
          </React.Suspense>

          {/* FORK: the community counter that sat here (tokens tracked, users
              syncing) is deleted. Both numbers were hardcoded fallbacks whenever the
              leaderboard had no data — always the case on a fresh deployment — so they
              advertised 2.2 trillion tokens and 600 users that do not exist. The same
              pair appeared in LeaderboardSection and is gone there too. */}

          {/* Fade the vortex into the page background at the bottom edge. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
            style={{ background: "linear-gradient(to bottom, transparent, var(--lv3-bg) 85%)" }}
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}
