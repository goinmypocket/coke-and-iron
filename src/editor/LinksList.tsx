import { useMemo, useState } from "react";
import type { LinkEra, LinksConfigRaw } from "./types";

export function LinksList({
  links,
  era,
  selectedLink,
  pendingLinkStart,
  cityNames,
  onChange,
  onSelectLink,
  onClearPending,
}: {
  links: LinksConfigRaw;
  era: LinkEra;
  selectedLink: { era: LinkEra; index: number } | null;
  pendingLinkStart: string | null;
  cityNames: ReadonlySet<string>;
  onChange: (next: LinksConfigRaw) => void;
  onSelectLink: (sel: { era: LinkEra; index: number } | null) => void;
  onClearPending: () => void;
}) {
  const arr = links[era];
  const sortedNames = useMemo(
    () => [...cityNames].sort((a, b) => a.localeCompare(b)),
    [cityNames],
  );

  const removeLink = (index: number) => {
    onChange({ ...links, [era]: arr.filter((_, i) => i !== index) });
    if (selectedLink && selectedLink.era === era && selectedLink.index === index) {
      onSelectLink(null);
    }
  };

  const addEndpoint = (index: number, name: string) => {
    if (!cityNames.has(name)) return;
    const link = arr[index];
    if (!link) return;
    if (link.includes(name)) return;
    if (link.length >= 3) return; // triple is the maximum
    const next = arr.map((l, i) =>
      i === index ? [...l, name] : l,
    );
    onChange({ ...links, [era]: next });
  };

  const removeEndpoint = (index: number, name: string) => {
    const link = arr[index];
    if (!link) return;
    if (link.length <= 2) return;
    const next = arr.map((l, i) =>
      i === index ? l.filter((e) => e !== name) : l,
    );
    onChange({ ...links, [era]: next });
  };

  return (
    <div className="editor-side__inner">
      <h2>{era === "canal" ? "Canal links" : "Rail links"}</h2>
      <p className="editor-help">
        Click a city on the board to start a link, then click another to
        add it. Click an existing line to select it for editing or
        deletion below.
      </p>
      {pendingLinkStart ? (
        <div className="editor-pending">
          Linking from <strong>{pendingLinkStart}</strong> —
          <button onClick={onClearPending}>cancel</button>
        </div>
      ) : null}

      {selectedLink && selectedLink.era === era ? (
        <SelectedLinkPanel
          link={arr[selectedLink.index]}
          index={selectedLink.index}
          sortedNames={sortedNames}
          onRemove={() => removeLink(selectedLink.index)}
          onAddEndpoint={(name) => addEndpoint(selectedLink.index, name)}
          onRemoveEndpoint={(name) => removeEndpoint(selectedLink.index, name)}
          onClose={() => onSelectLink(null)}
        />
      ) : null}

      <ul className="editor-link-list">
        {arr.map((endpoints, i) => {
          const isSelected =
            selectedLink && selectedLink.era === era && selectedLink.index === i;
          return (
            <li
              key={i}
              className={
                "editor-link-item" +
                (isSelected ? " editor-link-item--selected" : "")
              }
            >
              <button
                className="editor-link-item__pick"
                onClick={() => onSelectLink({ era, index: i })}
              >
                {endpoints.join(" – ")}
              </button>
              <button
                className="editor-link-item__del"
                onClick={() => removeLink(i)}
                title="Delete link"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <p className="editor-help">
        Total {era}: {arr.length}
      </p>
    </div>
  );
}

function SelectedLinkPanel({
  link,
  index,
  sortedNames,
  onRemove,
  onAddEndpoint,
  onRemoveEndpoint,
  onClose,
}: {
  link: string[] | undefined;
  index: number;
  sortedNames: string[];
  onRemove: () => void;
  onAddEndpoint: (name: string) => void;
  onRemoveEndpoint: (name: string) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState("");

  if (!link) {
    return (
      <div className="editor-link-detail">
        Selected link no longer exists.
        <button onClick={onClose}>Close</button>
      </div>
    );
  }

  const candidates = sortedNames.filter((n) => !link.includes(n));

  return (
    <div className="editor-link-detail">
      <div className="editor-side__head">
        <button className="editor-back" onClick={onClose}>
          ↑ Back
        </button>
        <h3>Link #{index + 1}</h3>
      </div>
      <ul className="editor-endpoint-list">
        {link.map((name) => (
          <li key={name}>
            {name}
            {link.length > 2 ? (
              <button
                onClick={() => onRemoveEndpoint(name)}
                title="Remove from this link"
              >
                ✕
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {link.length < 3 ? (
        <div className="editor-endpoint-add">
          <select value={pick} onChange={(e) => setPick(e.currentTarget.value)}>
            <option value="">Add 3rd endpoint…</option>
            {candidates.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            disabled={!pick}
            onClick={() => {
              if (pick) onAddEndpoint(pick);
              setPick("");
            }}
          >
            Add
          </button>
        </div>
      ) : (
        <p className="editor-help">Triple link maxed.</p>
      )}
      <button className="editor-danger" onClick={onRemove}>
        Delete link
      </button>
    </div>
  );
}
