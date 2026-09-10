export type Envelope<T> = { data: T; meta?: { requestId?: string; chainId?: number; lastIndexedBlock?: string; freshness?: string } };
export type Identity = {
  did: string; status: "ACTIVE" | "REVOKED"; roleCode?: number; documentHash?: string;
  wallet?: { address: string } | string; createdAt?: string; lastChainBlock?: string | number;
};
export type Asset = {
  tokenId: string | number | bigint; status: "ACTIVE" | "BURNED"; metadataUri: string;
  assetType?: "DIGITAL" | "PHYSICAL"; createdAt?: string; updatedAt?: string;
  currentOwner?: { address: string } | null;
};
export type AuditEvent = { id: string; action: string; actorAddress?: string; targetDid?: string; blockNumber?: string | number; occurredAt?: string; status?: string; transactionId?: string };
export type Transaction = { txHash: string; status: string; errorMessage?: string; submittedAt?: string; confirmedAt?: string; blockNumber?: string | number; events?: Array<{ eventName: string; status: string; blockNumber: string | number }> };
export type Permission = { key?: string; name?: string; description?: string; roles?: Array<{ enabled: boolean; role?: { name: string } }> };
export type Role = { name: string; displayName?: string; permissions?: Array<{ enabled: boolean; permission: Permission }>; _count?: { assignments: number } };
