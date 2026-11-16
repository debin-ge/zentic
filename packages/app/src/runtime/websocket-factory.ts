import { nativeWebSocketFactory } from "@getzentic/client/internal/daemon-client-websocket-transport";
import type { WebSocketFactory } from "@getzentic/client/internal/daemon-client-transport-types";

export function createAppWebSocketFactory(): WebSocketFactory {
  return nativeWebSocketFactory;
}
