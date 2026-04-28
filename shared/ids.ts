// =============================================================================
// VENDORED from the In My Pocket platform — keep in sync with
// ../in-my-pocket/shared/ids.ts. Once the platform publishes its
// `shared/` types as an npm package, swap this folder for a
// dependency on that package.
// =============================================================================

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type UserId = Brand<string, "UserId">;
export type TableId = Brand<string, "TableId">;
export type GameId = Brand<string, "GameId">;
export type SaveId = Brand<string, "SaveId">;

export const asUserId = (s: string): UserId => s as UserId;
export const asTableId = (s: string): TableId => s as TableId;
export const asGameId = (s: string): GameId => s as GameId;
export const asSaveId = (s: string): SaveId => s as SaveId;
