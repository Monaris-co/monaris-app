# SETTL. - Project Introduction

## What is SETTL?

SETTL is a **Stripe-like invoice link** that turns accounts receivable into RealFi rails on Mantle: businesses get paid in stablecoins, unlock instant financing against invoices/cashflows, and build an on-chain reputation that improves terms over time.

**Tagline:** *Stripe-like invoices on-chain, instantly.*

Stripe-like invoice links + DeFi liquidity on Mantle. Get paid in stablecoins, unlock financing, and build verifiable business reputation.

---

## Project Evaluation

**Why this will win:**

1. **Clear pain + huge market:** In the U.S. alone, outstanding accounts receivable is ~$3.1T ("net terms economy"). (as per PYMNTS.com)

2. **Strong Mantle fit:** High-frequency invoice actions (issue, finance, pay, settle) need low fees + fast finality

3. **Real on-chain execution:** One transaction settlement waterfall (fee → vault repay → seller)

4. **Composable RealFi primitive:** Receivables become programmable objects that other DeFi apps can integrate

5. **Trust layer:** zkTLS proofs + reputation makes "first invoice" credible

---

## One-Pager Pitch

### Tagline
**Receivables, settled like Stripe — Instant financed like DeFi.**

### The Problem

Accounts receivable is a cashflow trap:
- Businesses wait 30–90 days to get paid, while payroll and vendors are due now. (as per NetSuite)
- Even in the U.S. alone, receivables locked in outstanding invoices are ~$3.1T on any given day. (as per PYMNTS.com)
- Existing factoring/financing is slow, paperwork heavy, and priced for institutions—not builders/SMBs.
- RealFi/RWA in crypto often tokenizes pools, but the UX is not "invoice link simple".

### The Solution

**SETTL is a Receivables & Settlement Rail built on Mantle**

- **Invoice link (Stripe UX):** Seller creates an invoice → gets a payment link instantly.
- **Real settlement (DeFi rails):** Buyer pays in stablecoins → smart contracts route funds atomically.
- **Instant financing:** Seller can take an advance against an invoice/cashflow from the liquidity pool.
- **Portable reputation:** Every paid invoice improves a business score that upgrades terms.

### How It Works (Under the Hood)

1. **Create invoice** (on-chain object) → Tokenized using ERC721
2. **LP funds pool** in USDC
3. **Seller requests advance** (e.g., 70–80% LTV depending on score/proofs)
4. **Buyer pays invoice**
5. **Settlement waterfall** (single tx):
   - Protocol fee to treasury
   - Repay vault if invoice was financed
   - Remainder to seller
6. **Reputation updated** automatically

### Funding Pool Tokens

To make the pool legible and demo-ready:

- **Deposit USDC → mint USMT+ (1:1)**
  - USMT+ is a receipt token representing claim on pool assets (like a vault share, priced at ~1 in early demo).
  
- **Stake USMT+ → receive sUSMT+**
  - sUSMT+ is the staked yield position targeting 15–25% APY, credit-backed by borrower repayments (invoice/cashflow advances).
  - Yield source: interest + fees paid by borrowers
  - Risk narrative: "short-duration, self-liquidating receivables"
  
**UX narrative:** "USDC in → USMT+ out → stake → earn"

**In simple terms for judges:**
- USMT+ = liquidity receipt
- sUSMT+ = position first-loss / cooldown / higher yield (powered by receivables repayments)

**Algorithm:**
- **USMT+** = liquid receipt token minted 1:1 when LPs deposit USDC
- **sUSMT+** = staked receipt token minted when users stake USMT+ (first-loss / cooldown / higher yield), Enhanced Yield 15-25% APY range
- **IRUSMT+** = Interest rate (implied APY) of the USMT+ tranche. Subject to SETTL protocol risk parameter updates (utilization curve, reserve factor, max LTV, loss buffer, etc.)
- **IRsUSMT+** = Interest rate (implied APY) of the sUSMT+ tranche. Subject to SETTL protocol risk parameter updates (staking boost multiplier, lock/unstake rules, tranche weights, late-penalty share, etc.)

### Reputation (Including "First Invoice" Problem)

**Issue:** first-time users have no on-chain history.

**SETTL answer (demo + real path):**

- **Reputation v0 = Proof-based starter score:** zkTLS proofs (via Reclaim) verify business signals without leaking raw data (e.g., invoice system receipts, bank inflows, CEX Balances (ex. ByBit) platform revenue).

- **Reputation v1 = Performance score:** each paid invoice updates score based on:
  - pay-on-time rate
  - invoice size consistency
  - defaults/late payments
  - utilization + repayment behavior

**Outcome:** even on invoice #1, a user can qualify for sane limits using zkTLS—then graduate into better terms via performance.

### Why Mantle

Receivables are high-volume, low-margin transactions—fees matter.

Mantle's low gas enables:
- invoice issuance at scale
- frequent partial repayments (future)
- automated settlement routing without killing margins

### Business Model (Clean + Believable)

- **Settlement fee** (e.g., 30–80 bps) on paid invoices
- **Financing spread** (borrow APR − LP APY)
- **Staking fee** on sUSMT+ yield (protocol performance fee)
- **B2B SaaS/API** (later): accounting integrations, reconciliation, analytics, compliance exports

### Roadmap (Credible Milestones)

**Now:**
- ✅ Invoice link + on-chain invoice registry
- ✅ Vault deposits (USDC → USMT+)
- ✅ Stake (USMT+ → sUSMT+) with APY display
- ✅ Advance + settlement waterfall in one tx
- ✅ Basic reputation update + zkTLS proof demo

**Next 90 days:**
- Real integrations (QuickBooks/Xero/Stripe/Wise/ByBit receipts via zkTLS)
- Risk tiers + dynamic LTV/APR
- Secondary "invoice position exit" primitives (optional)

**12 months:**
- Underwriter marketplace (licensed partners)
- Jurisdictional compliance mode (KYC/AML where needed)
- Multi-pool: USDC, USDT, regional rails

---

## TLDR

SETTL is Stripe for invoices and cashflows, but the money engine is DeFi on Mantle.

A business creates an invoice link in minutes. The buyer pays in stablecoins. And the entire settlement happens in one atomic onchain flow: protocol fee is taken, any outstanding advance is repaid back to the vault, and the remainder is paid to the seller instantly. No waiting 30–90 days, no reconciliation hell.

Under the hood, SETTL turns receivables into RealFi rails:
- sellers can unlock instant financing against invoices and verified future cashflows
- zkTLS proofs bootstrap trust on day one (income, invoices, platform receipts) without exposing raw data
- every successful repayment and on-time settlement updates an onchain reputation, which improves terms over time (higher limits, higher LTV, lower pricing)

On the liquidity side, LPs deposit USDC to mint USMT+ 1:1 as the funding receipt token. They can hold USMT+ liquid, or stake it into sUSMT+ to earn 15–25% APY that is credit backed by real borrower repayments and risk tiering. Yield is not "infinite emissions"—it comes from cashflows.

**In one line:**
SETTL turns accounts receivable into programmable settlement and credit rails so businesses get paid instantly and LPs earn real yield from real commerce.

---

## Learn More

- **Repository:** [GitHub](https://github.com/Adityaakr/SETTL.)
- **Contact:** Telegram @Adityaakrx | Twitter @adityakrx
- **Documentation:** See [README.md](./README.md) for setup and deployment instructions
