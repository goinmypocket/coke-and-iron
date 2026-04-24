import type { ReactNode } from "react";

export interface PanelProps {
  title: string;
  children?: ReactNode;
}

export function Panel({ title, children }: PanelProps) {
  return (
    <section className="panel">
      <header className="panel-title">{title}</header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
