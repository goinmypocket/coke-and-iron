# Brass Birmingham

A digital web implementation of Brass Birmingham, built from a
platform-agnostic spec at `docs/game-spec.md`.

## Run

```
npm install
npm run dev
```

Open http://localhost:5173.

## Test

```
npm test
```

## Architecture

- `src/engine/` — pure TypeScript rules core (no React imports).
- `src/ui/` — React presentation: panels, wizards, affordances.
- `src/network/` — swappable transports (loopback default).
- `config/` — tunable data per `docs/game-spec.md` §9.
- `docs/game-spec.md` — authoritative spec. Source of truth for
  rules, entities, configs, and UI inventory.

See `docs/game-spec.md` for the full rules and panel inventory.
