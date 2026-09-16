import React, { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { gsap } from "./gsap.js";
import { BorderGlow } from "../components/BorderGlow.jsx";
import { CountUp } from "../../components/CountUp.jsx";
import { formatTokensCompact } from "../../../lib/format-tokens.js";
import { LV3 } from "./palette.js";

function rowName(entry, copy) {
  const name = (entry?.display_name || "").trim();
  return name || copy("landing.v3.leaderboard.anonymous");
}

function PodiumRow({ entry, rank, maxTokens, copy, animate }) {
  const isFirst = rank === 1;
  const tokens = Number(entry?.total_tokens) || 0;
  const barPct = maxTokens > 0 ? Math.max(6, Math.round((tokens / maxTokens) * 100)) : 0;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-white/[0.02] sm:px-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className={`w-5 font-mono text-xs font-bold ${isFirst ? "text-[color:var(--lv3-accent-soft)]" : "text-oai-gray-500"}`}
        >
          {String(rank).padStart(2, "0")}
        </span>
        {entry?.avatar_url ? (
          <img
            src={entry.avatar_url}
            alt=""
            width={24}
            height={24}
            loading="lazy"
            className="h-6 w-6 shrink-0 rounded-full border border-oai-gray-800 object-cover"
          />
        ) : (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-oai-gray-800 bg-oai-gray-900 font-mono text-[10px] font-bold text-oai-gray-400"
            aria-hidden="true"
          >
            {rowName(entry, copy).charAt(0).toUpperCase()}
          </span>
        )}
        <span className={`truncate text-sm tracking-wide ${isFirst ? "font-bold text-white" : "font-semibold text-oai-gray-200"}`}>
          {rowName(entry, copy)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <span className="hidden h-[2px] w-16 overflow-hidden rounded-full bg-oai-gray-900 sm:block" aria-hidden="true">
          <span
            className="block h-full rounded-full"
            style={{ width: `${barPct}%`, background: isFirst ? "var(--lv3-accent)" : LV3.line }}
          />
        </span>
        <span className={`font-mono text-sm leading-none tabular-nums ${isFirst ? "font-semibold text-white" : "font-medium text-oai-gray-300"}`}>
          <CountUp value={tokens} animate={animate} format={(v) => formatTokensCompact(Math.round(v))} />
        </span>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3.5">
        <span className="h-3 w-5 animate-pulse rounded bg-white/10" />
        <span className="h-6 w-6 animate-pulse rounded-full bg-white/10" />
        <span className="h-3 w-28 animate-pulse rounded bg-white/10" />
      </div>
      <span className="h-3 w-16 animate-pulse rounded bg-white/10" />
    </div>
  );
}

/**
 * Leaderboard teaser backed by the real global leaderboard: live top-3 podium
 * plus community totals in the status bar. Falls back to skeleton rows while
 * loading and to static copy numbers if the fetch fails.
 */
export function LeaderboardSection({ copy, animate, stats }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    if (!animate) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".lv3-lb-col",
        { autoAlpha: 0, y: 30 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.75,
          stagger: 0.14,
          ease: "power3.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 75%" },
        },
      );
    }, sectionRef);
    return () => ctx.revert();
  }, [animate]);

  const ready = stats.status === "ready";
  const top = ready ? stats.top : [];
  const maxTokens = top.length ? Number(top[0]?.total_tokens) || 0 : 0;

  // No fallback number: the podium only renders when ready, so a
  // placeholder here could only ever show invented data.
  const tokens = ready ? stats.tokenFloor : 0;

  return (
    <section ref={sectionRef} className="relative border-t border-oai-gray-900 bg-oai-gray-950 py-16 sm:py-24 lg:py-32">
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 items-center gap-10 sm:gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lv3-lb-col space-y-6 text-left lg:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-oai-gray-800 bg-oai-black px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-oai-gray-400">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--lv3-accent)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--lv3-accent)]" />
              </span>
              {copy("landing.v2.leaderboard.kicker")}
            </div>
            <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              {copy("landing.v2.leaderboard.title")}
            </h2>
            <p className="text-base leading-relaxed text-oai-gray-400">
              {copy("landing.v2.leaderboard.subtitle")}
            </p>
            <div className="pt-4">
              <Link
                to="/leaderboard"
                className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[8px] bg-white px-6 text-xs font-bold text-oai-gray-950 shadow-sm transition-all duration-200 hover:bg-oai-gray-100 active:scale-[0.98] select-none"
              >
                {copy("landing.v2.leaderboard.view_more")}
              </Link>
            </div>
          </div>

          <div className="lv3-lb-col w-full lg:col-span-7">
            <BorderGlow
              edgeSensitivity={30}
              glowColor="138 122 255"
              backgroundColor={LV3.panel}
              borderRadius={16}
              glowRadius={35}
              glowIntensity={1.0}
              coneSpread={25}
              animated={false}
              colors={[LV3.accent, LV3.accentSoft, LV3.glint]}
              className="w-full"
            >
              <div className="flex select-none items-center justify-between border-b border-oai-gray-800/80 bg-white/[0.025] px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-oai-gray-500 sm:px-5">
                <span>{copy("landing.v3.leaderboard.panel_title")}</span>
                <span className="flex items-center gap-1.5 font-mono text-[color:var(--lv3-accent-soft)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--lv3-accent)]" aria-hidden="true" />
                  {copy("landing.v3.leaderboard.live")}
                </span>
              </div>

              <div className="divide-y divide-oai-gray-800/60">
                {ready
                  ? top.map((entry, i) => (
                      <PodiumRow
                        key={entry?.user_id || i}
                        entry={entry}
                        rank={i + 1}
                        maxTokens={maxTokens}
                        copy={copy}
                        animate={animate}
                      />
                    ))
                  : [0, 1, 2].map((i) => <SkeletonRow key={i} />)}
              </div>

              {/* FORK: this status bar showed "N users syncing" and "X+ tokens
                  synced" — both hardcoded fallbacks whenever the leaderboard is
                  empty, which is every fresh deployment. Deleted rather than
                  faked; the rows above are the real data. */}
            </BorderGlow>
          </div>
        </div>
      </div>
    </section>
  );
}
