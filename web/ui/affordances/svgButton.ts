import type { KeyboardEvent } from "react";

/** SVG groups need the same keyboard activation as native buttons. */
export function svgButton(label: string, onActivate: (() => void) | undefined, pressed?: boolean) {
  return {
    role: "button" as const,
    tabIndex: onActivate ? 0 : undefined,
    "aria-label": label,
    "aria-disabled": !onActivate,
    "aria-pressed": pressed,
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      if (onActivate && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
