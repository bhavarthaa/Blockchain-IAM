# Next.js Enterprise Dashboard UI Specification

## 1. Product direction

The dashboard is an enterprise security operations console for decentralized identity, authorization, asset custody, and audit evidence. It should feel closer to an IAM/SOC administration product than a retail crypto wallet:

- Dense but calm information hierarchy.
- Dark-first visual system with a light-mode equivalent.
- Clear chain, wallet, session, permission, and transaction context.
- Evidence-first presentation: every state-changing result exposes status, actor, transaction hash, block, and indexing freshness.
- No decorative crypto imagery, speculative pricing, token balances, or trading language.
- Motion communicates state transitions and hierarchy; it never replaces text, color-independent status, or accessible feedback.

The visual language combines the structure of GitHub Primer/enterprise admin consoles, the compact status language of security tooling, and the restrained typography of Vercel Geist. Use shadcn/ui or Radix primitives as implementation references, but retain a distinct IAM identity.

## 2. Technology and rendering model

- Next.js 14 App Router with TypeScript.
- Tailwind CSS with semantic CSS variables for light/dark themes.
- Server Components for initial page data, permission-sensitive reads, and SEO/public verification.
- Client Components only for wallet connector, filters, tables, dialogs, command palette, toasts, and motion.
- TanStack Query for client-side server state, cache invalidation, polling, and transaction status.
- Wagmi/Viem/RainbowKit for wallet connection and direct chain reads where needed.
- Motion library such as Motion for React, with `prefers-reduced-motion` support.
- Native HTML landmarks and controls first; Radix/shadcn primitives for dialogs, popovers, tabs, dropdowns, tooltips, and command palette.

### 2.1 Theme tokens

Use semantic tokens instead of hard-coded light/dark colors:

```text
--background          page background
--surface             cards, panels, table headers
--surface-elevated    dialogs, popovers, command palette
--foreground          primary text
--muted-foreground    metadata and secondary text
--border              dividers and control borders
--accent              active navigation and primary actions
--success             confirmed/healthy/active
--warning             pending/stale/attention
--danger              revoked/failed/critical
--info                informational chain/indexing state
--focus               keyboard focus ring
```

Dark mode uses near-black navy/slate surfaces, not pure black. Use one accent family (electric cyan/blue) for interactive elements and reserve amber/red for risk and operational state. Every state badge includes text and an icon or shape in addition to color.

## 3. Global navigation

### 3.1 Desktop shell

The authenticated shell has:

1. **Left sidebar, 264px expanded / 72px collapsed**
   - Product mark: `Blockchain IAM`.
   - Environment badge: `LOCAL`, `SEPOLIA`, or configured network.
   - Primary sections:
     - Overview
       - Dashboard
     - Identity & access
       - Identities
       - Roles
       - Permissions
     - Assets
       - Assets
       - Ownership
     - Evidence
       - Audit log
       - Verify
   - Secondary links:
     - Transactions
     - System status
     - Documentation
   - Bottom controls:
     - Collapse sidebar
     - Theme selector
     - Keyboard shortcuts
     - Session security

2. **Top header**
   - Breadcrumbs and page title.
   - Global search/command trigger: `Search or jump…  Ctrl K`.
   - Indexer freshness indicator with last indexed block.
   - Network/chain selector showing chain ID and RPC health.
   - Wallet/session control.
   - Notifications/toast trigger for transaction completion and operational warnings.

3. **Main content**
   - Max-width 1600px, fluid gutters.
   - Page header with title, description, primary action, and optional filters.
   - Main content uses responsive CSS grid and stable vertical rhythm.

### 3.2 Mobile shell

- Header contains menu button, compact brand, chain health dot, and wallet avatar.
- Sidebar becomes a modal sheet with the same nav order and active route.
- Breadcrumbs collapse to back navigation.
- Global search remains available from the header.
- Dense tables become stacked cards or a row-detail drawer rather than a tiny horizontally squeezed table.

### 3.3 Navigation behavior

- Ordinary navigation uses semantic `<nav>` and links, not ARIA menubar semantics.
- Active route has accent bar, contrast change, icon treatment, and `aria-current="page"`.
- Sidebar state persists locally per user/device.
- Permission-hidden navigation is removed from the tab order and replaced by no item; sensitive data is still protected server-side.
- If the user lacks a page permission, show a dedicated access-denied page only when they navigate directly.

## 4. Global interaction patterns

### 4.1 Command palette

`Cmd/Ctrl+K` opens a modal command palette:

- Search pages: Dashboard, Identities, Assets, Roles, Audit, Verify.
- Search identities by DID/wallet.
- Search assets by token ID/serial number.
- Start permitted actions: create identity, mint asset, assign role.
- Open recent transactions.
- Switch theme, chain, or sidebar mode.
- Group results by Navigation, Identities, Assets, Actions, Recent.
- Show keyboard hints and preserve focus on close.
- Empty state: “No commands or records match this search.”
- Loading state: three skeleton result rows.

Use dialog + combobox/listbox semantics and prevent shortcuts from firing during text composition.

### 4.2 Global transaction activity

A transaction drawer is available from the header:

- Pending/submitted transactions at top.
- Each row shows action, token/DID, wallet, elapsed time, short hash, and state.
- Expand for lifecycle timeline and explorer link.
- `Refresh status` uses the backend receipt endpoint; it does not resubmit.
- Failed transactions expose decoded error and retry guidance, never a fake success.

### 4.3 Toasts

- Success: indexed confirmation with transaction hash.
- Pending: “Transaction submitted; waiting for confirmation.”
- Warning: “Confirmed on-chain; indexer is catching up.”
- Error: actionable contract/API error with `View transaction`.
- Toasts are supplemental; persistent state appears in the page and transaction drawer.

## 5. Dashboard

### 5.1 Page purpose

The dashboard answers: “Is the IAM system healthy, who has access, what assets are at risk, and what changed?”

### 5.2 Layout

1. Page header:
   - `Security overview`
   - Chain badge, last indexed block, refresh control.
   - Date/time range selector for off-chain activity charts.

2. KPI cards, four across desktop:
   - Active identities.
   - Active role assignments.
   - Assets under management.
   - Audit events in selected range.
   - Each card includes primary number, delta versus prior range, mini sparkline, and source/freshness.

3. Two-column security overview:
   - **Role distribution card:** Admin, Manager, Auditor, User counts with total and drill-down.
   - **System health card:** RPC, database, indexer lag, contract configuration, last successful block.

4. Activity and risk:
   - Recent audit timeline with action icon, actor, target, block, and status.
   - Pending transaction list.
   - Attention panel for stale indexer, failed transactions, revoked identities, or missing metadata.

5. Quick actions:
   - Create identity.
   - Assign role.
   - Mint asset.
   - Verify DID/asset.
   - Actions are permission-filtered.

### 5.3 States

- Loading: skeleton KPI cards, chart blocks, and timeline rows.
- Empty: “No indexed activity yet” with network/setup explanation.
- Degraded: show last known values with amber freshness banner.
- Error: preserve shell and show retryable section-level error cards.

## 6. Identities

### 6.1 List page

Header:

- `Identities`
- Description: “Manage DID registrations, wallet bindings, and lifecycle status.”
- Primary `Create identity` button for `IDENTITY_CREATE`.

Toolbar:

- Search DID/wallet.
- Status filter: Active, Revoked, All.
- Role filter: Admin, Manager, Auditor, User.
- Chain selector.
- Column visibility and density controls.
- Export only for authorized audit/export roles.

Table columns:

| Column | Content |
|---|---|
| Identity | DID with copy and truncated display |
| Wallet | ENS if available, shortened address, copy |
| Role | Role badge |
| Status | Active/Revoked badge |
| Document | Hash/CID shortened with verify link |
| Created | Relative time plus exact tooltip |
| Indexed | Block number/freshness |
| Actions | View, update document, revoke, restore based on permission |

Desktop uses a native table with sticky header. Mobile uses identity cards with DID, wallet, status, role, and overflow menu.

### 6.2 Identity detail

Two-column layout:

- Identity summary card: DID, wallet, status, role code, document hash, chain.
- Security actions card: update document, revoke/restore, role assignment.
- Tabs:
  - Overview.
  - Role assignments.
  - Owned assets.
  - Audit activity.
  - Verification proof.

Show a provenance strip: created transaction, last update block, last indexed block, and explorer links.

### 6.3 Create/update forms

Create identity modal:

- Wallet address input with checksum normalization and address validation.
- DID input with format example and duplicate check.
- Role selector.
- DID document hash/CID input or upload handoff.
- Security acknowledgement: “This submits an on-chain transaction.”
- Review step with exact contract action and target chain.

Update document modal:

- Existing DID read-only.
- New hash/CID.
- Before/after comparison.
- Review/sign/submit step.

Revoke modal:

- Identity summary.
- Warning that revocation is on-chain and affects authorization.
- Optional internal reason stored as application metadata only.
- Require explicit typed confirmation for administrator identities.

## 7. Assets

### 7.1 Asset list

Header:

- `Assets`
- `Mint asset` for `ASSET_MINT`.
- View toggle: table/grid.

Toolbar:

- Search token ID/name/serial.
- Owner/DID filter.
- Asset type: Digital/Physical.
- Status: Active/Burned.
- Date range.
- Sort: token ID, created, updated, owner.

Table columns:

| Column | Content |
|---|---|
| Asset | Thumbnail, name, token ID |
| Type | Digital/Physical |
| Owner | Wallet/DID |
| Status | Active/Burned |
| Metadata | URI/CID health |
| Created | Minter and date |
| Updated | Last metadata/ownership change |
| Actions | View, assign, transfer, metadata, burn |

Grid cards use image/metadata preview, token ID, owner, status, and a compact transaction indicator.

### 7.2 Asset detail

- Hero card with metadata image, name, token ID, status, current owner.
- Ownership proof card with current wallet, DID, verified-at block, and `Verify ownership`.
- Actions grouped by destructive risk:
  - Assign.
  - Transfer.
  - Update metadata.
  - Burn in danger zone.
- Tabs:
  - Overview.
  - Ownership history.
  - Metadata.
  - Audit.
  - On-chain transactions.

Ownership history is a vertical timeline with from/to/operator, block, timestamp, and transaction hash.

### 7.3 Mint/assignment/transfer forms

Mint modal:

- Metadata upload/dropzone for image and JSON, with IPFS URI preview.
- Name, description, asset type, serial number.
- Recipient DID/wallet lookup.
- Metadata validation warning if URI is unavailable.
- Review gas/target chain/permission.

Transfer modal:

- Current owner and token displayed read-only.
- Recipient DID search resolves to wallet and active status.
- Explicit notice when Manager/Admin transfer bypasses owner approval.
- Confirmation requires token ID and recipient summary.

Burn modal:

- Red danger styling.
- Current owner, token ID, and irreversible warning.
- Typed token ID confirmation.
- Never optimistically remove the card; mark pending until indexed.

## 8. Roles and permissions

### 8.1 Roles page

Use a permission matrix:

- Rows: Admin, Manager, Auditor, User.
- Columns: identity create/update/revoke, role assign, asset mint/assign/transfer/burn/metadata, audit export.
- Checkmarks, disabled states, and on-chain source label.
- Clicking a role opens a detail side panel with assigned wallets and permission provenance.

### 8.2 Assignment panel

- Search identity/DID/wallet.
- Role selector.
- Current assignments and effective permissions.
- On-chain configuration block and last indexed block.
- `Assign role` and `Revoke role` actions only for `ROLE_ASSIGN`.

Role changes use a review modal:

1. Actor and target wallet.
2. Role before/after.
3. Permission impact summary.
4. Chain/network.
5. Sign/submit.

### 8.3 Permission-dependent UI

| Capability | UI behavior |
|---|---|
| No authenticated session | Public Verify only; show connect wallet |
| Admin | All identity, role, asset, audit, and configuration actions |
| Manager | Mint, assign, transfer, burn, metadata; no identity/role administration |
| Auditor | Read dashboards, identities, assets, roles, audit/export, verification |
| User | Read permitted data and transfer own assets where contract policy allows |
| Revoked/inactive identity | Read-only warning state; hide all writes and block submit |
| Stale role projection | Disable sensitive action and show “Refreshing on-chain permission” |

Never rely on hidden buttons as security. The backend and contracts enforce permissions independently.

## 9. Audit log

### 9.1 Page layout

Header:

- `Audit log`
- Description: “Immutable contract events indexed for investigation and export.”
- Export button for `AUDIT_EXPORT`.

Filter bar:

- Action.
- Actor wallet.
- Target DID.
- Token ID.
- Date/time range.
- Contract/emitter.
- Transaction status.
- Confirmed/indexed toggle.

Table columns:

| Column | Content |
|---|---|
| Time | Exact and relative UTC |
| Action | Semantic action badge |
| Actor | Wallet/emitter |
| Target | DID/token |
| Transaction | Short hash + explorer |
| Block | Number + confirmation |
| Source | Contract/event name |
| Status | Confirmed, pending index, reorged |

Clicking a row opens a detail drawer with raw event topics/data, decoded fields, block hash, transaction receipt, and related identity/asset.

### 9.2 Export

- Export modal shows active filters and row estimate.
- Formats: CSV and JSON.
- Large exports become an operation with progress state.
- Public/low-privilege users see an anonymized verification view rather than unrestricted export.

## 10. Verify

### 10.1 Public verification page

The Verify page is accessible without a wallet:

- Segmented search: DID, Asset token ID, Ownership proof.
- Large input with examples.
- `Verify` primary action.
- Shareable result URL after lookup.

### 10.2 Result cards

DID result:

- Verified/Not found/Revoked banner.
- DID, wallet, role, active state, document hash/CID.
- Chain, contract address, checked block, transaction link.

Asset result:

- Exists/Burned/Not found banner.
- Token ID, metadata, current owner, owner DID if registered.
- Ownership history summary.

Ownership result:

- “Wallet bound to DID owns token” or “Ownership mismatch.”
- DID wallet and actual `ownerOf` shown side-by-side.
- Checked block and freshness.

Verification must prefer direct contract reads for proof fields and clearly state when a result is based on an indexed projection.

## 11. Wallet connection and session states

### 11.1 Disconnected

- Header button: `Connect wallet`.
- Explain supported wallets and target network.
- Public Verify remains available.
- Protected pages show a non-blocking sign-in panel.

### 11.2 Connecting

- Button becomes `Connecting…`.
- Wallet provider modal remains accessible.
- Disable duplicate connect attempts.

### 11.3 Connected, unauthenticated

- Show address and chain.
- Prompt `Sign in with Ethereum`.
- Explain exact domain, nonce-based message, expiry, and that no transaction/gas is required.
- Never request an opaque signature without showing purpose.

### 11.4 Authenticated

- Header shows shortened wallet, DID if resolved, role badge, chain.
- Session menu shows session age, domain, chain, permissions summary, disconnect, and sign out.

### 11.5 Wrong network

- Amber header banner with expected and current chain.
- `Switch network` action where provider supports it.
- Disable writes until the chain matches.

### 11.6 Rejected/expired/disconnected

- Preserve read-only public access.
- Show actionable reason: signature rejected, session expired, wallet disconnected, or identity revoked.
- Never silently retry wallet signatures.

## 12. Transaction lifecycle UI

Every blockchain write uses a visible state machine:

```text
Review → Awaiting wallet → Pending submission → Submitted
       → Confirming → Confirmed → Indexed
                         └──────→ Failed
                         └──────→ Unknown / needs refresh
```

### State presentation

| State | Visual | Copy/action |
|---|---|---|
| Review | Blue review panel | Exact action, actor, target, chain |
| Awaiting wallet | Wallet icon/spinner | “Confirm this request in your wallet.” |
| Pending submission | Progress indicator | “Preparing transaction.” |
| Submitted | Blue badge | Hash, explorer, `View status` |
| Confirming | Amber badge | Confirmation count and block |
| Confirmed | Green badge/check | Receipt details |
| Indexed | Green + database icon | “Available in dashboard search.” |
| Failed | Red badge | Decoded reason, `View transaction`, safe retry |
| Unknown | Amber warning | “Provider status is unclear; refresh—do not resubmit.” |
| Reorged | Purple/amber warning | “Chain reorganized; state is being re-indexed.” |

No page changes projected identity, owner, role, or audit state until the backend receipt/indexer confirms it.

## 13. Loading, error, and empty states

### Loading

- Use skeletons matching final geometry: table rows, cards, badges, and chart blocks.
- Preserve page title and toolbar while data loads.
- Use short opacity shimmer only; honor reduced motion.
- For direct chain verification, show `Checking block…` rather than generic loading.

### Errors

- Section-level errors preserve unrelated content.
- Include stable error code, human explanation, retry, and support/request ID where relevant.
- Permission errors explain which permission is missing.
- RPC errors distinguish provider unavailable from contract rejection.
- Database/indexer errors show stale-data warning and never present cached values as current.

### Empty states

- Identities: “No identities indexed” with `Create identity` if permitted.
- Assets: “No assets match these filters” with clear filters.
- Audit: “No events for this range.”
- Roles: “No active assignments.”
- Verify: “Enter a DID or token ID to check on-chain proof.”
- Pending transactions: “No active transactions.”

Empty states never imply that the blockchain has no data if the indexer is lagging; show indexer freshness first.

## 14. Responsive behavior

| Breakpoint | Behavior |
|---|---|
| `<640px` | One-column cards, mobile sheet nav, table rows become cards, bottom action bar in detail pages |
| `640–1023px` | Collapsed sidebar, two-column KPI grid, tables retain priority columns and move secondary fields to row drawer |
| `1024–1279px` | Collapsible sidebar, two/three-column grids, full tables with horizontal overflow only for specialized matrices |
| `≥1280px` | Full shell, four-column KPIs, split detail panels, sticky filters and table headers |

Touch targets are at least 44px. Destructive actions are not hidden only behind hover. Dialogs become full-screen sheets on small devices. Forms use one field per row on mobile and preserve review summaries above the submit action.

## 15. Motion and accessibility

- Page transitions: 120–180ms opacity/translate; no disorienting route animation.
- Sidebar/drawer: 180–240ms ease-out.
- Dialogs: fade backdrop plus 8px vertical settle.
- Table row insertion/update: subtle background highlight, not layout jumping.
- Transaction status: icon/state transition with a single short animation.
- Disable transform/layout animation under `prefers-reduced-motion`; retain state text and icons.
- Use visible focus rings, semantic headings, labels, descriptions, and error associations.
- Dialogs trap focus and return focus to the trigger.
- Keyboard shortcuts are discoverable and never interfere with text input.
- Color contrast meets WCAG AA; status cannot be conveyed by color alone.
- Tables use native semantics and stable row IDs; avoid making every cell a focus target.

## 16. Research references and design rationale

The specification borrows interaction patterns from:

- [Next.js App Router navigation](https://nextjs.org/docs/14/app/building-your-application/routing/linking-and-navigating)
- [Tailwind responsive design](https://tailwindcss.com/docs/responsive-design)
- [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode)
- [GitHub Primer NavList](https://github.com/primer/react/blob/db954644f45aaf3299dc5e8342a38904fd300e25/packages/react/src/NavList/NavList.tsx)
- [GitHub Primer DataTable](https://github.com/primer/react/blob/ea682fe3b906933ac137aee3a93ba4ee6c4e6a2f/packages/react/src/DataTable/DataTable.tsx)
- [shadcn Sidebar](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/sidebar.tsx)
- [shadcn dashboard data table](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/components/data-table.tsx)
- [cmdk command palette](https://github.com/pacocoursey/cmdk)
- [Radix Dialog](https://github.com/radix-ui/primitives/tree/main/packages/react/dialog)
- [Vercel Geist](https://vercel.com/geist/introduction)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [Motion accessibility](https://motion.dev/docs/react-accessibility)
- [MetaMask Connect](https://docs.metamask.io/metamask-connect/)

These references inform patterns and accessibility decisions; the visual identity, copy, status model, and information architecture remain specific to Blockchain IAM.
