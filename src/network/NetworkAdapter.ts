import type { Engine } from "../engine/Engine";
import type { Intent } from "../engine/types";
import type { Transport } from "./Transport";

export class NetworkAdapter {
  private readonly unsubscribe: () => void;

  constructor(
    private readonly engine: Engine,
    private readonly transport: Transport,
  ) {
    this.unsubscribe = transport.onReceive((intent) => {
      engine.dispatch(intent);
    });
  }

  send = (intent: Intent): void => {
    this.transport.send(intent);
  };

  destroy = (): void => {
    this.unsubscribe();
  };
}
