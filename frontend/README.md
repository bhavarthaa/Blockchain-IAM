# Blockchain IAM frontend

This is the Next.js 14 App Router dashboard for the Blockchain IAM platform. It
does not contain demo records: authenticated reads come from the backend
`/api/v1` API and public verification uses the backend verification endpoints.
Wallet control is provided by wagmi/viem and SIWE authentication.

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_API_URL` to the backend origin (the backend defaults to
`http://localhost:3001`), and set `NEXT_PUBLIC_CHAIN_ID` and
`NEXT_PUBLIC_RPC_URL` to the deployed/configured chain. Connect an injected
wallet, then choose **Sign in** to obtain a short-lived backend session.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

The API and smart contracts are the security boundaries. UI permission checks
only improve usability; API and contract errors are displayed and never treated
as successful transactions.
