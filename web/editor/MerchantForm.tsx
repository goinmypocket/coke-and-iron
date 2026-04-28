import { useMemo } from "react";
import {
  MERCHANT_BONUSES,
  type CitiesConfigRaw,
  type MerchantBonus,
  type MerchantCityRaw,
  type PlayerCount,
} from "./types";

const PLAYER_COUNTS: PlayerCount[] = [2, 3, 4];

export function MerchantForm({
  cities,
  merchantName,
  cityNames,
  onChange,
  onRename,
  onClose,
  onDelete,
}: {
  cities: CitiesConfigRaw;
  merchantName: string;
  cityNames: ReadonlySet<string>;
  onChange: (next: CitiesConfigRaw) => void;
  onRename: (next: string) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const merchant = useMemo(
    () => cities.merchantCities.find((m) => m.name === merchantName) ?? null,
    [cities.merchantCities, merchantName],
  );

  if (!merchant) {
    return (
      <div className="editor-side__inner">
        <p>Merchant not found.</p>
      </div>
    );
  }

  const update = (mutate: (m: MerchantCityRaw) => MerchantCityRaw) => {
    onChange({
      ...cities,
      merchantCities: cities.merchantCities.map((m) =>
        m.name === merchantName ? mutate(m) : m,
      ),
    });
  };

  const renameTo = (next: string) => {
    if (next === merchantName) return;
    if (next.length === 0 || cityNames.has(next)) return;
    onChange({
      ...cities,
      merchantCities: cities.merchantCities.map((m) =>
        m.name === merchantName ? { ...m, name: next } : m,
      ),
    });
    onRename(next);
  };

  const setBonus = (b: MerchantBonus) => update((m) => ({ ...m, bonus: b }));
  const setBonusValue = (v: number) => update((m) => ({ ...m, bonusValue: v }));
  const setSlots = (s: 1 | 2) => update((m) => ({ ...m, slots: s }));
  const setPosition = (idx: 0 | 1, value: number) =>
    update((m) => {
      const next = [...m.position] as [number, number];
      next[idx] = value;
      return { ...m, position: next };
    });
  const togglePlayerCount = (pc: PlayerCount) =>
    update((m) => {
      const has = m.activePlayerCounts.includes(pc);
      const next = has
        ? m.activePlayerCounts.filter((x) => x !== pc)
        : [...m.activePlayerCounts, pc].sort();
      return { ...m, activePlayerCounts: next };
    });

  return (
    <div className="editor-side__inner">
      <div className="editor-side__head">
        <button
          className="editor-back"
          onClick={onClose}
          title="Back to merchant list"
        >
          ↑ Back
        </button>
        <h2>{merchant.name}</h2>
      </div>

      <label className="editor-field">
        <span>Name</span>
        <input
          type="text"
          defaultValue={merchant.name}
          onBlur={(e) => renameTo(e.currentTarget.value.trim())}
        />
      </label>

      <fieldset className="editor-field">
        <legend>Position</legend>
        <div className="editor-pos">
          <label>
            x
            <input
              type="number"
              step={5}
              value={merchant.position[0]}
              onChange={(e) =>
                setPosition(0, Number(e.currentTarget.value) || 0)
              }
            />
          </label>
          <label>
            y
            <input
              type="number"
              step={5}
              value={merchant.position[1]}
              onChange={(e) =>
                setPosition(1, Number(e.currentTarget.value) || 0)
              }
            />
          </label>
        </div>
      </fieldset>

      <label className="editor-field">
        <span>Bonus type</span>
        <select
          value={merchant.bonus}
          onChange={(e) => setBonus(e.currentTarget.value as MerchantBonus)}
        >
          {MERCHANT_BONUSES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>

      <label className="editor-field">
        <span>Bonus value</span>
        <input
          type="number"
          value={merchant.bonusValue}
          onChange={(e) => setBonusValue(Number(e.currentTarget.value) || 0)}
        />
      </label>

      <label className="editor-field">
        <span>Slot count</span>
        <select
          value={merchant.slots}
          onChange={(e) =>
            setSlots(Number(e.currentTarget.value) === 2 ? 2 : 1)
          }
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </label>

      <fieldset className="editor-field">
        <legend>Active for player counts</legend>
        <div className="editor-checks">
          {PLAYER_COUNTS.map((pc) => (
            <label key={pc} className="editor-field--inline">
              <input
                type="checkbox"
                checked={merchant.activePlayerCounts.includes(pc)}
                onChange={() => togglePlayerCount(pc)}
              />
              <span>{pc}p</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="editor-help">
        linkPoints is fixed at 2 per the published spec.
      </p>

      <button className="editor-danger" onClick={onDelete}>
        Delete merchant
      </button>
    </div>
  );
}
