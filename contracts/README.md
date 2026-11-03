# FlowGuard Contracts

CashScript covenants for FlowGuard treasuries, streaming, and distributions.

Each covenant is self-enforcing: once funded, the rules live on chain and neither
FlowGuard nor the creator can move funds outside what the contract permits.

## Layout

Sources are grouped by product area under `core/`, and each compiles to a JSON artifact
under `artifacts/` that the backend imports at runtime.

```
core/
  treasury/     VaultCovenant, ProposalCovenant
  streaming/    VestingCovenant, FtVestingCovenant, HybridVestingCovenant,
                RecurringPaymentCovenant, TrancheVestingCovenant, and a V2 of each
                except FtVestingCovenant
  distribution/ AirdropCovenant, RewardCovenant, BountyCovenant, GrantCovenant,
                and a V2 of each
  governance/   VoteLockCovenant, TallyCommitment_FixedMax, TallyCommitment_Attested
                (kept for reference, the app no longer offers votes)
artifacts/      compiled output, committed and consumed by the backend
tests/          unit, streaming, integration, chipnet, and benchmarks
```

`VestingCovenant` is the BCH single-UTXO form; `FtVestingCovenant` is the two-UTXO form
for CashToken fungible tokens. They are separate contracts, not a mode switch.

The V2 covenants keep V1's constructor parameters and commitment layout. They compare a
token payout's category with the first 32 bytes of the input category, allow one extra
output where the contract pays its own fee, return the unused reserve when a distribution
is cancelled, and fix the token check in recurring `refill()`. New contracts deploy V2.
Contracts already on chain keep the version their address was derived from, so V1 sources
and artifacts must not change.

## Build

```bash
pnpm build              # every covenant -> artifacts/
pnpm build:streaming    # one group
```

Artifacts are committed, because the backend imports them directly rather than compiling
at runtime. A source edit that is not rebuilt and committed ships a backend bound to
stale bytecode.

```bash
pnpm check              # cashc syntax check, no output written
pnpm check:drift        # rebuild and diff against what is committed
```

`check:drift` is what CI gates on. It ignores the `updatedAt` field, which `cashc`
stamps on every build.

## Test

```bash
pnpm test               # unit
pnpm test:streaming
pnpm test:integration
pnpm test:chipnet       # requires a funded chipnet wallet
pnpm test:all
```

Benchmarks measure how covenant size and cost scale with signer, vote, and recipient
counts — see [tests/benchmarks](./tests/benchmarks).

```bash
pnpm benchmark:all
```

## Working on a covenant

1. Edit the `.cash` source under `core/`.
2. `pnpm check` for syntax.
3. `pnpm build` to regenerate the artifact.
4. `pnpm test` — and add a case, since a covenant bug is unrecoverable once funded.
5. Commit source and artifact together.

The 40-byte NFT commitment is the binding constraint on covenant state. Every field a
contract needs across a spend has to fit there, which is why several covenants pack
counters into 5-byte timestamps and bitfield flags rather than using whole words. See
the commitment layout comment at the top of each source.

## Docs

Concepts and per-product guides: [docs.flowguard.cash](https://docs.flowguard.cash).
