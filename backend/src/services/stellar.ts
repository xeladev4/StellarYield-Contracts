import { SorobanRpc } from "@stellar/stellar-sdk";
import { config } from "../config.js";

export function getSorobanRpc(): SorobanRpc.Server {
  return new SorobanRpc.Server(config.stellar.rpcUrl);
}
