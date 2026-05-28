export type VaultState =
  | "Funding"
  | "Active"
  | "Matured"
  | "Closed"
  | "Cancelled";

export interface Vault {
  id: number;
  contractId: string;
  factoryId: string | null;
  asset: string;
  name: string | null;
  symbol: string | null;
  state: VaultState;
  totalAssets: string;
  totalSupply: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: number;
  address: string;
  kycVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserVaultPosition {
  id: number;
  userAddress: string;
  vaultId: number;
  shares: string;
  deposited: string;
  lastClaimedEpoch: number;
  updatedAt: Date;
}

export interface UserPortfolioResponse {
  positions: UserVaultPosition[];
  totalDeposited: string;
}

export interface Epoch {
  id: number;
  vaultId: number;
  epoch: number;
  yieldAmount: string;
  totalShares: string;
  distributedAt: Date | null;
}

export interface IndexedEvent {
  id: number;
  ledger: number;
  txHash: string;
  contractId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
