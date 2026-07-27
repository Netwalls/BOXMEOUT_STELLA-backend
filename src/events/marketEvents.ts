import { EventEmitter } from "events";

export type MarketEventType = "bet_placed" | "market_resolved";

export interface MarketEventPayload {
  marketId: string;
  type: MarketEventType;
  data: Record<string, unknown>;
}

// Shared bus: indexer event handlers publish here, and the SSE endpoint
// subscribes per marketId — both sides consume the same event stream.
export const marketEventBus = new EventEmitter();
marketEventBus.setMaxListeners(0);

function channel(marketId: string): string {
  return `market:${marketId}`;
}

export function publishMarketEvent(
  marketId: string,
  type: MarketEventType,
  data: Record<string, unknown>,
): void {
  const payload: MarketEventPayload = { marketId, type, data };
  marketEventBus.emit(channel(marketId), payload);
}

export function subscribeToMarket(
  marketId: string,
  listener: (payload: MarketEventPayload) => void,
): () => void {
  marketEventBus.on(channel(marketId), listener);
  return () => marketEventBus.off(channel(marketId), listener);
}
