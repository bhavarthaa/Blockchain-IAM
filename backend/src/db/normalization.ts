const HEX_ADDRESS = /^0x[0-9a-f]{40}$/;
const HEX_32_BYTES = /^0x[0-9a-f]{64}$/;

export function normalizeWalletAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!HEX_ADDRESS.test(normalized)) {
    throw new Error("Wallet address must be a 20-byte lowercase hexadecimal value");
  }
  return normalized;
}

export function normalizeBytes32(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!HEX_32_BYTES.test(normalized)) {
    throw new Error("Value must be a 32-byte lowercase hexadecimal value");
  }
  return normalized;
}
