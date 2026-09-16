"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { useRouter } from "next/navigation";
import { api, type ApiError } from "../../lib/api";
import { WalletControl } from "../../components/wallet-control";

const DEMO_STEPS = [
  { id: "connect", label: "1. Connect Wallet", description: "Connect admin wallet (Hardhat account #0)" },
  { id: "identity", label: "2. Create Identity", description: "Register on-chain identity with DID" },
  { id: "role", label: "3. Assign Role", description: "Assign ADMIN role to wallet" },
  { id: "mint", label: "4. Mint Asset", description: "Mint a new NFT asset" },
  { id: "assign", label: "5. Assign Asset", description: "Assign asset to user wallet" },
  { id: "verify", label: "6. Verify Ownership", description: "Verify asset ownership on-chain" },
  { id: "audit", label: "7. View Audit Trail", description: "Show immutable audit history" },
  { id: "transfer", label: "8. Transfer Asset", description: "Transfer asset between wallets" },
  { id: "revoke", label: "9. Revoke Permission", description: "Revoke transfer permission" },
  { id: "reject", label: "10. Reject Unauthorized", description: "Verify rejection after revocation" },
] as const;

type DemoStepId = typeof DEMO_STEPS[number]["id"];

interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message: string;
  txHash?: string;
}

interface TransactionStatus {
  step: DemoStepId;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

export default function DemoPage() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  const [currentStep, setCurrentStep] = useState<DemoStepId>("connect");
  const [completedSteps, setCompletedSteps] = useState<Set<DemoStepId>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [txStatuses, setTxStatuses] = useState<Record<DemoStepId, TransactionStatus>>({} as any);
  const [isLoading, setIsLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoStatus, setDemoStatus] = useState<any>(null);

  // Check if we're in demo mode on load
  useEffect(() => {
    checkDemoMode();
  }, []);

  const checkDemoMode = async () => {
    try {
      const res = await fetch("/api/v1/demo/status");
      if (res.ok) {
        const data = await res.json();
        setDemoMode(data.demoMode);
        setDemoStatus(data);
      }
    } catch (e) {
      console.log("Demo mode not available");
    }
  };

  const showToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 8000);
  }, []);

  const updateTxStatus = useCallback((step: DemoStepId, status: TransactionStatus) => {
    setTxStatuses((prev) => ({ ...prev, [step]: status }));
  }, []);

  const markComplete = useCallback((step: DemoStepId) => {
    setCompletedSteps((prev) => new Set(prev).add(step));
    const nextIndex = DEMO_STEPS.findIndex((s) => s.id === step) + 1;
    if (nextIndex < DEMO_STEPS.length) {
      setCurrentStep(DEMO_STEPS[nextIndex].id);
    }
  }, []);

  const handleDemoAction = async (step: DemoStepId) => {
    setIsLoading(true);
    updateTxStatus(step, { step, status: "pending" });

    try {
      switch (step) {
        case "connect":
          if (!isConnected) {
            await connect({ connector: connectors[0] });
            showToast({ type: "success", title: "Wallet Connected", message: `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}` });
          }
          break;

        case "identity":
          await createIdentity();
          break;

        case "role":
          await assignRole();
          break;

        case "mint":
          await mintAsset();
          break;

        case "assign":
          await assignAsset();
          break;

        case "verify":
          await verifyAsset();
          break;

        case "audit":
          await viewAuditTrail();
          break;

        case "transfer":
          await transferAsset();
          break;

        case "revoke":
          await revokePermission();
          break;

        case "reject":
          await testRejection();
          break;
      }

      updateTxStatus(step, { step, status: "confirmed" });
      markComplete(step);
      showToast({ type: "success", title: DEMO_STEPS.find(s => s.id === step)?.label ?? "Done", message: "Completed successfully" });

    } catch (error: any) {
      updateTxStatus(step, { step, status: "failed" });
      const message = error?.response?.data?.message || error?.message || "Unknown error";
      showToast({ type: "error", title: "Failed", message });
    } finally {
      setIsLoading(false);
    }
  };

  const createIdentity = async () => {
    if (!address) throw new Error("Wallet not connected");
      const res = await api<{ did: string; txHash?: string }>("/identities", { method: "POST", body: JSON.stringify({ did: `did:example:${address.toLowerCase().slice(2)}`, didKey: address }) });
    showToast({ type: "info", title: "Identity Created", message: `DID: ${res.data.did}`, txHash: res.data.txHash });
  };

  const assignRole = async () => {
    if (!address) throw new Error("Wallet not connected");
      const res = await api<{ txHash?: string }>("/wallets/roles", { method: "POST", body: JSON.stringify({ walletAddress: address, roleCode: "ADMIN" }) });
    showToast({ type: "info", title: "Role Assigned", message: "ADMIN role granted", txHash: res.data.txHash });
  };

  const mintAsset = async () => {
    if (!address) throw new Error("Wallet not connected");
      const res = await api<{ tokenId: string; txHash?: string }>("/assets", { method: "POST", body: JSON.stringify({
      name: "🏆 Hackathon Participation Badge",
      description: "Awarded for completing the Blockchain IAM demo flow",
      assetType: "DIGITAL",
      metadataUri: "ipfs://bafybeigdyrdevassetmetadata",
      toAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      }) });
    showToast({ type: "info", title: "Asset Minted", message: `Token ID: ${res.data.tokenId}`, txHash: res.data.txHash });
  };

  const assignAsset = async () => {
      const res = await api<{ txHash?: string }>("/assets/1/assign", { method: "POST", body: JSON.stringify({ toAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" }) });
    showToast({ type: "info", title: "Asset Assigned", message: "Assigned to user wallet", txHash: res.data.txHash });
  };

  const verifyAsset = async () => {
      const res = await api<{ result: string; blockHash?: string }>("/verify/ownership/1?walletAddress=0x90F79bf6EB2c4f870365E785982E1f101E93b906");
    showToast({ type: "success", title: "Verification Complete", message: `Result: ${res.data.result}`, txHash: res.data.blockHash });
  };

  const viewAuditTrail = async () => {
      const res = await api<any[]>("/audit");
    showToast({ type: "info", title: "Audit Trail", message: `${res.data.length} records found` });
  };

  const transferAsset = async () => {
      const res = await api<{ txHash?: string }>("/assets/1/transfer", { method: "POST", body: JSON.stringify({ fromAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", toAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" }) });
    showToast({ type: "info", title: "Asset Transferred", message: "Transfer completed", txHash: res.data.txHash });
  };

  const revokePermission = async () => {
      const res = await api<{ txHash?: string }>("/wallets/0x70997970C51812dc3A010C7d01b50e0d17dc79C8/roles/ADMIN", { method: "DELETE" });
    showToast({ type: "warning", title: "Permission Revoked", message: "ADMIN role removed from manager wallet" });
  };

  const testRejection = async () => {
    try {
        await api("/assets/1/transfer", { method: "POST", body: JSON.stringify({ fromAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", toAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" }) });
      showToast({ type: "error", title: "Unexpected Success", message: "Transfer should have been rejected!" });
    } catch (error: any) {
      if (error.status === 403 || error.status === 401) {
        showToast({ type: "success", title: "Rejection Verified", message: "Unauthorized transfer correctly rejected" });
      } else {
        throw error;
      }
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset demo database? This will clear all data.")) return;
    setIsLoading(true);
    try {
        await api("/demo/reset", { method: "POST" });
        await api("/demo/seed", { method: "POST" });
      setCompletedSteps(new Set());
      setCurrentStep("connect");
      setTxStatuses({} as any);
      showToast({ type: "success", title: "Demo Reset", message: "Database cleared and re-seeded" });
      await checkDemoMode();
    } catch (error: any) {
      showToast({ type: "error", title: "Reset Failed", message: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const isStepAvailable = (step: DemoStepId) => {
    const index = DEMO_STEPS.findIndex((s) => s.id === step);
    if (index === 0) return true;
    return completedSteps.has(DEMO_STEPS[index - 1].id);
  };

  const isHardhatNetwork = chainId === 31337;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">🎪 Hackathon Demo</h1>
              <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded-full">
                DEMO MODE
              </span>
            </div>
            <div className="flex items-center gap-4">
              <WalletControl />
              {isConnected && (
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                  <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                  {balance && (
                    <span className="text-gray-400">{Number(balance.formatted).toFixed(4)} ETH</span>
                  )}
                  <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded">
                    Chain: {chainId}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Step Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sticky top-24">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Demo Flow</h2>
              <nav className="space-y-2" role="navigation" aria-label="Demo steps">
                {DEMO_STEPS.map((step, index) => {
                  const completed = completedSteps.has(step.id);
                  const active = currentStep === step.id;
                  const available = isStepAvailable(step.id);
                  const status = txStatuses[step.id];

                  return (
                    <button
                      key={step.id}
                      onClick={() => available && !isLoading && handleDemoAction(step.id)}
                      disabled={!available || isLoading || completed}
                      className={`w-full text-left p-3 rounded-lg transition-all flex items-start gap-3 ${
                        completed
                          ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                          : active
                          ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                          : available
                          ? "bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600"
                          : "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
                      }`}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {completed ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : status?.status === "pending" ? (
                          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : status?.status === "failed" ? (
                          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <span className="text-gray-400">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate">{step.label}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{step.description}</div>
                        {status?.txHash && (
                          <a
                            href={`https://explorer.hardhat.network/tx/${status.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                          >
                            View on Explorer →
                          </a>
                        )}
                      </div>
                    </button>
                  );
                })}
              </nav>

              {demoMode && (
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={handleReset}
                    disabled={isLoading}
                    className="w-full px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
                  >
                    🔄 Reset Demo
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                    Clears SQLite DB & re-seeds demo data
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Center Panel - Current Step Details */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {DEMO_STEPS.find(s => s.id === currentStep)?.label}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mt-1">
                  {DEMO_STEPS.find(s => s.id === currentStep)?.description}
                </p>
              </div>

              {currentStep === "connect" && (
                <ConnectStep address={address} isConnected={isConnected} onConnect={() => handleDemoAction("connect")} />
              )}
              {currentStep === "identity" && <IdentityStep onAction={() => handleDemoAction("identity")} />}
              {currentStep === "role" && <RoleStep onAction={() => handleDemoAction("role")} />}
              {currentStep === "mint" && <MintStep onAction={() => handleDemoAction("mint")} />}
              {currentStep === "assign" && <AssignStep onAction={() => handleDemoAction("assign")} />}
              {currentStep === "verify" && <VerifyStep onAction={() => handleDemoAction("verify")} />}
              {currentStep === "audit" && <AuditStep onAction={() => handleDemoAction("audit")} />}
              {currentStep === "transfer" && <TransferStep onAction={() => handleDemoAction("transfer")} />}
              {currentStep === "revoke" && <RevokeStep onAction={() => handleDemoAction("revoke")} />}
              {currentStep === "reject" && <RejectStep onAction={() => handleDemoAction("reject")} />}
            </div>

            {/* Transaction Status Panel */}
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">📊 Transaction Status</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {DEMO_STEPS.map((step) => {
                  const status = txStatuses[step.id];
                  if (!status) return null;
                  return (
                    <div key={step.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <span className="text-gray-600 dark:text-gray-300">{step.label}</span>
                      <div className="flex items-center gap-2">
                        {status.status === "pending" && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 rounded">
                            ⏳ Pending
                          </span>
                        )}
                        {status.status === "confirmed" && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded">
                            ✅ Confirmed
                          </span>
                        )}
                        {status.status === "failed" && (
                          <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded">
                            ❌ Failed
                          </span>
                        )}
                        {status.txHash && (
                          <a href={`https://explorer.hardhat.network/tx/${status.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                            Explorer
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-4 rounded-lg shadow-lg border animate-slide-in ${
              toast.type === "success" ? "bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800" :
              toast.type === "error" ? "bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800" :
              toast.type === "warning" ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800" :
              "bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800"
            }`}
          >
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">{toast.title}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{toast.message}</div>
              {toast.txHash && (
                <a href={`https://explorer.hardhat.network/tx/${toast.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                  View Transaction →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}

function ConnectStep({ address, isConnected, onConnect }: { address?: string; isConnected: boolean; onConnect: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Step 1: Connect Admin Wallet</h4>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Connect using MetaMask to Hardhat Local (Chain ID 31337). Use Hardhat Account #0:
          <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded mx-1">0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266</code>
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onConnect}
          disabled={isConnected}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-1"
        >
          {isConnected ? "✅ Connected" : "Connect Wallet"}
        </button>
      </div>
      {isConnected && address && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-sm">
          <div className="font-medium text-gray-900 dark:text-white">Connected Address:</div>
          <code className="text-blue-600 dark:text-blue-400 break-all">{address}</code>
        </div>
      )}
    </div>
  );
}

function IdentityStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Step 2: Create Identity</h4>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Registers an on-chain identity with a DID (Decentralized Identifier) associated with the connected wallet.
          The identity will be created via the IdentityRegistry contract.
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        Create Identity
      </button>
    </div>
  );
}

function RoleStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Step 3: Assign Role</h4>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Assigns the ADMIN role to the connected wallet via the RoleManager contract.
          This grants all permissions including identity management, asset minting, and audit export.
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        Assign ADMIN Role
      </button>
    </div>
  );
}

function MintStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Step 4: Mint Asset</h4>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Mints a new NFT asset (Hackathon Participation Badge) via the AssetNFT contract.
          The asset will be assigned to the user wallet (Hardhat Account #3).
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        Mint Asset
      </button>
    </div>
  );
}

function AssignStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Step 5: Assign Asset</h4>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Assigns the minted asset to the user wallet (Hardhat Account #3).
          This records the initial ownership in the AssetNFT contract.
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        Assign Asset to User
      </button>
    </div>
  );
}

function VerifyStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Step 6: Verify Ownership</h4>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Verifies on-chain that the user wallet (Hardhat Account #3) owns the asset.
          Queries the AssetNFT contract directly via the verification endpoint.
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        Verify Ownership
      </button>
    </div>
  );
}

function AuditStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Step 7: View Audit Trail</h4>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Retrieves the immutable audit trail from the AuditLogger contract.
          Shows all recorded events: identity creation, role assignment, minting, transfers.
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        View Audit Trail
      </button>
    </div>
  );
}

function TransferStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Step 8: Transfer Asset</h4>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Transfers the asset from manager wallet (Hardhat Account #1) to user wallet.
          Requires ASSET_TRANSFER permission which the MANAGER role has.
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        Transfer Asset
      </button>
    </div>
  );
}

function RevokeStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h4 className="font-medium text-yellow-900 dark:text-yellow-200 mb-2">Step 9: Revoke Permission</h4>
        <p className="text-yellow-700 dark:text-yellow-300 text-sm">
          Revokes the ADMIN role from the manager wallet (Hardhat Account #1).
          After this, the manager should no longer be able to transfer assets.
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700"
      >
        Revoke ADMIN Role
      </button>
    </div>
  );
}

function RejectStep({ onAction }: { onAction: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h4 className="font-medium text-red-900 dark:text-red-200 mb-2">Step 10: Verify Rejection</h4>
        <p className="text-red-700 dark:text-red-300 text-sm">
          Attempts to transfer the asset again using the manager wallet (now without permissions).
          The transaction should be rejected on-chain by the RoleManager authorization check.
        </p>
      </div>
      <button
        onClick={onAction}
        className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
      >
        Test Unauthorized Transfer
      </button>
    </div>
  );
}