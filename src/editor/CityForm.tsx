import { useMemo } from "react";
import {
  DISTRICT_TAGS,
  INDUSTRY_LABEL,
  INDUSTRY_NAMES,
  acceptListToSlot,
  slotAcceptList,
  type CitiesConfigRaw,
  type CityRaw,
  type DistrictTag,
  type IndustryName,
  type RawSlot,
} from "./types";

export function CityForm({
  cities,
  cityName,
  cityNames,
  onChange,
  onRename,
  onClose,
  onDelete,
}: {
  cities: CitiesConfigRaw;
  cityName: string;
  cityNames: ReadonlySet<string>;
  onChange: (next: CitiesConfigRaw) => void;
  onRename: (next: string) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const city = useMemo(
    () => cities.cities.find((c) => c.name === cityName) ?? null,
    [cities.cities, cityName],
  );

  if (!city) {
    return (
      <div className="editor-side__inner">
        <p>City not found.</p>
      </div>
    );
  }

  const updateCity = (mutate: (c: CityRaw) => CityRaw) => {
    onChange({
      ...cities,
      cities: cities.cities.map((c) => (c.name === cityName ? mutate(c) : c)),
    });
  };

  const renameTo = (next: string) => {
    if (next === cityName) return;
    if (next.length === 0 || cityNames.has(next)) return;
    onChange({
      ...cities,
      cities: cities.cities.map((c) =>
        c.name === cityName ? { ...c, name: next } : c,
      ),
    });
    onRename(next);
  };

  const setDistrict = (d: DistrictTag) => updateCity((c) => ({ ...c, district: d }));
  const setFarmBrewery = (v: boolean) =>
    updateCity((c) => {
      if (v) return { ...c, farmBrewery: true };
      const { farmBrewery: _drop, ...rest } = c;
      return rest as CityRaw;
    });
  const setPosition = (idx: 0 | 1, value: number) =>
    updateCity((c) => {
      const next = [...c.position] as [number, number];
      next[idx] = value;
      return { ...c, position: next };
    });

  const updateSlot = (i: number, slot: RawSlot) =>
    updateCity((c) => ({
      ...c,
      slots: c.slots.map((s, j) => (i === j ? slot : s)),
    }));
  const addSlot = () =>
    updateCity((c) => ({ ...c, slots: [...c.slots, "ANY"] }));
  const removeSlot = (i: number) =>
    updateCity((c) => ({
      ...c,
      slots: c.slots.filter((_, j) => j !== i),
    }));
  const moveSlot = (i: number, dir: -1 | 1) =>
    updateCity((c) => {
      const j = i + dir;
      if (j < 0 || j >= c.slots.length) return c;
      const next = [...c.slots];
      const tmp = next[i]!;
      next[i] = next[j]!;
      next[j] = tmp;
      return { ...c, slots: next };
    });

  return (
    <div className="editor-side__inner">
      <div className="editor-side__head">
        <button
          className="editor-back"
          onClick={onClose}
          title="Back to city list"
        >
          ↑ Back
        </button>
        <h2>{city.name}</h2>
      </div>

      <label className="editor-field">
        <span>Name</span>
        <input
          type="text"
          defaultValue={city.name}
          onBlur={(e) => renameTo(e.currentTarget.value.trim())}
        />
      </label>

      <label className="editor-field">
        <span>District</span>
        <select
          value={city.district}
          onChange={(e) => setDistrict(e.currentTarget.value as DistrictTag)}
        >
          {DISTRICT_TAGS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <label className="editor-field editor-field--inline">
        <input
          type="checkbox"
          checked={city.farmBrewery === true}
          onChange={(e) => setFarmBrewery(e.currentTarget.checked)}
        />
        <span>Farm Brewery</span>
      </label>

      <fieldset className="editor-field">
        <legend>Position</legend>
        <div className="editor-pos">
          <label>
            x
            <input
              type="number"
              step={5}
              value={city.position[0]}
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
              value={city.position[1]}
              onChange={(e) =>
                setPosition(1, Number(e.currentTarget.value) || 0)
              }
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="editor-field">
        <legend>Slots ({city.slots.length})</legend>
        <ul className="editor-slots">
          {city.slots.map((slot, i) => (
            <SlotEditor
              key={i}
              index={i}
              slot={slot}
              count={city.slots.length}
              onChange={(s) => updateSlot(i, s)}
              onRemove={() => removeSlot(i)}
              onMoveUp={() => moveSlot(i, -1)}
              onMoveDown={() => moveSlot(i, 1)}
            />
          ))}
        </ul>
        <button className="editor-add" onClick={addSlot}>
          + Add slot
        </button>
      </fieldset>

      <button className="editor-danger" onClick={onDelete}>
        Delete city
      </button>
    </div>
  );
}

function SlotEditor({
  index,
  slot,
  count,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  slot: RawSlot;
  count: number;
  onChange: (s: RawSlot) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const accept = slotAcceptList(slot);
  const isAny = accept.length === 0;
  const toggle = (ind: IndustryName) => {
    if (isAny) {
      onChange(acceptListToSlot([ind]));
      return;
    }
    const next = accept.includes(ind)
      ? accept.filter((x) => x !== ind)
      : [...accept, ind];
    if (next.length === 0) {
      // Empty multi-select would be invalid; treat as ANY.
      onChange("ANY");
      return;
    }
    onChange(acceptListToSlot(next));
  };
  return (
    <li className="editor-slot">
      <div className="editor-slot__head">
        <span>#{index + 1}</span>
        <div className="editor-slot__buttons">
          <button onClick={onMoveUp} disabled={index === 0} title="Move up">
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === count - 1}
            title="Move down"
          >
            ↓
          </button>
          <button onClick={onRemove} title="Remove slot">
            ✕
          </button>
        </div>
      </div>
      <label className="editor-field--inline">
        <input
          type="checkbox"
          checked={isAny}
          onChange={(e) => onChange(e.currentTarget.checked ? "ANY" : "COAL_MINE")}
        />
        <span>ANY (wildcard)</span>
      </label>
      {!isAny ? (
        <div className="editor-slot__industries">
          {INDUSTRY_NAMES.map((ind) => (
            <label key={ind}>
              <input
                type="checkbox"
                checked={accept.includes(ind)}
                onChange={() => toggle(ind)}
              />
              <span>{INDUSTRY_LABEL[ind]}</span>
            </label>
          ))}
        </div>
      ) : null}
    </li>
  );
}
