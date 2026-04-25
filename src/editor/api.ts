import type { CitiesConfigRaw, LinksConfigRaw } from "./types";

export async function loadCitiesConfig(): Promise<CitiesConfigRaw> {
  const res = await fetch("/__editor/load?file=cities");
  if (!res.ok) throw new Error(`load cities: ${res.status}`);
  return (await res.json()) as CitiesConfigRaw;
}

export async function loadLinksConfig(): Promise<LinksConfigRaw> {
  const res = await fetch("/__editor/load?file=links");
  if (!res.ok) throw new Error(`load links: ${res.status}`);
  return (await res.json()) as LinksConfigRaw;
}

export async function saveCitiesConfig(data: CitiesConfigRaw): Promise<void> {
  const res = await fetch("/__editor/save?file=cities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(`save cities: ${body.error ?? res.status}`);
  }
}

export async function saveLinksConfig(data: LinksConfigRaw): Promise<void> {
  const res = await fetch("/__editor/save?file=links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(`save links: ${body.error ?? res.status}`);
  }
}
