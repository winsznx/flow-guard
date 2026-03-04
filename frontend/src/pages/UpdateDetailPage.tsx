import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ArrowLeft,
  Twitter,
  MessageCircle,
  Send,
  MessageSquare,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { PageMeta } from '../components/seo/PageMeta';

interface BlogPost {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  readingTime: number;
  author?: string;
  content: string;
  cover?: string;
}

const BLOG_POSTS: Record<string, BlogPost> = {
  'a-technical-breakdown-of-how-flowguard-works': {
    slug: 'a-technical-breakdown-of-how-flowguard-works',
    title: 'A Technical Breakdown of How FlowGuard Works on Bitcoin Cash',
    date: '2026-02-26',
    summary:
      'This post explains the mechanics behind FlowGuard. Not the features. The enforcement model. FlowGuard operates entirely within the UTXO framework of Bitcoin Cash.',
    tags: ['Technical', 'Architecture', 'CashTokens', 'Covenants'],
    readingTime: 7,
    author: 'FlowGuard Team',
    content: `
# A Technical Breakdown of How FlowGuard Works on Bitcoin Cash

## Introduction

This post explains the mechanics behind FlowGuard.

Not the features.

The enforcement model.

FlowGuard operates entirely within the UTXO framework of Bitcoin Cash.

## UTXO-Based Enforcement

Unlike account-based systems, Bitcoin Cash contracts operate through UTXOs.

Each covenant:

- Locks funds under specific spending conditions
- Validates constraints when spent
- Produces new UTXOs with updated state

FlowGuard leverages this model for:

- Vault enforcement
- Vesting schedules
- Budget releases
- Governance execution

## Constructor Parameter Encoding

Vault contracts encode:

- Threshold (M-of-N)
- Signer hashes
- Cycle duration
- Spending cap
- Unlock allocation

These values are serialized into the contract's bytecode.

Changing them requires deploying a new contract.

This ensures immutability of treasury rules.

## NFT Commitment State Model

Streams and certain governance flows rely on NFT commitments.

The 40-byte structure tracks:

- Current state
- Total released
- Timing cursor
- Recipient identity

Each claim produces:

Old UTXO → New UTXO with updated commitment.

This creates deterministic state progression.

## Validation Logic

During transaction validation, the contract verifies:

- Signature correctness
- Threshold count
- Timestamp conditions
- Cap constraints
- Allocation limits
- State transition validity

If any condition is false, the transaction is invalid.

There is no fallback branch.

## Deterministic Enforcement

The critical design principle:

Rules are validated at consensus level.

This means:

- No backend can override them
- No UI can bypass them
- No signer can violate them

Only valid covenant transitions are accepted.

## State Transition Example

Stream claim:

Input:

- Contract UTXO with 12 BCH
- NFT commitment (released: 2 BCH)

Block time indicates:

- 4 BCH should be vested

Contract computes:

- Claimable = 4 − 2 = 2 BCH

Output:

- 2 BCH to recipient
- New contract UTXO with updated commitment (released: 4 BCH)

Any mismatch invalidates the transaction.

## Integration Model

FlowGuard separates responsibilities:

Backend:

- Indexing
- Transaction construction
- Parameter serialization

Wallet:

- Signature authorization

Blockchain:

- Final validation

This keeps custody fully user-controlled.

## Why This Is BCH-Specific

Because Bitcoin Cash supports:

- Covenant scripting
- CashTokens NFT commitments
- Efficient UTXO mutation

FlowGuard can implement structured treasury logic without:

- External execution layers
- Off-chain voting systems
- Bridge infrastructure

All enforcement remains on BCH.

## Closing

FlowGuard is not a governance UI.

It is a set of covenant contracts enforcing treasury logic through deterministic UTXO state transitions.

Vault rules are immutable once deployed.

Streams track state inside NFT commitments.

Governance conditions gate treasury execution.

Everything is validated by consensus.

In the final post, we'll outline the post-sprint roadmap and long-term direction.
`,
  },
  'how-a-5-person-bch-team-could-use-flowguard': {
    slug: 'how-a-5-person-bch-team-could-use-flowguard',
    title: 'How a 5-Person BCH Team Could Use FlowGuard in Practice',
    date: '2026-02-26',
    summary:
      "Let's walk through a practical example using Bitcoin Cash. This isn't theory. This is how a BCH-native team could manage real capital using enforceable treasury rules.",
    tags: ['Use Case', 'BCH', 'Treasury', 'Education'],
    readingTime: 6,
    author: 'FlowGuard Team',
    content: `
# How a 5-Person BCH Team Could Use FlowGuard in Practice

## Introduction

It's easy to describe features in isolation:

- Vaults.
- Streams.
- Budgets.
- Governance.

But what does this look like in a real scenario?

Let's walk through a practical example using Bitcoin Cash.

## The Scenario

A 5-person BCH development team:

- Treasury: 50 BCH
- 3 core maintainers
- 2 part-time contributors
- Monthly payroll
- 1 external grant recipient

Goals:

- No single person controls funds
- Monthly spending discipline
- Structured salary distribution
- Milestone-based grant release
- Transparent governance

## Step 1: Deploy the Vault

The team creates a vault with:

- 3-of-5 approval threshold
- 30-day cycle duration
- 10 BCH unlock per cycle
- 3 BCH per-transaction cap

What this enforces:

- At least 3 signers must approve
- Only 10 BCH can be spent per month
- No single payout exceeds 3 BCH

Even if all signers agree to spend 20 BCH in one month, the contract rejects it.

Spending discipline is enforced.

## Step 2: Set Up Salary Streams

Each contributor receives a vesting stream:

Example:

- Contributor A → 2 BCH/month
- Contributor B → 1 BCH/month
- Contributor C → 0.5 BCH/month

Each stream:

- Uses NFT commitment state
- Tracks total released
- Updates on each claim
- Prevents over-withdrawal

Contributors claim their vested amounts directly from the contract.

No one manually sends payroll each month.

## Step 3: Add a Milestone-Based Grant

The team funds an external developer:

- Total: 6 BCH
- Duration: 3 months
- 2 BCH unlocked per milestone

The budget contract enforces:

- Month 1 unlock → 2 BCH
- Month 2 unlock → 2 BCH
- Month 3 unlock → 2 BCH

Funds cannot be released early.

No admin decides release timing.

Time and rules enforce it.

## Step 4: Governance for Large Changes

Suppose the team wants to:

- Increase spending cap
- Add a new signer
- Approve a large strategic payout

This requires:

- Token locking
- Vote threshold
- Tally validation

If quorum and majority are not met, the proposal cannot execute.

Treasury movement becomes conditional on governance outcome.

## What This Prevents

This structure prevents:

- One signer draining treasury
- Overspending in a single month
- Manual salary errors
- Grant over-release
- Governance bypass

It removes ambiguity from treasury management.

## Transparency

Because this runs on Bitcoin Cash:

- Vault address is public
- Stream contracts are public
- Unlock schedules are visible
- Claims are verifiable

Anyone can inspect treasury behavior.

This builds ecosystem trust.

## What This Changes

Without structure:

Treasury management depends on coordination.

With FlowGuard:

Treasury management becomes enforceable infrastructure.

The team still debates decisions.

But once rules are set, execution follows logic.

## Scaling Beyond 5 People

This model scales to:

- Larger DAOs
- Grant programs
- Hackathon prize pools
- Public ecosystem funds

The same primitives apply:

Vault → Streams → Budgets → Governance.

## Closing

This isn't theory.

This is how a BCH-native team could manage real capital using enforceable treasury rules.

FlowGuard doesn't replace discussion.

It replaces ambiguity at execution time.

Next, we'll close the series with the post-sprint roadmap and long-term direction.
`,
  },
  'whats-left-before-flowguard-goes-to-mainnet': {
    slug: 'whats-left-before-flowguard-goes-to-mainnet',
    title: "What's Left Before FlowGuard Goes to Mainnet",
    date: '2026-02-25',
    summary:
      'FlowGuard has been tested end-to-end on Chipnet. This post outlines what remains before production deployment on Bitcoin Cash with a clear checklist.',
    tags: ['Roadmap', 'Mainnet', 'BCH', 'Product'],
    readingTime: 6,
    author: 'FlowGuard Team',
    content: `
# What's Left Before FlowGuard Goes to Mainnet

## Introduction

FlowGuard has been tested end-to-end on Chipnet.

Vaults deploy.
Streams track state.
Proposals execute.
Budget unlocks enforce schedule.

But Chipnet is not mainnet.

This post outlines what remains before production deployment on Bitcoin Cash.

Clear checklist. No assumptions.

## 1. Covenant Signing UX Finalization

The core transaction flow is working:

Backend builds template → Wallet signs → Network validates

Before mainnet, UX needs refinement:

- Clear signer prompts
- Better transaction previews
- Error surface clarity
- Improved multi-signer coordination

The goal:

Reduce user error without weakening contract enforcement.

## 2. Independent Security Audit

Treasury infrastructure must be audited.

Audit scope includes:

- VaultCovenant enforcement logic
- Vesting commitment state transitions
- Merkle airdrop validation
- Governance threshold validation
- Edge-case transaction ordering

Focus areas:

- Signature validation
- Cap enforcement
- State mutation correctness
- Over-release prevention

Mainnet treasury logic must be reviewed before live capital is locked.

## 3. Mainnet Contract Deployment

Initial mainnet rollout will include:

Phase 1:

- Vaults
- Vesting Streams

Phase 2:

- Budget plans
- Governance modules
- Airdrops

Deployment will follow:

- Fresh contract compilation
- Verified bytecode
- Public contract address publication

No hidden upgrades.

## 4. Public Demo Treasury

A public treasury will be deployed on mainnet to demonstrate:

- Real vault
- Real signers
- Real cap enforcement
- Real proposal execution

This allows:

- Open inspection
- Community verification
- Live transparency

Infrastructure must be observable, not theoretical.

## 5. First DAO and Grant Onboarding

After deployment:

Target early adopters:

- BCH grant programs
- Developer collectives
- Hackathon prize pools
- Contributor payroll teams

FlowGuard will support onboarding:

- Treasury structuring
- Cap configuration
- Vesting design
- Governance integration

The goal is real usage, not just deployment.

## 6. Automation Layer (Executor Network)

Future phase:

- Automated cycle unlock triggers
- Scheduled execution bots
- Optional notification systems

Important:

Automation does not override contracts.
It only submits valid transactions.

Enforcement always remains on-chain.

## Why This Matters

Infrastructure credibility depends on:

- Audit discipline
- Production clarity
- Transparent deployment
- Real adoption

FlowGuard is not being positioned as "finished."

It is being positioned as:

Tested → Audited → Deployed → Adopted.

That sequence matters.

## Long-Term Direction

Beyond mainnet:

- Executor marketplace
- Treasury analytics layer
- Template DAO stacks
- BCH-native coordination tooling

Treasury management is foundational.

If done correctly, it supports:

- Grants
- Governance
- Contributor alignment
- Ecosystem capital allocation

## Closing

FlowGuard is not a demo submission.

It is being built as enforceable treasury infrastructure on Bitcoin Cash.

Chipnet proved mechanics.

Next:

Audit.
Deploy.
Onboard.
Iterate.

That's the roadmap.
`,
  },
  'why-flowguard-makes-bch-more-useful': {
    slug: 'why-flowguard-makes-bch-more-useful',
    title: 'Why FlowGuard Makes Bitcoin Cash More Useful',
    date: '2026-02-25',
    summary:
      'Payments move value. Treasury rules protect value. Governance directs value. FlowGuard connects those pieces inside Bitcoin Cash.',
    tags: ['BCH', 'Ecosystem', 'Product', 'Education'],
    readingTime: 6,
    author: 'FlowGuard Team',
    content: `
# Why FlowGuard Makes Bitcoin Cash More Useful

## Introduction

Bitcoin Cash already works well as:

- A peer-to-peer payment system
- A low-fee settlement network
- A fast UTXO-based blockchain

But payments alone are not enough to grow an ecosystem.

For BCH to support:

- Developer teams
- Grant programs
- DAOs
- Long-term contributor alignment

It needs structured treasury infrastructure.

FlowGuard focuses on that layer.

## BCH Today: Strong Payments, Limited Structure

Today, BCH projects manage treasury using:

- Shared wallets
- Multisig setups
- Manual distribution
- Off-chain voting

This works for small teams.

But as capital grows, coordination becomes harder.

Without structured treasury logic:

- Budget discipline weakens
- Governance becomes informal
- Grants rely on trust
- Payroll becomes manual

That limits how scalable organizations on BCH can become.

## What FlowGuard Adds

FlowGuard introduces enforceable treasury mechanics:

- Multisig with spending caps
- Time-based unlock cycles
- On-chain vesting streams
- Merkle-based airdrops
- Token-locked governance
- Milestone budget enforcement

All validated by covenant logic on Bitcoin Cash.

This shifts BCH from:

"Payment network"

to

"Coordination layer for capital."

## Why Coordination Infrastructure Matters

Growing ecosystems require:

- Predictable capital allocation
- Contributor retention
- Transparent treasury operations
- Structured grant releases
- Binding governance outcomes

Without enforceable rules, treasury decisions rely on:

- Social agreement
- Memory
- Good intentions

With covenant enforcement, rules become deterministic.

This reduces ambiguity and increases confidence.

## Who Benefits

FlowGuard directly supports:

**Developer Teams**

- Monthly salary streams
- Long-term vesting
- Controlled spending caps

**Grant Programs**

- Milestone-based releases
- Escrow-style enforcement
- Transparent funding timelines

**DAOs**

- On-chain voting
- Execution tied to results
- Policy-based treasury management

**Hackathons and Incentives**

- Structured prize distribution
- Retroactive contributor rewards
- Claim-based allocations

These are practical ecosystem needs.

## Why This Is BCH-Native

FlowGuard leverages:

- UTXO model
- Covenant scripting
- CashTokens NFT commitments

All inside Bitcoin Cash.

No external chains.
No bridge risk.
No separate governance layer.

That keeps infrastructure within the BCH ecosystem.

## Growth Through Structure

Ecosystems grow when:

- Capital allocation becomes predictable
- Governance becomes enforceable
- Contributor incentives are clear
- Risk is reduced

FlowGuard focuses on treasury risk reduction and coordination clarity.

This strengthens the foundation for long-term BCH development.

## Not a New Token. Not a Fork.

FlowGuard does not:

- Introduce a new base token
- Modify the protocol
- Create a sidechain

It builds on existing BCH capabilities.

That means:

- Immediate compatibility
- No consensus change required
- No fragmentation

## The Bigger Picture

If BCH is going to compete as infrastructure for:

- Open organizations
- Grant ecosystems
- Community funding

It needs tools beyond simple transfers.

FlowGuard adds enforceable structure.

That is what helps BCH become more useful.

## Closing

Payments move value.

Treasury rules protect value.

Governance directs value.

FlowGuard connects those pieces inside Bitcoin Cash.

It's not about hype.

It's about giving BCH-native teams better tools to manage real capital.

Next, we'll walk through a real-world scenario: how a 5-person BCH team could structure treasury using FlowGuard.
`,
  },
  'flowguard-end-to-end-testing-on-chipnet': {
    slug: 'flowguard-end-to-end-testing-on-chipnet',
    title: 'FlowGuard End-to-End Testing on Bitcoin Cash Chipnet',
    date: '2026-02-25',
    summary:
      'FlowGuard has been tested end-to-end on the Bitcoin Cash Chipnet test network. This post explains what that means and what was actually executed.',
    tags: ['Testing', 'Chipnet', 'BCH', 'Technical'],
    readingTime: 7,
    author: 'FlowGuard Team',
    content: `
# FlowGuard End-to-End Testing on Bitcoin Cash Chipnet

## Introduction

It's easy to build a clean UI.

It's harder to prove that the system actually works on-chain.

FlowGuard has been tested end-to-end on the Bitcoin Cash Chipnet test network.

This post explains what that means — and what was actually executed.

## What "End-to-End" Means

End-to-end testing covers the full lifecycle:

- Contract deployment
- Contract funding
- Transaction building
- Wallet signing
- Broadcast to network
- On-chain validation
- State updates
- Explorer verification

If any part fails, the flow is incomplete.

We tested complete flows.

## Vault Lifecycle Test

The vault lifecycle included:

- Deploying VaultCovenant
- Encoding constructor parameters
- Funding the vault with BCH
- Creating proposals
- Approving proposals (M-of-N signatures)
- Executing payouts

Validation checks enforced:

- Approval threshold
- Spending cap
- Cycle unlock rules

Transactions were signed via wallet and verified on the network.

## Stream Lifecycle Test

Streams were tested using NFT commitment state.

Tested flows included:

- Deploying VestingCovenant
- Funding with BCH and NFT commitment
- Claiming partial vested amounts
- Updating commitment state
- Preventing over-claim attempts

Each claim transaction:

- Calculated vested amount
- Updated NFT commitment
- Preserved remaining balance

All enforced by covenant logic.

## Proposal Execution Flow

Governance-connected flows tested:

- Proposal creation
- Approval accumulation
- Execution attempt before threshold (fail case)
- Execution after threshold (success case)

This confirmed:

- Threshold enforcement
- Cap enforcement
- Contract-level validation

Invalid transactions were rejected as expected.

## Budget Unlock Testing

Milestone-based unlock flows tested:

- Attempted early unlock (rejected)
- Unlock after timestamp passed (accepted)
- Over-release attempt (rejected)

This validated:

- Time-based enforcement
- Allocation boundaries
- Deterministic state transitions

## Non-Custodial Confirmation

At no point did:

- The backend sign transactions
- A private key leave the wallet
- A database override on-chain rules

The pattern remained consistent:

Backend builds template → Wallet signs → Blockchain validates

If validation fails, the transaction never confirms.

## Why Chipnet Testing Matters

Chipnet testing verifies:

- Real covenant execution
- CashTokens compatibility
- Transaction fee behavior
- UTXO state updates
- Explorer visibility

It proves the contracts function under network conditions.

This is different from:

- Simulated logic
- Hardcoded mock states
- Off-chain execution demos

## Transparency

All transactions can be inspected via BCH explorers.

- Contract addresses exist.
- Funding transactions exist.
- Claim transactions exist.
- State transitions are visible in UTXOs.

Testing is not theoretical.

It is observable.

## What This Proves

FlowGuard is:

- Not database-driven
- Not admin-controlled
- Not dependent on manual reconciliation

It is covenant-enforced treasury logic operating on Bitcoin Cash.

Testing confirms that the enforcement holds under live conditions.

## What Comes Next

Chipnet testing is the foundation.

Next steps before mainnet:

- Final UX refinements
- Security audit
- Production deployment
- First live DAO treasury

FlowGuard is not a sprint submission artifact.

It is being built for long-term BCH ecosystem use.

## Closing

Infrastructure must be tested where it runs.

FlowGuard contracts have been executed on-chain.

Rules were validated by consensus.

Transactions were verifiable.

That is the standard treasury infrastructure requires.
`,
  },
  'how-flowguard-implements-on-chain-governance': {
    slug: 'how-flowguard-implements-on-chain-governance',
    title: 'How FlowGuard Implements On-Chain Governance on Bitcoin Cash',
    date: '2026-02-24',
    summary:
      'FlowGuard governance turns voting from community sentiment into enforceable treasury action. Tokens are locked, votes are validated, and contracts enforce the outcome.',
    tags: ['Education', 'Governance', 'Voting', 'BCH'],
    readingTime: 6,
    author: 'FlowGuard Team',
    content: `
# How FlowGuard Implements On-Chain Governance on Bitcoin Cash

## Introduction

Governance is often treated as a signaling mechanism.

Projects run:

- Off-chain polls
- Snapshot votes
- Community surveys

Then someone manually executes the outcome.

This creates a gap:

The vote may pass, but execution still depends on trust.

FlowGuard closes that gap by implementing governance logic directly on Bitcoin Cash.

Voting is enforced.
Execution is conditional.
Treasury actions depend on contract validation.

## The Core Components

FlowGuard governance is built around three elements:

- Token locking
- Vote recording
- Tally validation

Each step is enforced by covenant contracts.

## 1. Token Locking

To vote, tokens must be locked.

This prevents:

- Flash voting
- Temporary borrowing for voting power
- Double-use of tokens

The locking contract verifies:

- Token ownership
- Lock duration
- Voting eligibility

Locked tokens remain inaccessible until the voting period ends.

Voting power equals locked amount.

## 2. Vote Recording

When a voter casts a vote:

- Their locked tokens are referenced
- Their vote choice is recorded
- The contract validates eligibility

Votes cannot exceed the locked amount.

Votes cannot be cast after the deadline.

The blockchain enforces voting period rules.

## 3. Tally Commitment

At the end of the voting period:

- Votes are tallied
- A tally commitment is generated
- Execution is allowed only if conditions are met

This includes:

- Minimum quorum
- Required majority
- Time-based restrictions

If a proposal fails quorum, execution is impossible.

If it passes, execution becomes valid.

## Connecting Governance to Treasury

The important part:

Governance is not isolated.

Proposals can trigger:

- Vault payouts
- Budget releases
- Parameter updates

Execution of treasury actions depends on governance outcome.

This prevents:

- Manual bypass
- Off-chain reinterpretation
- Silent policy changes

If governance fails, treasury cannot move.

## Example Scenario

Imagine:

- A treasury proposal to release 5 BCH for development
- Voting period: 7 days
- Minimum quorum: 30%
- Majority required: >50%

If after 7 days:

- Quorum not met → execution invalid
- Majority not achieved → execution invalid
- Both satisfied → execution allowed

The contract enforces the result.

No one "decides" afterward.

## Why This Matters

Without enforcement:

Votes are advisory.

With covenant enforcement:

Votes become binding.

This is important for:

- DAO-managed treasuries
- Community funding
- Long-term ecosystem governance
- Grant review processes

Execution follows validation, not interpretation.

## BCH-Specific Advantage

Because Bitcoin Cash supports:

- Covenant logic
- Native token locking
- Deterministic validation

Governance can be integrated directly with treasury contracts.

This avoids:

- Separate governance tokens on another chain
- Off-chain tally infrastructure
- Centralized execution services

Everything stays inside the BCH ecosystem.

## What Governance Does Not Mean

Governance does not remove:

- Disagreement
- Debate
- Community discussion

It removes ambiguity at execution time.

Once rules are defined and encoded, the outcome is deterministic.

## Closing

FlowGuard governance turns voting from:

"Community sentiment"

into

"Enforceable treasury action."

Tokens are locked.
Votes are validated.
Tally determines execution.
Contracts enforce the outcome.

In the next post, we'll move from mechanics to proof — how FlowGuard is tested end-to-end on Chipnet and verifiable on-chain.
`,
  },
  'how-flowguard-enforces-milestone-based-funding-on-chain': {
    slug: 'how-flowguard-enforces-milestone-based-funding-on-chain',
    title: 'How FlowGuard Enforces Milestone-Based Funding On-Chain',
    date: '2026-02-24',
    summary:
      'FlowGuard budget plans move grant structure directly onto Bitcoin Cash. Time unlocks funds, the contract verifies conditions, and the blockchain enforces release.',
    tags: ['Education', 'Grants', 'Milestones', 'BCH'],
    readingTime: 6,
    author: 'FlowGuard Team',
    content: `
# How FlowGuard Enforces Milestone-Based Funding On-Chain

## Introduction

Grant programs and project funding often follow one of two models:

- Send all funds upfront and hope milestones are met.
- Keep funds in a shared wallet and manually release them.

Both approaches introduce risk.

Upfront funding exposes capital to misuse.

Manual milestone releases depend on:

- Someone remembering to execute payouts
- Someone having custody
- Someone deciding whether a milestone is complete

FlowGuard introduces milestone-based funding enforced directly by covenant contracts on Bitcoin Cash.

## The Core Idea

A budget plan defines:

- Total allocation
- Number of milestones
- Unlock timestamps
- Amount per milestone

Funds are locked inside a contract.

They cannot be released early.

They cannot exceed milestone amounts.

They cannot bypass the schedule.

The blockchain enforces the release logic.

## How It Works

FlowGuard budget plans are built using step-based vesting logic.

Each milestone represents:

- A timestamp
- A specific unlock amount

The contract verifies:

- Has the required timestamp passed?
- Has this milestone already been released?
- Is the release amount within the defined allocation?

If the conditions are not met, the transaction fails.

There is no override.

## Example Scenario

Imagine a BCH development grant:

- Total: 12 BCH
- Duration: 6 months
- 2 BCH unlocked per month

The budget contract enforces:

- Month 1 → 2 BCH unlockable
- Month 2 → 2 BCH unlockable
- Month 3 → 2 BCH unlockable

If someone attempts to release 4 BCH in Month 1, the contract rejects it.

If someone tries to release Month 4 funds early, the contract rejects it.

Milestone enforcement is part of the script.

## Why This Matters

Milestone-based funding reduces:

- Capital misuse risk
- Disputes over release timing
- Dependency on a single treasury operator
- Informal enforcement

It introduces predictability.

Both funders and recipients know:

- Exactly when funds unlock
- Exactly how much unlocks
- Exactly what the schedule enforces

## Optional Pause and Control

Budget plans can include pause logic.

This allows:

- Temporary halting of future releases
- Controlled continuation once resolved

Even this logic is defined inside the contract.

Not in a backend toggle.

## Difference From Manual Escrow

**Traditional escrow:**

A person or service holds funds.

They decide when to release.

**FlowGuard escrow:**

The contract holds funds.

Time and rules decide when to release.

This removes subjective discretion from the release mechanism.

## BCH-Specific Advantage

Because Bitcoin Cash supports covenant logic and deterministic script validation, budget enforcement becomes:

- Trust-minimized
- Transparent
- Publicly verifiable

Anyone can inspect:

- Contract address
- Unlock schedule
- Release history

No hidden ledger entries.

## Who Benefits

Budget plans are useful for:

- BCH ecosystem grants
- Contributor-based funding
- Hackathon prize vesting
- DAO development roadmaps
- Long-term protocol research funding

Instead of hoping milestones are respected, they become enforceable.

## Risk Reduction

Budget contracts prevent:

- Early capital extraction
- Over-release
- Informal milestone bypass
- Hidden payout acceleration

Funds only move when the script allows it.

## Closing

Milestone funding should not depend on memory or good faith.

It should depend on enforceable logic.

FlowGuard budget plans move grant structure directly onto Bitcoin Cash.

Time unlocks funds.

The contract verifies conditions.

The blockchain enforces release.

Next, we'll break down how governance works — and how token-weighted voting integrates with treasury logic.
`,
  },
  'how-flowguard-airdrops-use-merkle-proofs-on-chain': {
    slug: 'how-flowguard-airdrops-use-merkle-proofs-on-chain',
    title: 'How FlowGuard Airdrops Use Merkle Proofs On-Chain',
    date: '2026-02-22',
    summary:
      'On Bitcoin Cash, airdrops can be enforced by covenant contracts using Merkle proofs. That means eligibility is verified on-chain and double-claims are prevented.',
    tags: ['Education', 'Airdrops', 'Merkle Trees', 'BCH'],
    readingTime: 6,
    author: 'FlowGuard Team',
    content: `
# How FlowGuard Airdrops Use Merkle Proofs On-Chain

## Introduction

Airdrops are common in crypto ecosystems.

But most of them are handled manually:

- A list of addresses in a CSV
- A script that sends funds
- A spreadsheet tracking who claimed
- A backend preventing duplicates

This works — but it relies on trust.

FlowGuard handles airdrops differently.

On Bitcoin Cash, airdrops can be enforced by covenant contracts using Merkle proofs.

That means:

- Eligibility is verified on-chain.
- Double-claims are prevented on-chain.
- Distribution does not require manual execution.

## The Core Idea: Merkle Trees

A Merkle tree allows a large dataset (like thousands of recipients) to be represented by a single hash: the Merkle root.

Each leaf in the tree represents:

(address, amount)

When someone claims:

- They submit their address
- Their allocation
- A Merkle proof

The contract verifies:

- That the proof reconstructs the root
- That the address and amount match a valid leaf

If verification succeeds, the claim is valid.

## What Gets Stored On-Chain

When a FlowGuard airdrop is deployed:

The contract stores:

- The Merkle root
- The total campaign allocation
- Expiry rules (if applicable)

The Merkle root becomes the reference for eligibility.

The full CSV does not need to live on-chain.

## Preventing Double-Claims

Verification alone is not enough.

The contract must also ensure:

An address cannot claim twice.

FlowGuard tracks claim state inside contract logic (using NFT commitment patterns similar to streams).

When a claim succeeds:

- The contract marks that claim as completed
- Future claims from the same leaf fail

This prevents:

- Duplicate withdrawals
- Replay attempts
- Manual tracking errors

Double-claim prevention is enforced by consensus.

## Claim Flow Example

Let's walk through it.

Campaign creator uploads CSV:

- Address A → 1 BCH
- Address B → 0.5 BCH
- Address C → 2 BCH

A Merkle tree is generated.

The Merkle root is embedded in the contract.

The contract is funded with the total allocation.

Now:

Address B wants to claim.

They submit their proof.

The contract verifies the Merkle path.

It checks if B has already claimed.

If valid, 0.5 BCH is released.

No admin approves this.
No backend updates a spreadsheet.

The chain validates everything.

## Why This Matters for BCH Projects

Structured airdrops are useful for:

- Grant distributions
- Contributor rewards
- Retroactive funding
- Ecosystem incentives
- Token launches

Manual distribution does not scale well.

With covenant-based validation:

- The creator cannot selectively deny valid claimers.
- The recipient does not need to trust the distributor.
- The contract enforces the allocation exactly as defined.

## Trust Reduction

Traditional airdrops require trust in:

- Whoever runs the distribution script
- Whoever tracks the claims
- Whoever maintains the backend

FlowGuard removes those dependencies.

The contract enforces:

- Eligibility
- Allocation size
- Single-claim rule

If a claim violates the Merkle proof or state rules, it fails automatically.

## BCH-Specific Advantage

Because Bitcoin Cash supports covenant logic and native token primitives, airdrop contracts can:

- Hold BCH
- Hold fungible tokens
- Validate proof logic
- Enforce state transitions

This keeps distribution logic fully inside the UTXO model.

No external oracle required.

## What This Changes

Instead of:

"Trust us, we'll send it."

You get:

"Prove you're eligible, and the contract releases it."

The difference is subtle but important.

One is discretionary.

The other is deterministic and enforced.

## Closing

FlowGuard airdrops move distribution from:

Manual coordination
to
On-chain verification.

Eligibility is proven.
State is tracked.
Funds are released only when conditions are satisfied.

No spreadsheets.
No manual payout scripts.
No hidden approvals.

Next, we'll break down how FlowGuard handles milestone-based budget plans for structured grant funding.
`,
  },
  'how-flowguard-uses-cashtokens-nfts-to-track-vesting-state': {
    slug: 'how-flowguard-uses-cashtokens-nfts-to-track-vesting-state',
    title: 'How FlowGuard Uses CashTokens NFTs to Track Vesting State',
    date: '2026-02-21',
    summary:
      'FlowGuard streams are not database-driven vesting promises. They are covenant-enforced schedules backed by NFT commitments on Bitcoin Cash.',
    tags: ['Education', 'Vesting', 'CashTokens', 'BCH'],
    readingTime: 7,
    author: 'FlowGuard Team',
    content: `
# How FlowGuard Uses CashTokens NFTs to Track Vesting State

## Introduction

Vesting sounds simple:

"Release funds gradually over time."

But on-chain vesting requires something specific:

The contract must remember state.

It must track:

- How much has already been released
- Whether the stream is active or paused
- Where in the schedule we are
- Who the recipient is

FlowGuard solves this using NFT commitments built on Bitcoin Cash through CashTokens.

## Why State Tracking Matters

Without persistent on-chain state, a vesting contract cannot:

- Prevent over-claiming
- Know how much has already been withdrawn
- Track partial releases
- Enforce cliffs and step schedules

If vesting logic depends on a database, it is not enforced by consensus.

FlowGuard moves state tracking fully into the UTXO model.

## The 40-Byte Commitment Structure

Each vesting stream mints a mutable NFT.

Inside that NFT is a 40-byte commitment.

That commitment encodes:

**Status (1 byte)**
- Active
- Paused
- Cancelled
- Completed

**Flags (1 byte)**
- Cancelable
- Transferable
- Token-based stream

**Total Released (8 bytes)**
Tracks how much has already been claimed.

**Time Cursor (5 bytes)**
Used to compute vesting progression.

**Pause Timestamp (5 bytes)**
Tracks when pause began.

**Recipient Hash (20 bytes)**
Locks claims to a specific address.

This structure fits within the CashTokens commitment limit and allows deterministic state updates.

## What Happens During a Claim

When a recipient claims vested funds:

1. The contract calculates how much should be vested at the current block time.
2. It subtracts the totalReleased value.
3. It determines the claimable amount.
4. It updates the NFT commitment:
   - totalReleased increases.
   - Time cursor advances if needed.
5. It creates a new contract output with the updated commitment.
6. It sends the claimable amount to the recipient.

If someone attempts to claim more than allowed, validation fails.

The blockchain rejects the transaction.

## Why Use NFTs Instead of Pure Script Variables?

Because Bitcoin Cash uses the UTXO model.

Contracts do not store mutable variables like account-based systems.

State must live inside UTXOs.

By embedding state inside an NFT commitment:

- The contract always has access to current state.
- State moves forward with each transaction.
- Every update is validated by consensus.

The NFT becomes the state container.

## Linear vs Step Vesting

FlowGuard supports:

**Linear Vesting**

Funds unlock gradually over time.

The contract calculates:

elapsed_time / total_duration x total_amount

**Step Vesting**

Funds unlock in discrete intervals.

Example:

- 1 BCH every 30 days
- 6 milestones total

The contract enforces release boundaries based on timestamp and stored cursor.

Both models rely on the same NFT commitment state.

## What This Prevents

Using NFT-based state prevents:

- Double-claiming
- Over-claiming
- Skipping vesting periods
- Backend-adjusted balances
- Manual overrides

The only way to release funds is through a valid covenant transaction.

## Why This Is BCH-Specific Innovation

CashTokens enable:

- Native token support
- NFT commitments
- Mutable state within UTXOs

FlowGuard leverages these features to implement vesting without:

- External oracles
- Off-chain accounting
- Centralized execution services

This keeps treasury logic inside Bitcoin Cash itself.

## Practical Example

Imagine:

- 12 BCH total stream
- 12-month duration
- Cancelable
- Linear release

After 3 months:

- 3 BCH should be vested
- If 1 BCH was already claimed
- Only 2 BCH can be released now

The contract calculates this based on:

- Current block time
- Stored totalReleased
- Start and end timestamps

The NFT commitment updates accordingly.

There is no spreadsheet tracking.

## Why This Matters for the Ecosystem

BCH projects need:

- Contributor vesting
- Long-term alignment
- Structured grant releases
- On-chain payroll

NFT-based state tracking allows these without relying on centralized infrastructure.

It turns vesting into enforceable protocol logic.

## Closing

FlowGuard streams are not database-driven vesting promises.

They are covenant-enforced schedules backed by NFT commitments on Bitcoin Cash.

The NFT is the state machine.

The contract is the enforcer.

The blockchain is the judge.

Next, we'll break down how FlowGuard handles airdrops using Merkle roots and on-chain proof validation.
`,
  },
  'how-flowguard-vaults-enforce-spending-rules': {
    slug: 'how-flowguard-vaults-enforce-spending-rules',
    title: 'How FlowGuard Vaults Enforce Spending Rules On-Chain',
    date: '2026-02-20',
    summary:
      'FlowGuard vaults extend multisig with policy enforcement — directly on Bitcoin Cash. Learn how approval thresholds, cycle-based unlocking, and spending caps work on-chain.',
    tags: ['Education', 'Vaults', 'Architecture', 'BCH'],
    readingTime: 6,
    author: 'FlowGuard Team',
    cover: '/updates/FlowGuard X post.png',
    content: `
# How FlowGuard Vaults Enforce Spending Rules On-Chain

## Introduction

Multisig is often treated as the final answer to treasury control.

Require 2-of-3 signatures.
Or 3-of-5.
Or 4-of-7.

But multisig only answers one question:

**How many people must approve a transaction?**

It does not answer:

- How much can be spent this month?
- When does the next allocation unlock?
- Can funds be sent to any address?
- What happens if spending exceeds a planned budget?

FlowGuard vaults extend multisig with policy enforcement — directly on Bitcoin Cash.

## What a Vault Actually Stores

When a FlowGuard vault is deployed, it encodes several parameters inside the contract:

- Required approval threshold (M-of-N)
- Signer public key hashes
- Cycle duration (in seconds)
- Per-cycle spending cap
- Unlock amount per cycle
- Optional recipient allowlist

These values are part of the covenant constructor.

They are not editable through a dashboard toggle.

They are part of the contract's rules.

## Layer 1: Approval Threshold

The first enforcement layer is familiar:

The contract checks that the required number of valid signatures is present.

If the threshold is not met, the transaction is invalid.

But FlowGuard does not stop there.

## Layer 2: Cycle-Based Unlocking

Vaults operate in cycles.

**Example:**
- Cycle duration: 30 days
- Unlock amount per cycle: 5 BCH

Even if the vault holds 100 BCH, only 5 BCH may become spendable in a given cycle.

The contract verifies:

- Has the cycle unlocked?
- Has the unlock amount already been consumed?
- Is this payout within the current cycle allocation?

If a payout exceeds the cycle's available allocation, the transaction fails.

This prevents:

- Overspending in a single month
- Draining treasury early
- Violating agreed budget pacing

## Layer 3: Spending Cap Enforcement

A vault can define a per-transaction spending cap.

For example:

- Maximum payout per proposal: 1 BCH

Even if:

- The vault has sufficient balance
- The cycle is unlocked
- All signers approve

The contract will reject any payout exceeding that cap.

This prevents single large withdrawals from bypassing governance intent.

## Layer 4: Recipient Restrictions (Optional)

Vaults can include recipient allowlists.

This means funds can only be sent to:

- Pre-approved addresses
- Contract-linked destinations
- Specific grant recipients

If a transaction attempts to send funds outside the allowed set, it fails at validation.

This is useful for:

- Structured grant disbursement
- Dedicated contributor payments
- Locked ecosystem allocations

## Why This Is Different From "Good Discipline"

Without on-chain enforcement, spending rules rely on:

- Memory
- Social pressure
- Internal agreement

With covenant enforcement, rules are validated by consensus.

It is not about trusting signers to behave correctly.

It is about removing the ability to violate policy.

## Example Scenario

Imagine a vault with:

- 3 signers
- 2-of-3 threshold
- 30-day cycles
- 10 BCH unlock per cycle
- 2 BCH per-transaction cap

In a given cycle:

- Only 10 BCH can move total.
- No single payout can exceed 2 BCH.
- At least 2 signers must approve.

Even if all 3 signers agree to move 15 BCH in one transaction, the contract will reject it.

The rules are not advisory.

They are enforced.

## Why This Matters for Growing Treasuries

As BCH projects scale:

- Treasury size increases
- Contributor count grows
- Grants become more structured
- Risk tolerance decreases

Manual treasury management becomes fragile.

Vault logic turns treasury governance into predictable infrastructure.

Not opinion.
Not memory.
Code.

## Multisig vs Programmable Treasury

**Multisig:**
- Enforces signature count.

**Programmable treasury:**
- Enforces signature count
- Enforces timing
- Enforces pacing
- Enforces caps
- Enforces policy

FlowGuard vaults are programmable treasuries built using BCH covenant capabilities.

## Closing

Treasury security is not just about who signs.

It's about what is allowed.

FlowGuard vaults encode treasury rules directly into contract logic on Bitcoin Cash.

Signers approve.
The contract verifies.
The blockchain enforces.

In the next post, we'll go deeper into how streams use NFT commitments to track vesting state over time.

If you manage capital on BCH, understanding this difference is essential.
`,
  },
  'why-flowguard-is-non-custodial': {
    slug: 'why-flowguard-is-non-custodial',
    title: 'Why FlowGuard Is Non-Custodial (And Why That Matters)',
    date: '2026-02-19',
    summary:
      'FlowGuard does not hold your keys, sign on your behalf, or control funds. Treasury rules are enforced directly by covenant contracts on Bitcoin Cash.',
    tags: ['Security', 'Architecture', 'Deep Dive'],
    readingTime: 7,
    author: 'FlowGuard Team',
    cover: '/updates/FlowGuard Blog Banner.png',
    content: `
# Why FlowGuard Is Non-Custodial (And Why That Matters)

## Introduction

When projects hear "treasury management," the first concern is usually custody.

Who controls the keys?
Who can override transactions?
What happens if the backend goes offline?

FlowGuard is designed so that:

- It does not hold your keys.
- It does not sign on your behalf.
- It cannot move funds.

Everything is enforced directly by covenant contracts on Bitcoin Cash.

## The Core Rule

**If a rule is not enforced on-chain, it is not considered a real rule.**

That means:

- Spending caps must be validated by the contract.
- Approval thresholds must be validated by the contract.
- Vesting calculations must be validated by the contract.
- Milestone releases must be validated by the contract.

The backend can help build transactions.

It cannot make them valid.

Only the blockchain can.

## How Transactions Actually Flow

Let's break down a real example.

### Example: Executing a Vault Proposal

A proposal is created inside a vault contract.

Required signers approve it.

A transaction is constructed referencing the contract UTXO.

Signers sign using their own wallets.

The transaction is broadcast to the network.

At validation time, the contract checks:

- Does the number of approvals meet the threshold?
- Is the payout within the spending cap?
- Is the vault in an unlocked cycle?
- Is the recipient allowed?

If any check fails, the transaction is invalid.

There is no fallback path.

## Wallet Signing Model

FlowGuard follows a simple separation:

### Backend
Reads contract state, builds transaction templates, and indexes blockchain data.

### Wallet
Signs transactions and authorizes fund movement.

### Blockchain
Enforces covenant rules.

The backend never has signing authority.

Even if the backend were compromised, it could not spend treasury funds without valid signatures and valid contract conditions.

## Streams and State Enforcement

For vesting streams, FlowGuard uses NFT commitments via CashTokens.

Each stream tracks state in a 40-byte commitment:

- Status
- Flags
- Total released
- Time cursor
- Recipient hash

When a claim is attempted:

- The contract calculates how much is vested.
- The NFT commitment updates.
- Only the valid portion can be released.

If someone tries to claim more than vested, the contract rejects it.

No backend logic can change that outcome.

## What This Prevents

Non-custodial design prevents:

- Admin key abuse
- Silent overrides
- Database-level balance manipulation
- Hidden rule changes
- Off-chain governance shortcuts

If treasury policy changes, it must change through contract logic — not through server updates.

## Why This Matters for BCH

Bitcoin Cash enables:

- Low fees
- Fast settlement
- UTXO-based scripting

Covenants extend this further by allowing contracts to enforce spending conditions.

FlowGuard uses this capability to shift treasury enforcement from:

**"Please follow the rules."**

to

**"You physically cannot break the rules."**

That distinction is important for:

- Grant programs
- DAO-style organizations
- Contributor payroll
- Long-term ecosystem funding

As treasury size grows, enforcement matters more than trust.

## Failure Modes

A strong system must define what happens when something goes wrong.

- A signer disappears → threshold logic still applies.
- A backend server goes offline → funds remain in contract.
- A wallet UI fails → UTXOs remain valid on-chain.

Treasury logic is not dependent on uptime.

It is dependent on blockchain validation.

## What Non-Custodial Does Not Mean

Non-custodial does not mean "no structure."

It means structure exists at the protocol layer.

FlowGuard contracts still define:

- Who can approve
- When funds unlock
- How much can move
- What conditions must be met

The difference is that enforcement happens at consensus level.

## Closing

FlowGuard does not ask teams to trust a platform.

It encodes treasury rules into covenant contracts on Bitcoin Cash.

Wallet signs.
Blockchain verifies.
Rules are enforced.

In the next post, we'll go deeper into how a vault contract enforces spending caps and approval thresholds internally.

If you're managing treasury on BCH, understanding this separation is essential.
`,
  },
  'what-flowguard-is': {
    slug: 'what-flowguard-is',
    title: 'What FlowGuard Actually Is (And What It Isn’t)',
    date: '2026-02-18',
    summary:
      "FlowGuard isn't a wallet or a database. It's a set of six core covenant modules that enforce treasury rules directly on the Bitcoin Cash blockchain.",
    tags: ['Product', 'Deep Dive', 'Technology'],
    readingTime: 6,
    author: 'FlowGuard Team',
    content: `
# What FlowGuard Actually Is (And What It Isn’t)

## Introduction

In the previous post, we discussed the problem:

**Most BCH teams manage treasury with shared wallets and informal rules.**

Today, we answer a simpler question:

**What exactly is FlowGuard?**

FlowGuard is an on-chain treasury management system built on Bitcoin Cash.

- It is **not** a wallet.
- It is **not** a custodial service.
- It is **not** a database pretending to be on-chain.

It is a set of **covenant contracts** that enforce treasury rules directly on the blockchain.

## The Core Modules

FlowGuard is composed of six primary modules.

Each one addresses a real treasury use case inside the BCH ecosystem.

### 1. Multisignature Vaults

Vaults are programmable treasuries.

They enforce:

- M-of-N approval thresholds
- Per-cycle spending caps
- Time-based unlock windows
- Optional recipient restrictions

Signers must approve transactions — but approval alone is not enough.

The contract still verifies:

- Is this within the allowed cap?
- Has the current cycle unlocked?
- Does this payout violate treasury policy?

The rules are encoded in the contract itself.

### 2. Vesting Streams

Streams handle structured payments over time.

Examples:

- Contributor salaries
- Team token vesting
- Grant distributions

State is tracked using CashTokens NFT commitments.

Each stream stores:

- Current status
- Total released
- Time cursor
- Recipient identity

When a claim occurs, the NFT commitment updates.

The contract calculates what is vested.
The chain enforces the release.

### 3. Recurring Payments

Recurring payments allow fixed-interval releases:

- Daily
- Weekly
- Monthly

Instead of manually sending payroll each period, the contract enforces:

- Interval timing
- Release amounts
- Remaining balance

No one needs to “remember” to execute payments.

### 4. Merkle Airdrops

FlowGuard supports structured distribution using:

- A Merkle root embedded in the contract
- Proof-based claiming
- On-chain double-claim prevention

Recipients submit cryptographic proof.

The contract verifies eligibility.

No manual distribution required.

### 5. Governance Voting

Governance is handled with:

- Token locking
- Vote recording
- Tally commitments

Votes are tied to locked tokens.

The contract enforces:

- Voting period
- Eligibility
- Execution rules

There is no hidden counting process off-chain.

### 6. Budget Plans

Budget plans support milestone-based funding.

Instead of releasing full funding upfront:

- Funds unlock in steps
- Milestones are enforced
- Releases follow schedule rules

This reduces risk in grant programs and development funding.

## What FlowGuard Is Not

It’s important to be precise.

FlowGuard is **not**:

- A custodial treasury manager
- A centralized execution engine
- A backend-controlled wallet

The backend improves UX and indexing.

It does not control funds.

All treasury policies are enforced by covenant logic on Bitcoin Cash.

**If a rule fails, the transaction fails on-chain.**

## Why This Matters for the BCH Ecosystem

Bitcoin Cash already enables:

- Peer-to-peer payments
- Fast settlement
- Low fees

FlowGuard extends BCH into:

- DAO infrastructure
- Grant distribution systems
- Structured treasury control
- On-chain organizational coordination

It allows BCH to support not just transactions — but governance and capital management.

That is a meaningful expansion of capability.

## The Design Philosophy

FlowGuard follows three principles:

### Non-custodial
Users sign transactions in their own wallets.

### On-chain enforcement
Treasury rules live inside covenant contracts.

### Minimal trust
No hidden admin keys.
No override switches.

If it isn’t enforced by script, it isn’t considered a rule.

## Closing

FlowGuard is not trying to replace wallets.

It’s trying to move treasury logic from conversations to code.

In the next post, we’ll break down how FlowGuard remains non-custodial — and why that matters for real BCH teams managing real capital.

If you’re building on Bitcoin Cash and managing treasury, this is infrastructure worth understanding.
`,
  },
  'bch-treasury-problem': {
    slug: 'bch-treasury-problem',
    title: 'The Problem With How BCH Teams Manage Treasury Today',
    date: '2026-02-17',
    summary: 'Most BCH teams manage treasury with shared wallets and verbal rules.',
    tags: ['Education', 'Treasury', 'BCH', 'Governance'],
    readingTime: 8,
    author: 'FlowGuard Team',
    content: `
# The Problem With How BCH Teams Manage Treasury Today

## Introduction

Most teams in the Bitcoin Cash ecosystem manage treasury the same way:

- A shared wallet
- A few trusted signers
- Verbal rules about how money should be spent

It works — until it doesn't.

As treasury size grows, the risks grow with it.

FlowGuard starts with a simple premise:

**Treasury rules should be enforced by the blockchain, not by memory or trust.**

## The Real Risks Teams Face

Let's break this down clearly.

### 1. Shared Wallet Risk

Even with multisig, there are real issues:

- A signer disappears or loses access
- A signer is compromised
- Signers disagree about what "allowed spending" means

Multisig only enforces **how many signatures are needed**.

It does not enforce:

- Spending limits
- Budget cycles
- Time-based restrictions
- Allowed recipients
- Structured releases

The logic is still off-chain.

### 2. Informal Budget Rules

Most projects operate like this:

> "We'll only spend X per month."
> "We won't exceed Y without discussion."
> "We'll release funds milestone by milestone."

But those rules exist in:

- Telegram chats
- Notion docs
- Google Sheets
- Verbal agreements

**The blockchain doesn't know those rules.**

So the blockchain cannot enforce them.

### 3. Governance Drift

As teams grow:

- More contributors
- Larger treasury
- Grant allocations
- Payroll commitments

Treasury management becomes coordination infrastructure.

If that infrastructure is weak, everything built on top of it is fragile.

## What Changes When Rules Move On-Chain

FlowGuard approaches treasury differently.

Instead of trusting that signers will follow off-chain rules, the rules are encoded directly in covenant contracts on Bitcoin Cash.

A FlowGuard vault enforces:

- M-of-N approval thresholds
- Per-cycle spending caps
- Time-based unlock windows
- Optional recipient allowlists

**Even if all signers agree, a payout cannot exceed the contract's constraints.**

The rules are part of the script.

Not part of a conversation.

## Why This Matters for BCH

Bitcoin Cash is already good at payments.

But for an ecosystem to grow, it needs:

- Structured grant distribution
- Contributor vesting
- Milestone-based funding
- DAO-style treasury control
- Transparent on-chain governance

If treasury logic lives off-chain, BCH is only a payment rail.

If treasury logic lives on-chain, BCH becomes programmable coordination infrastructure.

**That is a major difference.**

## Why Multisig Alone Is Not Enough

Multisig answers one question:

**"How many people must approve this transaction?"**

It does not answer:

- How much can be spent this month?
- When does the next allocation unlock?
- Has a milestone been reached?
- Is this payout within budget?

FlowGuard vaults extend multisig with policy enforcement.

Approval is necessary — but not sufficient.

The contract still checks:

- Spending cap
- Current cycle
- Unlock amount
- Contract state

This reduces human error and removes ambiguity.

## The Core Principle

If your project treasury is:

- Funding development
- Paying contributors
- Running grants
- Managing ecosystem capital

Then treasury logic should not rely on memory, goodwill, or discipline.

**It should be enforced by the chain.**

That is the starting point for FlowGuard.

## What Comes Next

In the next posts, we'll break down:

- How vault contracts enforce spending caps
- How streams use NFT commitments to track vesting
- How airdrops prevent double-claiming on-chain
- How governance votes are recorded in covenant state

All running on Bitcoin Cash.

This is not theory.

**This is implementation.**

## Closing

If you're building on BCH and managing real funds, ask yourself:

**Where do your treasury rules live?**

If the answer is "in chat," it might be time to move them on-chain.

[Launch App](/vaults)
    `,
  },
  'alpha-launch-chipnet': {
    slug: 'alpha-launch-chipnet',
    title: 'FlowGuard Alpha Launches on BCH Chipnet',
    date: '2026-02-15',
    summary:
      'Introducing FlowGuard: BCH-native treasuries, streams, payments, distributions, and governance with contract-backed execution.',
    tags: ['Launch', 'Alpha', 'Chipnet'],
    readingTime: 5,
    author: 'FlowGuard Team',
    content: `
# FlowGuard Alpha Launches on BCH Chipnet

We're excited to announce the alpha release of FlowGuard on Bitcoin Cash Chipnet. FlowGuard brings BCH-native treasuries, streams, payments, distributions, and governance with contract-backed execution to Bitcoin Cash.

## What is FlowGuard?

FlowGuard is a BCH-native operating layer for treasury and payout workflows. It allows organizations to:

- **Automate payments** on fixed schedules
- **Enforce spending limits** that cannot be bypassed
- **Require approvals** for large expenses
- **Track all activity** transparently on-chain

## Key Features

### Treasury Management
Create multi-asset treasuries with signer thresholds, spending policies, proposal-backed execution, and activity review.

### Streams & Vesting
Launch linear, cliffed, hybrid, milestone, tranche, and recurring schedules with contract-backed claims and schedule previews.

### Payments
Execute one-time, recurring, and refillable recurring payouts with explicit cadence and auditable execution.

### Governance
On-chain governance with configurable voting rules for democratic decision-making.

## What's Next

We're focused on gathering feedback from early users and preparing for mainnet launch. Key milestones include:

- External security audits
- Beta testing program
- Mainnet deployment (post-audit)
- Advanced features leveraging May 2026 BCHN Layla upgrade

## Get Started

Connect your BCH wallet and create your first treasury on Chipnet. We recommend using Paytaca wallet for the best experience.

[Launch App](/vaults)
    `,
  },
  'treasury-automation-explained': {
    slug: 'treasury-automation-explained',
    title: 'Why Treasury Automation Matters',
    date: '2026-02-10',
    summary:
      'Manual treasury and payout operations are error-prone, hard to audit, and difficult to scale.',
    tags: ['Education', 'Treasury', 'Automation'],
    readingTime: 8,
    author: 'FlowGuard Team',
    content: `
# Why Treasury Automation Matters

Manual treasury and payout operations are error-prone, time-consuming, and hard to audit. Here's why contract-backed automation matters.

## The Problem with Manual Processes

Traditional multisig wallets require manual coordination for every payment. Budgets are tracked in spreadsheets. Spending caps aren't enforced—they're just guidelines.

### Key Issues:
- Manual coordination for every payment
- Budget tracking is error-prone
- No automatic audit trail
- Trust is social, not technical

## How FlowGuard Solves This

FlowGuard automates treasury operations while maintaining security and transparency.

### Automated Enforcement
Set the rules once, and the blockchain enforces them automatically. Spending caps that can't be exceeded. Approval requirements that can't be bypassed.

### Scheduled Payments
Payments follow explicit contract-backed schedule families. Vesting claims, recurring payouts, and linked treasury releases happen through verifiable on-chain transitions.

### Complete Transparency
All activity is publicly visible on the blockchain. Anyone can audit treasury operations.

## Real-World Use Cases

### DAO Treasury Management
Automate contributor payments, enforce spending limits, and maintain transparent operations.

### Token Vesting
Release tokens to team members and investors on a fixed schedule with no manual intervention.

### Grant Programs
Distribute funds to multiple recipients efficiently with automated execution.

## Getting Started

Ready to automate your treasury? [Launch the app](/vaults) and create your first automated payment schedule.
    `,
  },
};

// Helper function to render inline formatting (bold, etc.)
function renderInlineFormatting(text: string) {
  const parts = [];
  let currentIndex = 0;
  const boldRegex = /\*\*(.+?)\*\*/g;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > currentIndex) {
      parts.push(text.substring(currentIndex, match.index));
    }
    // Add the bold text
    parts.push(
      <strong key={match.index} className="font-semibold text-textPrimary">
        {match[1]}
      </strong>
    );
    currentIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function UpdateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? BLOG_POSTS[slug] : null;

  if (!post) {
    return (
      <main className="bg-background min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-32 text-center">
          <h1 className="font-display text-4xl font-bold text-textPrimary mb-4">Post Not Found</h1>
          <Link to="/updates" className="text-primary hover:text-primaryHover">
            ← Back to Updates
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title={post.title}
        description={post.summary}
        path={`/updates/${post.slug}`}
        image={post.cover}
        imageAlt={post.title}
        type="article"
      />
      {/* Header */}
      <div className="bg-surface border-b border-border">
        {post.cover && (
          <div className="w-full overflow-hidden">
            <img src={post.cover} alt={post.title} className="w-full h-auto" />
          </div>
        )}
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link
            to="/updates"
            className="inline-flex items-center gap-2 text-textSecondary hover:text-textPrimary transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Updates
          </Link>

          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-surfaceAlt text-textMuted text-sm font-medium rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-bold text-textPrimary mb-6">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-6 text-sm text-textMuted">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {new Date(post.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {post.readingTime} min read
            </div>
            {post.author && <div className="text-textSecondary">By {post.author}</div>}
          </div>
        </div>
      </div>

      {/* Content */}
      <article className="max-w-4xl mx-auto px-6 py-12">
        <div className="prose prose-lg max-w-none">
          {post.content.split('\n').map((line, i) => {
            // Skip the first H1 (duplicate title)
            if (line.startsWith('# ') && i < 5) {
              return null;
            }
            if (line.startsWith('# ')) {
              return (
                <h1 key={i} className="font-display text-4xl font-bold text-textPrimary mt-12 mb-6">
                  {line.slice(2)}
                </h1>
              );
            }
            if (line.startsWith('## ')) {
              return (
                <h2 key={i} className="font-display text-2xl font-bold text-textPrimary mt-8 mb-3">
                  {line.slice(3)}
                </h2>
              );
            }
            if (line.startsWith('### ')) {
              return (
                <h3
                  key={i}
                  className="font-display text-xl font-semibold text-textPrimary mt-6 mb-2"
                >
                  {line.slice(4)}
                </h3>
              );
            }
            if (line.startsWith('> ')) {
              return (
                <blockquote
                  key={i}
                  className="border-l-4 border-primary/30 pl-4 italic text-textSecondary my-3"
                >
                  {line.slice(2)}
                </blockquote>
              );
            }
            if (line.startsWith('- ')) {
              return (
                <li key={i} className="text-textSecondary ml-6 mb-1.5">
                  {renderInlineFormatting(line.slice(2))}
                </li>
              );
            }
            if (line.startsWith('[') && line.includes('](')) {
              const match = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
              if (match) {
                return (
                  <p key={i} className="my-4">
                    <Link
                      to={match[2]}
                      className="text-primary hover:text-primaryHover font-semibold"
                    >
                      {match[1]} →
                    </Link>
                  </p>
                );
              }
            }
            if (line.trim() === '') {
              return <div key={i} className="h-3" />;
            }
            return (
              <p key={i} className="text-textSecondary leading-relaxed mb-3">
                {renderInlineFormatting(line)}
              </p>
            );
          })}
        </div>

        {/* Social Engagement Section */}
        <div className="mt-16 pt-12 border-t border-border">
          <h3 className="font-display text-2xl font-bold text-textPrimary mb-6">
            Join the Conversation
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <a
              href="https://x.com/flowguard_"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-surface border border-border rounded-xl hover:border-primary/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Twitter className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-textPrimary">Discuss on X</div>
                <div className="text-sm text-textSecondary">Share your thoughts</div>
              </div>
            </a>

            <a
              href="https://warpcast.com/flowguard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-surface border border-border rounded-xl hover:border-primary/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-textPrimary">Discuss on Farcaster</div>
                <div className="text-sm text-textSecondary">Join the conversation</div>
              </div>
            </a>

            <a
              href="https://t.me/flowguard_cash"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-surface border border-border rounded-xl hover:border-primary/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-textPrimary">Join the Community</div>
                <div className="text-sm text-textSecondary">Connect on Telegram</div>
              </div>
            </a>

            <a
              href="https://github.com/winsznx/flow-guard/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-surface border border-border rounded-xl hover:border-primary/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-textPrimary">Submit Feedback</div>
                <div className="text-sm text-textSecondary">Help us improve</div>
              </div>
            </a>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
