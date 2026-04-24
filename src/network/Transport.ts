import type { Intent } from "../engine/types";

export interface Transport {
  send(intent: Intent): void;
  onReceive(cb: (intent: Intent) => void): () => void;
}
