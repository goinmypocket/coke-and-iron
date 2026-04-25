import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadCitiesConfig,
  loadLinksConfig,
  saveCitiesConfig,
  saveLinksConfig,
} from "./api";
import { BoardEditor } from "./BoardEditor";
import { CityForm } from "./CityForm";
import { LinksList } from "./LinksList";
import { MerchantForm } from "./MerchantForm";
import type {
  CitiesConfigRaw,
  EditorMode,
  LinkEra,
  LinksConfigRaw,
} from "./types";

interface Status {
  kind: "idle" | "info" | "ok" | "error";
  text: string;
}

export function EditorApp() {
  const [cities, setCities] = useState<CitiesConfigRaw | null>(null);
  const [links, setLinks] = useState<LinksConfigRaw | null>(null);
  const [citiesDirty, setCitiesDirty] = useState(false);
  const [linksDirty, setLinksDirty] = useState(false);
  const [mode, setMode] = useState<EditorMode>("cities");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<
    { era: LinkEra; index: number } | null
  >(null);
  const [pendingLinkStart, setPendingLinkStart] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({
    kind: "info",
    text: "Loading config…",
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCitiesConfig(), loadLinksConfig()])
      .then(([c, l]) => {
        if (cancelled) return;
        setCities(c);
        setLinks(l);
        setStatus({ kind: "ok", text: "Loaded." });
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus({ kind: "error", text: `Load failed: ${err}` });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateCities = useCallback(
    (next: CitiesConfigRaw) => {
      setCities(next);
      setCitiesDirty(true);
    },
    [],
  );
  const updateLinks = useCallback((next: LinksConfigRaw) => {
    setLinks(next);
    setLinksDirty(true);
  }, []);

  const onSave = useCallback(async () => {
    if (!cities || !links) return;
    setStatus({ kind: "info", text: "Saving…" });
    try {
      const work: Promise<void>[] = [];
      if (citiesDirty) work.push(saveCitiesConfig(cities));
      if (linksDirty) work.push(saveLinksConfig(links));
      await Promise.all(work);
      setCitiesDirty(false);
      setLinksDirty(false);
      setStatus({ kind: "ok", text: "Saved." });
    } catch (err) {
      setStatus({ kind: "error", text: `Save failed: ${err}` });
    }
  }, [cities, links, citiesDirty, linksDirty]);

  // Clear selection when the mode changes so a stale selection doesn't
  // show a side panel that no longer applies.
  useEffect(() => {
    setSelectedCity(null);
    setSelectedMerchant(null);
    setSelectedLink(null);
    setPendingLinkStart(null);
  }, [mode]);

  const cityNames = useMemo(() => {
    const set = new Set<string>();
    if (cities) {
      for (const c of cities.cities) set.add(c.name);
      for (const m of cities.merchantCities) set.add(m.name);
    }
    return set;
  }, [cities]);

  const dirty = citiesDirty || linksDirty;

  return (
    <div className="editor-shell">
      <header className="editor-bar">
        <h1 className="editor-title">Config Editor</h1>
        <div className="editor-tabs">
          {(["cities", "merchants", "canal", "rail"] as EditorMode[]).map(
            (m) => (
              <button
                key={m}
                className={
                  "editor-tab" +
                  (mode === m ? " editor-tab--active" : "")
                }
                onClick={() => setMode(m)}
              >
                {tabLabel(m)}
              </button>
            ),
          )}
        </div>
        <div className="editor-status-area">
          <span className={`editor-status editor-status--${status.kind}`}>
            {dirty && status.kind !== "info" ? "Unsaved changes — " : ""}
            {status.text}
          </span>
          <button
            className="editor-save"
            onClick={onSave}
            disabled={!dirty || !cities || !links}
          >
            Save
          </button>
        </div>
      </header>

      <main className="editor-main">
        <section className="editor-board-wrap">
          {cities && links ? (
            <BoardEditor
              cities={cities}
              links={links}
              mode={mode}
              selectedCity={selectedCity}
              selectedMerchant={selectedMerchant}
              selectedLink={selectedLink}
              pendingLinkStart={pendingLinkStart}
              onUpdateCities={updateCities}
              onUpdateLinks={updateLinks}
              onSelectCity={(name) => {
                setSelectedCity(name);
                setSelectedMerchant(null);
                setSelectedLink(null);
              }}
              onSelectMerchant={(name) => {
                setSelectedMerchant(name);
                setSelectedCity(null);
                setSelectedLink(null);
              }}
              onSelectLink={(sel) => {
                setSelectedLink(sel);
                setSelectedCity(null);
                setSelectedMerchant(null);
              }}
              setPendingLinkStart={setPendingLinkStart}
            />
          ) : (
            <div className="editor-loading">Loading…</div>
          )}
        </section>

        <aside className="editor-side">
          {cities && mode === "cities" && selectedCity ? (
            <CityForm
              cities={cities}
              cityName={selectedCity}
              cityNames={cityNames}
              onChange={updateCities}
              onRename={(next) => setSelectedCity(next)}
              onClose={() => setSelectedCity(null)}
              onDelete={() => {
                const cleaned = withCityDeleted(cities, selectedCity);
                updateCities(cleaned.cities);
                if (links) {
                  const nextLinks = withCityRemovedFromLinks(
                    links,
                    selectedCity,
                  );
                  if (nextLinks) updateLinks(nextLinks);
                }
                setSelectedCity(null);
              }}
            />
          ) : null}

          {cities && mode === "cities" && !selectedCity ? (
            <CitiesIndex
              cities={cities}
              onPick={(name) => setSelectedCity(name)}
              onAdd={() => {
                const next = withCityAdded(cities);
                updateCities(next.cities);
                setSelectedCity(next.newName);
              }}
            />
          ) : null}

          {cities && mode === "merchants" && selectedMerchant ? (
            <MerchantForm
              cities={cities}
              merchantName={selectedMerchant}
              cityNames={cityNames}
              onChange={updateCities}
              onRename={(next) => setSelectedMerchant(next)}
              onClose={() => setSelectedMerchant(null)}
              onDelete={() => {
                const cleaned = withMerchantDeleted(cities, selectedMerchant);
                updateCities(cleaned);
                if (links) {
                  const nextLinks = withCityRemovedFromLinks(
                    links,
                    selectedMerchant,
                  );
                  if (nextLinks) updateLinks(nextLinks);
                }
                setSelectedMerchant(null);
              }}
            />
          ) : null}

          {cities && mode === "merchants" && !selectedMerchant ? (
            <MerchantsIndex
              cities={cities}
              onPick={(name) => setSelectedMerchant(name)}
              onAdd={() => {
                const next = withMerchantAdded(cities);
                updateCities(next.cities);
                setSelectedMerchant(next.newName);
              }}
            />
          ) : null}

          {links && (mode === "canal" || mode === "rail") ? (
            <LinksList
              links={links}
              era={mode}
              selectedLink={selectedLink}
              pendingLinkStart={pendingLinkStart}
              cityNames={cityNames}
              onChange={updateLinks}
              onSelectLink={(sel) => {
                setSelectedLink(sel);
              }}
              onClearPending={() => setPendingLinkStart(null)}
            />
          ) : null}
        </aside>
      </main>
    </div>
  );
}

function tabLabel(m: EditorMode): string {
  switch (m) {
    case "cities":
      return "Cities";
    case "merchants":
      return "Merchants";
    case "canal":
      return "Canal Links";
    case "rail":
      return "Rail Links";
  }
}

function CitiesIndex({
  cities,
  onPick,
  onAdd,
}: {
  cities: CitiesConfigRaw;
  onPick: (name: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="editor-side__inner">
      <h2>Cities</h2>
      <p className="editor-help">
        Drag a rectangle to reposition (snaps to multiples of 5). Click
        a city to edit its name, district, and slots.
      </p>
      <ul className="editor-list">
        {cities.cities.map((c) => (
          <li key={c.name}>
            <button onClick={() => onPick(c.name)}>{c.name}</button>
            <span className="editor-list__sub">
              {c.district}
              {c.farmBrewery ? " · farm" : ""} · {c.slots.length} slot
              {c.slots.length === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      <button className="editor-add" onClick={onAdd}>
        + Add city
      </button>
    </div>
  );
}

function MerchantsIndex({
  cities,
  onPick,
  onAdd,
}: {
  cities: CitiesConfigRaw;
  onPick: (name: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="editor-side__inner">
      <h2>Merchant cities</h2>
      <p className="editor-help">
        Drag to reposition (snaps to 5). Click to edit bonus, slots,
        and active player counts.
      </p>
      <ul className="editor-list">
        {cities.merchantCities.map((m) => (
          <li key={m.name}>
            <button onClick={() => onPick(m.name)}>{m.name}</button>
            <span className="editor-list__sub">
              {m.bonus} {m.bonusValue} · {m.slots} slot
              {m.slots === 1 ? "" : "s"} · {m.activePlayerCounts.join("/")}p
            </span>
          </li>
        ))}
      </ul>
      <button className="editor-add" onClick={onAdd}>
        + Add merchant
      </button>
    </div>
  );
}

function withCityAdded(c: CitiesConfigRaw): {
  cities: CitiesConfigRaw;
  newName: string;
} {
  let i = 1;
  let name = "New city";
  const taken = new Set(c.cities.map((x) => x.name));
  while (taken.has(name)) {
    i += 1;
    name = `New city ${i}`;
  }
  const next: CitiesConfigRaw = {
    ...c,
    cities: [
      ...c.cities,
      {
        name,
        district: "purple",
        position: [450, 450],
        slots: ["ANY"],
      },
    ],
  };
  return { cities: next, newName: name };
}

function withMerchantAdded(c: CitiesConfigRaw): {
  cities: CitiesConfigRaw;
  newName: string;
} {
  let i = 1;
  let name = "New merchant";
  const taken = new Set(c.merchantCities.map((x) => x.name));
  while (taken.has(name)) {
    i += 1;
    name = `New merchant ${i}`;
  }
  const next: CitiesConfigRaw = {
    ...c,
    merchantCities: [
      ...c.merchantCities,
      {
        name,
        position: [450, 100],
        slots: 1,
        bonus: "VP",
        bonusValue: 4,
        linkPoints: 2,
        activePlayerCounts: [2, 3, 4],
      },
    ],
  };
  return { cities: next, newName: name };
}

function withCityDeleted(
  c: CitiesConfigRaw,
  name: string,
): { cities: CitiesConfigRaw } {
  return {
    cities: { ...c, cities: c.cities.filter((x) => x.name !== name) },
  };
}

function withMerchantDeleted(
  c: CitiesConfigRaw,
  name: string,
): CitiesConfigRaw {
  return {
    ...c,
    merchantCities: c.merchantCities.filter((x) => x.name !== name),
  };
}

function withCityRemovedFromLinks(
  l: LinksConfigRaw,
  name: string,
): LinksConfigRaw | null {
  let touched = false;
  const filterLinks = (arr: string[][]) =>
    arr
      .map((endpoints) => {
        if (!endpoints.includes(name)) return endpoints;
        touched = true;
        return endpoints.filter((e) => e !== name);
      })
      .filter((endpoints) => endpoints.length >= 2);
  const next: LinksConfigRaw = {
    ...l,
    canal: filterLinks(l.canal),
    rail: filterLinks(l.rail),
  };
  return touched ? next : null;
}
