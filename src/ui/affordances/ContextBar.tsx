import type { ReactNode } from "react";

export function ContextBar({ children }: { children?: ReactNode }) {
  return <div className="context-bar">{children}</div>;
}
