import type { ReactNode } from "react";

export function PanelGrid({ children }: { children?: ReactNode }) {
  return <div className="panel-grid">{children}</div>;
}
