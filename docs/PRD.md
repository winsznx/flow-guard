# FlowGuard — Product Requirements Document

## 1. Overview

**Product Name:** FlowGuard

**Mission:** Provide BCH-native teams and projects with a safe, automated, on-chain treasury management system.

**Key Value:** Enable recurring budget releases, role-based approval, and spending guardrails — all enforced on-chain — without making teams surrender custody of their funds.

---

## 2. Problem Statement

Many BCH projects — developer teams, DAOs, open-source groups — hold treasury funds in BCH but lack automated, trustless mechanisms for:

- Disbursing monthly or periodic payroll or budgets
- Ensuring multi-party approval before spending
- Locking unused funds until predefined dates
- Enforcing simple financial guardrails (caps, role-based limits)

Currently, these teams rely on:

- Manual multisig wallets
- Off-chain spreadsheets and manual payments
- Centralized processes (payment services)

These approaches lead to risk: human error, misuse, lack of transparency, and administrative burden.

---

## 3. Goals & Success Metrics

### Goals:

- Enable safe, on-chain treasury operations with minimal manual overhead.
- Provide strong economic guardrails to prevent treasury misuse.
- Make it easy for non-crypto-native team members (managers, founders) to use.
- Demonstrate a highly secure, auditable contract system using Layla CHIPs.
- Encourage adoption by small-to-medium BCH teams.

### Success Metrics:

- MVP adoption: # of treasuries created during hackathon (target: 5+)
- Transaction volume: total BCH held and spent through FlowGuard
- User satisfaction: feedback from at least 3 pilot teams
- Security incidents: zero critical bugs or exploits in escrow logic
- On-chain transparency: all guardrail actions readable on-chain with minimal gas / script cost

---

## 4. Target Users

### Primary Users:

- **BCH Project Teams / DAOs:** need recurring releases, checks & balances
- **Open-Source Maintainers:** want to budget for bounties, dev payments, grants
- **Small Crypto Businesses / Startups:** want non-custodial budget management
- **Treasury Managers / Finance Leads:** want tools to enforce multi-party approval

### User Profiles & Personas:

**Alice, DAO Treasurer:** Oversees 50 BCH. She wants a secure way to disburse a monthly stipend to contributors, but only after governance vote.

**Bob, Open-Source Lead:** Wants to reserve 20 BCH for bug bounties, releasing 2 BCH every month, but only with 2-of-3 maintainers' signoff.

**Claire, Startup CFO:** Needs to allocate a budget for payroll and operational costs, with a guardrail: no more than 1 BCH can be spent on any vendor without board co-signing.

---

## 5. Features & Requirements

### 5.1 Treasury Vault Creation

**FR1:** User can create a new treasury vault (FlowGuard vault).

**FR2:** When creating, user defines:
- Total deposit amount (in BCH)
- Recurring unlock schedule (using Loops)
- Spending cap per period (optional)
- Role-based signer set (multisig)
- Approval threshold (e.g., 2-of-3)

**FR3:** Vault parameters are locked on-chain; change requires a governance flow.

**CHIP Use:**
- Loops for scheduled unlocks (e.g., monthly, weekly)
- P2S to enforce the covenant logic

---

### 5.2 Role-Based Approval & Permissions

**FR4:** Define multiple roles: approvers / signers.

**FR5:** Approvals logic: define how many signatures are required for spend (e.g., 2-of-3).

**FR6:** Users must be able to propose a spend: specify recipient address, amount, and justification.

**FR7:** Approval process: signers review and sign on-chain transaction proposals.

**CHIP Use:**
- Bitwise to store and check role flags, threshold, signers set
- Functions to modularize permission checks: `hasApproval()`, `isSigner()`

---

### 5.3 Automated, Recurring Fund Unlocking

**FR8:** Use a Loop to define periodic "unlock windows" (e.g., monthly).

**FR9:** When an unlock window is triggered, a portion of the vault's BCH becomes claimable or spendable (according to parameters).

**FR10:** The unlocked funds carry guardrails: they cannot exceed the set spending cap or bypass required approvals.

**FR11:** If funds are not spent in an unlock period, they remain in the vault and automatically roll over / remain locked (depending on config).

**CHIP Use:**
- Loops for recurring cycles
- Bitwise / Functions to track which cycles have been claimed

---

### 5.4 Spending / Payout Logic

**FR12:** Once funds are unlocked, a user / team member can propose a payout.

**FR13:** A "spend proposal" is subject to the approval requirements defined at vault creation.

**FR14:** After required approvals, a P2S transaction executes the payout.

**FR15:** All payouts are enforced by covenant rules; no manual multisig needed outside the covenant.

**CHIP Use:**
- P2S ensures covenant-level enforcement
- Functions handle spend logic: `isAllowedSpending()`

---

### 5.5 State Tracking & Bitwise Encoding

**FR16:** Maintain a compact on-chain "state integer" that tracks:
- which cycles have had funds unlocked
- which cycles have been fully spent
- which proposals are pending / approved / executed

**FR17:** Expose this state via a frontend for transparency.

**CHIP Use:**
- Bitwise to encode multiple boolean flags into a single integer

---

### 5.6 Admin / Governance Functions

**FR18:** Admins (or signers) can reconfigure vault parameters (cap, approval threshold), but only via a secure on-chain governance transaction.

**FR19:** Admins can add or remove signers, via on-chain action, respecting a threshold.

**FR20:** There is a "kill switch" / emergency pause: Approvers can agree to freeze the vault.

**CHIP Use:**
- Functions implement governance operations (e.g., `addSigner()`, `pauseVault()`)

---

### 5.7 UI / Frontend Requirements

**FR21:** A dashboard where users see all vaults they are part of (as creator, signer, or beneficiary).

**FR22:** Interface to create a new vault (wizard).

**FR23:** Proposal interface: create spending proposal, view proposals, approve, reject.

**FR24:** Treasury state view: show cycles, unlocked amounts, spent amounts, etc.

**FR25:** Transaction history view: payouts, proposals, approvals.

**FR26:** Notification / alerts: when unlock window opens, when new proposal is created, when approval count is reached.

**Design Requirements:**
- Bold sections with spacious layout (inspired by Loop Crypto)
- Brand consistency throughout
- Use 1-3 complementary colors
- Clean, modern aesthetic
- Footer design inspired by Safe.global

---

### 5.8 Security & Audit

**FR27:** All contract logic must be thoroughly unit-tested.

**FR28:** Use test suites (devnet) to simulate loops, proposals, approvals, edge-cases.

**FR29:** Perform a security review of all CHIPs usage (Loops, P2S, Functions).

**FR30:** Provide on-chain transparency so any stakeholder can audit vault state.

---

### 5.9 Integration & Wallet Support

**FR31:** Support wallet connection via common BCH wallets (Selene, mainnet.cash) for both funding and signing.

**FR32:** Provide a way for non-signers (beneficiary) to claim or receive payments.

**FR33:** On the frontend, integrate with BCH QR / URI so users can easily send BCH to vault.

---

## 6. Non-Functional Requirements

**NFR1:** Gas / transaction cost should be minimized — covenant scripts should be as cheap as feasible.

**NFR2:** The UI must be responsive, mobile-friendly, and compatible with common BCH wallets.

**NFR3:** The backend (if any) should not hold custody of funds — only relay transactions, proposals, and notifications.

**NFR4:** The system must be resilient: even if backend is offline, unlocks or proposals should still be executable via on-chain wallet.

**NFR5:** Logging & monitoring: on-chain logs + off-chain analytics for usage, volume, failures.

---

## 7. MVP Definition

For Blaze2025, define a minimum viable product that is realistic to build in a hackathon and meets judging criteria.

### MVP Features:

- Vault creation (with deposit)
- Recurring unlock schedule (Loops)
- Proposal creation (spend)
- Role-based approval (multi-sig threshold)
- Payout execution on-chain (via P2S covenant)
- State tracking via Bitwise
- Basic dashboard UI (create vault, see vault state, propose, approve, payout)
- Wallet integration for signing (Selene or similar)

### Non-MVP (Stretch):

- Governance reconfiguration
- Pause / kill switch
- Notification system
- Off-chain analytics module
- Complex guardrail (caps per user, per period)

---

## 8. Architecture

### On-Chain Layer (Smart Contracts / Covenants):

- **FlowGuard Covenant:** enforces spending, unlocks, approvals
- **Loop Module:** triggers periodic unlock cycles
- **State Module:** bitwise integer storing vault state
- **Function Modules:** reusable logic (approval check, permission check, governance)

### Off-Chain / Backend Layer:

**(optional / lightweight):**

- **Proposal Server:** For coordinating proposals between signers. Stores metadata (proposal reason, target, amount).
- **Scheduler / Monitor:** Tracks on-chain when the next loop unlocks, triggers notifications.
- **API Layer:** For frontend to read vault state, propose spends, fetch cycle info.

### Frontend:

- Dashboard (Create Vault, Proposals, Approvals, State)
- Wallet integration (for deposit, signing, payout)
- UI for signers + non-signers

### Data Model (off-chain):

- **vaults:** vault metadata, parameters
- **proposals:** list of spend proposals, status (pending / approved / executed)
- **signers:** mapping of vault to signer addresses
- **cycles:** period snapshots — amount unlocked, claimed, leftover
- **txLogs:** record on-chain transactions (deposits, payouts, approvals)

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Smart Contract Bugs | Thorough testing + peer review + use of simple covenant patterns. Limit scope in MVP. |
| Cost Overrun (On-Chain Fees) | Optimize covenant size; minimize number of script actions; batch proposals. |
| Lack of Adoption | Target pilot BCH teams / devs; partner with BCH ecosystem DAOs; integrate with BLISS / hackathon networks. |
| Signer Collusion or Malicious Signers | Use multi-signature threshold >1; allow signer removal via governance; require clear identity or reputation for signers. |
| Backend Dependency | Design so key flows (propose, approve, payout) can be done entirely on-chain via wallet. Backend only optional. |
| User UX Complexity | Build simple UI; provide clear guidance (wizard) for vault creation; minimize jargon ("Loop," "covenant," etc.). |

---

## 10. Roadmap & Milestones

### Phase 0: Prep / Planning (Before Hackathon)

- Finalize PRD
- Set up dev environment (CHAINGRAPH, testnet)
- Write core smart contract skeleton
- Build Loops, Bitwise, Function templates

### Phase 1: Hackathon MVP

- Implement vault creation + deposit
- Implement Loop-based unlock mechanism
- Implement proposal / approval logic
- Implement P2S payout covenant
- Build minimal dashboard UI
- Integrate with Selene wallet

### Phase 2: Post-Hackathon Alpha / Pilot

- Add governance (signer management, reconfiguration)
- Add "pause" / emergency stop
- Add notification system
- Invite pilot BCH teams / DAOs to onboard
- Perform security audit

### Phase 3: Beta / Public Launch

- Polish UX
- Add analytics dashboard / off-chain logs
- Deploy on mainnet
- Launch marketing to BCH dev community
- Set up grants or treasury to bootstrap adoption

### Phase 4: Growth / Scaling

- Integration with DAOs, multisig communities
- Partner with funding orgs (BGA, BCH-1)
- Open-source the front-end & SDK
- Build a mobile-friendly UI or wallet integration

---

## 11. Competitive Analysis

### Alternatives / Competitors:

- Multisig wallets + manual spreadsheets (current default)
- Off-chain treasury tools (traditional payment rails)
- Existing smart contract treasuries on other chains (but not BCH)

### FlowGuard's Competitive Advantages:

- On BCH, using Layla CHIPs — niche but powerful
- Completely on-chain enforcement, no reliance on central party
- Recurring unlocks built-in (Loops)
- Compact state (Bitwise) → efficient
- Modular and upgradable via Functions
- Transparent and auditable by all stakeholders

---

## 12. Compliance / Legal Considerations

- While FlowGuard doesn't custody funds centrally, ensure legal clarity — users understand they maintain control.
- Educate users about tax considerations for BCH treasury disbursements.
- Provide disclaimers: FlowGuard is a protocol — not a registered financial service.
- For multi-jurisdiction DAOs: governance documents should define liability, signer obligations, and risk.

---

## 13. Demo Plan (for Hackathon)

Your 5-minute demo could go like this:

1. **Intro (30s):** "FlowGuard is on-chain treasury guardrails for BCH — safe, automated, permissioned."
2. **Vault Creation (1 min):** Show wizard → define unlock schedule, signers, threshold → fund with BCH in wallet → submit deposit.
3. **Loop Activation (1 min):** Show loop cycle logic — backend / wallet detects the first cycle window, loop triggers "unlockable funds."
4. **Spending Proposal (1 min):** Create a proposal (recipient, amount, reason) → show it waiting for approvals.
5. **Approvals (45s):** Signer 1 approves; signer 2 approves via wallet → both on-chain.
6. **Payout Execution (45s):** Covenant executes P2S transaction → funds released; bitwise state updates.
7. **State Dashboard (30s):** Show bitwise state, cycles status, history log, and transparency.

---

## 14. Why This Will Win Blaze2025

- **Technical Mastery:** You demonstrate mastery of Loops, Bitwise, P2S, Functions — exactly what the CHIPNET track rewards.
- **Real Problem + Real Product:** This is not a gimmick — it's a tangible treasury tool many BCH projects need.
- **Clean Code & Good Architecture:** The contract logic is modular, testable, and clean; judges love that.
- **Security-First:** Multi-sig, formal unlock cycles, and covenant enforcement reduce risk.
- **Scalable & Practical:** You can onboard real teams / DAOs; not just theoretical.
- **Demo-Friendly:** All core flows can be shown in 5 minutes with wallets, dashboard, and on-chain transactions.

---

## 15. Design Guidelines

### Visual Design Inspiration:

- **Primary Inspiration:** [Loop Crypto](https://www.loopcrypto.xyz/) — clean, bold sections, spacious layout
- **Footer Inspiration:** [Safe.global](https://safe.global/) — professional, organized footer structure

### Design Principles:

- **Bold Sections:** Use clear, prominent section headers with ample spacing
- **Spacious Layout:** Generous whitespace between elements for clarity
- **Brand Consistency:** Maintain consistent color scheme, typography, and component patterns throughout
- **Color Palette:** Use 1-3 complementary colors maximum
- **Modern Aesthetic:** Clean, professional, crypto-native design language

### UI Components:

- Dashboard with clear navigation
- Wizard-style vault creation flow
- Proposal cards with clear status indicators
- Transaction history with on-chain links
- Responsive design for mobile and desktop
- Wallet connection UI (Selene, mainnet.cash)

---

*Last Updated: Initial PRD for FlowGuard MVP*

