// =============================================================================
// §11.11 Era / round banners — short transient announcements (~1.5 s).
//
// Watches (era, round) and renders a centred ephemeral banner whenever
// either changes. Era flip wins over a round bump on the same tick (era
// flip resets the round to 1, so the era message is the load-bearing
// one). New transitions replace any in-flight banner — there is no
// queue.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { shallowEqual, useGameState } from "../hooks/useGameState";

const BANNER_DURATION_MS = 1500;

interface BannerState {
  readonly text: string;
  readonly key: number;
}

export function EraRoundBanner() {
  const view = useGameState(
    (s) => ({ era: s.era, round: s.round, phase: s.phase }),
    shallowEqual,
  );

  const prevRef = useRef<{ era: string; round: number } | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { era: view.era, round: view.round };
    if (prev === null) return; // first render — don't announce setup
    if (view.phase === "GAME_OVER") return; // end-game overlay handles this

    let text: string | null = null;
    if (prev.era !== view.era) {
      text = view.era === "CANAL" ? "Canal Era" : "Rail Era";
    } else if (prev.round !== view.round) {
      text = `Round ${view.round}`;
    }
    if (text === null) return;

    keyRef.current += 1;
    setBanner({ text, key: keyRef.current });
    const timer = setTimeout(() => {
      setBanner((cur) => (cur && cur.key === keyRef.current ? null : cur));
    }, BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [view.era, view.round, view.phase]);

  if (banner === null) return null;
  return (
    <div className="banner-overlay">
      <div className="banner-overlay__text" key={banner.key}>
        {banner.text}
      </div>
    </div>
  );
}
