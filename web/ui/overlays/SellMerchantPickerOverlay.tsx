import { Modal } from "./Modal";
import { usePaused } from "../hooks/EngineProvider";
// =============================================================================
// §5.4 Sell merchant picker — surfaces when a Sell submit hits a tile
// with 2+ valid merchant slots (matching accept-list AND reachable
// through the developed-link graph). One row per ambiguous tile, one
// button per option labelled with the merchant's bonus and the slot's
// beer-barrel state. The wizard auto-advances after the last pick.
// =============================================================================

import { useMemo } from "react";
import type {
  GameState,
  IndustryName,
  MerchantBonus,
  MerchantCity,
  MerchantSlot,
  PlacedIndustryTile,
} from "../../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { INDUSTRY_LABEL } from "../industryIcons";
import { useWizard } from "../wizards/WizardProvider";

export function SellMerchantPickerOverlay() {
  const wizard = useWizard();
  const view = useGameState(
    (s) => ({
      builtTiles: s.builtTiles,
      tileCatalogue: s.tileCatalogue,
      merchantSlots: s.merchantSlots,
      merchantCities: s.merchantCities,
    }),
    shallowEqual,
  );

  if (wizard.state.phase !== "AWAITING_SELL_MERCHANT_CHOICE") return null;
  const choices = wizard.state.choices;

  return (
    <Modal className="picker-overlay" label="Choose merchants" onClose={wizard.reset}>
        <header className="picker-overlay__title">
          Pick a merchant per tile
        </header>
        <p className="picker-overlay__lead">
          Each tile reaches multiple merchants — choose which one to sell
          to. The bonus and beer-barrel state of each option are shown.
        </p>
        <ul className="picker-overlay__sources">
          {choices.map((choice) => (
            <ChoiceRow
              key={choice.tileId}
              tileId={choice.tileId}
              chosen={choice.chosen}
              options={choice.options}
              view={view}
              onPick={(opt) => wizard.pickSellMerchant(choice.tileId, opt)}
            />
          ))}
        </ul>
        <div className="picker-overlay__buttons">
          <button
            type="button"
            className="action-btn"
            onClick={() => wizard.reset()}
          >
            Cancel sell
          </button>
        </div>
    </Modal>
  );
}

function ChoiceRow({
  tileId,
  chosen,
  options,
  view,
  onPick,
}: {
  tileId: string;
  chosen: { merchantCityName: string; merchantSlotIndex: number } | null;
  options: readonly { merchantCityName: string; merchantSlotIndex: number }[];
  view: {
    builtTiles: readonly PlacedIndustryTile[];
    tileCatalogue: GameState["tileCatalogue"];
    merchantSlots: readonly MerchantSlot[];
    merchantCities: readonly MerchantCity[];
  };
  onPick: (opt: { merchantCityName: string; merchantSlotIndex: number }) => void;
}) {
  const paused = usePaused();
  const tile = useMemo(
    () => view.builtTiles.find((t) => t.id === tileId) ?? null,
    [view.builtTiles, tileId],
  );
  const spec = tile ? view.tileCatalogue[tile.catalogueIndex] : null;
  const tileLabel = describeTile(tile, spec?.industry, spec?.level);

  return (
    <li className="picker-overlay__section">
      <div className="merchant-pick-row__tile">{tileLabel}</div>
      <div className="merchant-pick-row__options">
        {options.map((opt) => {
          const slot = view.merchantSlots.find(
            (ms) =>
              ms.merchantCityName === opt.merchantCityName &&
              ms.slotIndex === opt.merchantSlotIndex,
          );
          const city = view.merchantCities.find(
            (m) => m.name === opt.merchantCityName,
          );
          const isChosen =
            chosen?.merchantCityName === opt.merchantCityName &&
            chosen.merchantSlotIndex === opt.merchantSlotIndex;
          return (
            <button
              key={`${opt.merchantCityName}#${opt.merchantSlotIndex}`}
              className={
                "merchant-pick-btn" +
                (isChosen ? " merchant-pick-btn--chosen" : "")
              }
              onClick={() => onPick(opt)}
              disabled={paused || chosen !== null}
            >
              <strong>{opt.merchantCityName}</strong>
              <span className="merchant-pick-btn__sub">
                {city ? `${prettyBonus(city.bonus)} ${city.bonusValue}` : ""}
                {slot?.hasBeer ? " · beer" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

function describeTile(
  tile: PlacedIndustryTile | null,
  industry: IndustryName | undefined,
  level: number | undefined,
): string {
  if (!tile || !industry || level === undefined) return "Tile";
  return `${INDUSTRY_LABEL[industry]} L${level} @ ${tile.cityName}`;
}

function prettyBonus(b: MerchantBonus): string {
  switch (b) {
    case "VP":
      return "VP";
    case "INCOME":
      return "Income";
    case "MONEY":
      return "Money";
    case "DEVELOP":
      return "Develop";
  }
}
