# SIH Blockchain IAM - Blockchain-Based Secure Platform for Identity, Access Control, and Digital Asset Management

A comprehensive decentralized platform combining DID-based identity management, role-based access control (RBAC), ERC-721 NFT asset management, smart-contract-enforced authorization, and immutable audit logging.

## 🏗️ Architecture

```
sih-blockchain-iam/
├── contracts/          # Solidity smart contracts (Hardhat + OpenZeppelin)
├── backend/            # Node.js/TypeScript REST API with Prisma/PostgreSQL
├── frontend/           # Next.js 14 + TypeScript + Tailwind CSS dashboard
└── docs/               # Project documentation
```

### Smart Contracts
- **IdentityRegistry** - W3C DID-compliant identity registry with roles (Admin, Manager, Auditor, User)
- **RoleManager** - RBAC using OpenZeppelin AccessControl with 10 permission actions
- **AssetNFT** - ERC-721 NFTs for digital/physical assets with ownership history
- **AuditLogger** - Immutable audit logging for all critical operations

### Backend API
- RESTful API for all contract interactions
- PostgreSQL with Prisma ORM for off-chain indexing
- Real-time event indexing from blockchain
- Wallet-based authentication

### Frontend Dashboard
- **Dashboard** - Stats, role distribution, recent activity
- **Identities** - CRUD, role assignment, verification
- **Assets** - Mint, assign, transfer, burn, ownership history
- **Roles** - Permission matrix, role assignments
- **Audit** - Filterable timeline with export
- **Verify** - Public DID/asset verification

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- MetaMask or compatible wallet

### 1. Clone and Install
```bash
cd sih-blockchain-iam

# Install contract dependencies
cd contracts && npm install

# Install backend dependencies
cd ../backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure Environment
```bash
# Root .env
cp .env.example .env

# Backend .env
cd backend && cp .env.example .env
# Edit with your PostgreSQL URL and contract addresses

# Frontend .env
cd ../frontend && cp .env.example .env.local
```

### 3. Start Local Blockchain
```bash
cd contracts
npx hardhat node
```

### 4. Deploy Contracts
```bash
# In a new terminal
cd contracts
npx hardhat run scripts/deploy.ts --network localhost
# Copy deployed addresses to backend .env
```

### 5. Setup Database
```bash
cd backend
npx prisma generate
npx prisma db push
```

### 6. Start Services
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

### 7. Access Dashboard
Open http://localhost:3000 and connect your wallet (MetaMask → Localhost 8545)

## 📋 Demo Flow

1. **Admin connects wallet** → Dashboard loads
2. **Create user identity** → DID generated, wallet linked
3. **Assign role** → User gets Manager/Auditor/User role
4. **Mint asset** → ERC-721 NFT created with metadata
5. **Assign asset to user** → NFT transferred to user's wallet
6. **User views owned asset** → Dashboard shows ownership
7. **Auditor verifies** → Verify page shows on-chain proof
8. **Audit trail** → Immutable timeline with tx hashes
9. **Transfer asset** → Ownership changes on-chain
10. **Revoke permission** → Smart contract blocks unauthorized ops

## 🧪 Testing

```bash
# Contract tests
cd contracts && npm test

# Backend tests
cd backend && npm test

# Frontend E2E tests
cd frontend && npm run test:e2e
```

## 📚 Documentation

- [Project Specification](docs/PROJECT_SPEC.md)
- [Research & Standards](docs/RESEARCH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Testing Guide](docs/TESTING.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Demo Script](docs/DEMO_SCRIPT.md)
- [SIH Evaluation](docs/SIH_EVALUATION.md)

## 🔐 Security

- Smart contract authorization enforced on-chain (not just UI)
- Reentrancy protection on all state-changing functions
- Input validation on all endpoints
- No private keys in codebase
- Frontend/backend authorization consistency

## 🎯 SIH Differentiators

1. **On-chain enforcement** - Authorization at smart contract level, not just UI
2. **DID-first identity** - W3C DID standard compliance
3. **Full audit trail** - Every operation logged immutably
4. **Asset provenance** - Complete ownership history on-chain
5. **Role-based permissions** - Granular 10-action RBAC
5. **Real-time sync** - Backend indexer keeps DB in sync with chain

## 📦 Deployment

### Local Development
- Hardhat Network (localhost:8545)
- PostgreSQL local or Docker
- MetaMask with Localhost network

### Testnet (Sepolia)
```bash
cd contracts
npx hardhat run scripts/deploy.ts --network sepolia
```

### Production Considerations
- Use AWS RDS / managed PostgreSQL
- Deploy backend to container service (ECS, Cloud Run)
- Deploy frontend to Vercel / Netlify
- Use Infura/Alchemy for RPC
- Enable HTTPS and CORS properly

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit PR

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- OpenZeppelin for secure contract libraries
- Hardhat for development framework
- Next.js, Wagmi, Viem for frontend stack
- Prisma for database tooling
- Tailwind CSS for styling