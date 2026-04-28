import type { Intent } from "../../engine/types";
import type { Transport } from "./Transport";

export class LoopbackTransport implements Transport {
  private readonly receivers = new Set<(intent: Intent) => void>();

  send = (intent: Intent): void => {
    for (const cb of this.receivers) cb(intent);
  };

  onReceive = (cb: (intent: Intent) => void): (() => void) => {
    this.receivers.add(cb);
    return () => {
      this.receivers.delete(cb);
    };
  };
}
