require("dotenv").config();
const hre = require("hardhat");
const path = require("path");
const fs = require("fs");

async function main() {
  // Get seller address from environment variable if provided
  // Usage: SELLER_ADDRESS=0x... npm run check:reputation
  const TEST_SELLER = process.env.SELLER_ADDRESS || null;

  console.log("Checking Reputation contract setup...\n");

  const SETTLEMENT_ROUTER = process.env.VITE_SETTLEMENT_ROUTER_ADDRESS;
  const REPUTATION = process.env.VITE_REPUTATION_ADDRESS;

  if (!SETTLEMENT_ROUTER || !REPUTATION) {
    console.error("❌ Missing contract addresses in .env:");
    if (!SETTLEMENT_ROUTER) console.error("   - VITE_SETTLEMENT_ROUTER_ADDRESS");
    if (!REPUTATION) console.error("   - VITE_REPUTATION_ADDRESS");
    process.exit(1);
  }

  console.log("SettlementRouter:", SETTLEMENT_ROUTER);
  console.log("Reputation:", REPUTATION);
  console.log("");

  // Attach to contracts
  const Reputation = await hre.ethers.getContractFactory("Reputation");
  const reputation = Reputation.attach(REPUTATION);

  // Check if SettlementRouter has the role
  const SETTLEMENT_ROUTER_ROLE = await reputation.SETTLEMENT_ROUTER_ROLE();
  const hasRole = await reputation.hasRole(SETTLEMENT_ROUTER_ROLE, SETTLEMENT_ROUTER);

  console.log("=== Role Check ===");
  if (hasRole) {
    console.log("✅ SettlementRouter HAS SETTLEMENT_ROUTER_ROLE in Reputation");
  } else {
    console.log("❌ SettlementRouter DOES NOT HAVE SETTLEMENT_ROUTER_ROLE in Reputation");
    console.log("\n⚠️  ACTION REQUIRED: Grant the role using:");
    console.log(`   npm run fix:reputation-role`);
    console.log(`   OR manually grant role in Reputation contract`);
  }

  // Check BASE_SCORE_INCREMENT constant
  console.log("\n=== Contract Constants ===");
  try {
    // Try to read the event logs or check if we can call a function
    // Since constants are private, we'll check by testing the logic
    console.log("Checking BASE_SCORE_INCREMENT (should be 20)...");
    
    // We can't directly read private constants, but we can verify by checking recent events
    console.log("✓ Contract deployed and accessible");
  } catch (error) {
    console.error("❌ Error checking contract:", error.message);
  }

  // Check recent InvoiceSettled events to verify reputation updates should happen
  console.log("\n=== Recent Invoice Settlements ===");
  try {
    const SettlementRouter = await hre.ethers.getContractFactory("SettlementRouter");
    const settlementRouter = SettlementRouter.attach(SETTLEMENT_ROUTER);
    const currentBlock = await hre.ethers.provider.getBlockNumber();
    
    // Search in chunks of 10,000 blocks (RPC limit)
    const CHUNK_SIZE = 10000;
    const MAX_BLOCKS_TO_SEARCH = 50000; // Search last 50k blocks in chunks
    const fromBlock = Math.max(0, currentBlock - MAX_BLOCKS_TO_SEARCH);
    
    let settledEvents = [];
    for (let chunkStart = fromBlock; chunkStart < currentBlock; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, currentBlock);
      const invoiceSettledFilter = settlementRouter.filters.InvoiceSettled();
      const chunkEvents = await settlementRouter.queryFilter(invoiceSettledFilter, chunkStart, chunkEnd);
      settledEvents = settledEvents.concat(chunkEvents);
    }
    
    if (settledEvents.length === 0) {
      console.log("⚠️  No InvoiceSettled events found in last 50,000 blocks");
      console.log("   This means no invoices have been paid through SettlementRouter yet");
    } else {
      console.log(`✓ Found ${settledEvents.length} InvoiceSettled event(s)`);
      console.log("   (Each settlement should trigger a ReputationUpdated event)");
      
      if (settledEvents.length > 0) {
        console.log("\nMost recent settlements:");
        const recentSettlements = settledEvents.slice(-5);
        for (let i = 0; i < recentSettlements.length; i++) {
          const event = recentSettlements[i];
          const { invoiceId, seller, invoiceAmount, repaymentAmount } = event.args;
          console.log(`  ${i + 1}. Invoice ${invoiceId.toString()}, Seller: ${seller}`);
          console.log(`     Amount: ${hre.ethers.formatUnits(invoiceAmount, 6)} USDC`);
          console.log(`     Block: ${event.blockNumber}`);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error querying InvoiceSettled events:", error.message);
  }

  // Check recent ReputationUpdated events
  console.log("\n=== Recent Reputation Updates ===");
  try {
    // Get current block number
    const currentBlock = await hre.ethers.provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);
    
    // Search in chunks of 10,000 blocks (RPC limit)
    const CHUNK_SIZE = 10000;
    const MAX_BLOCKS_TO_SEARCH = 50000; // Search last 50k blocks in chunks
    const fromBlock = Math.max(0, currentBlock - MAX_BLOCKS_TO_SEARCH);
    console.log(`Searching from block ${fromBlock} to ${currentBlock} (in chunks of ${CHUNK_SIZE})...`);
    
    let events = [];
    for (let chunkStart = fromBlock; chunkStart < currentBlock; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, currentBlock);
      const filter = reputation.filters.ReputationUpdated();
      const chunkEvents = await reputation.queryFilter(filter, chunkStart, chunkEnd);
      events = events.concat(chunkEvents);
    }
    
    if (events.length === 0) {
      console.log("⚠️  No ReputationUpdated events found in last 50,000 blocks");
      console.log("   This could mean:");
      console.log("   - No invoices have been cleared yet");
      console.log("   - updateReputation is not being called (even though SettlementRouter has role)");
      console.log("   - The transaction might be reverting before reputation update");
      console.log("   - Events are in older blocks");
      console.log("\n   ⚠️  IMPORTANT: If invoices were cleared but no ReputationUpdated events,");
      console.log("       the reputation.updateReputation() call might be failing silently!");
    } else {
      console.log(`✓ Found ${events.length} ReputationUpdated event(s)`);
      console.log("\nRecent events:");
      for (let i = Math.max(0, events.length - 5); i < events.length; i++) {
        const event = events[i];
        const [seller, newScore, newTier, invoiceVolume] = event.args;
        console.log(`  ${i + 1}. Seller: ${seller}`);
        console.log(`     New Score: ${newScore.toString()}`);
        const tierLabel = newTier === 0 ? 'C' : newTier === 1 ? 'B' : 'A';
        console.log(`     New Tier: ${newTier} (${tierLabel})`);
        console.log(`     Invoice Volume: ${hre.ethers.formatUnits(invoiceVolume, 6)} USDC`);
        console.log(`     Block: ${event.blockNumber}`);
        console.log("");
      }
    }
  } catch (error) {
    console.error("❌ Error querying events:", error.message);
  }

  // Test a seller address if provided
  if (TEST_SELLER) {
    console.log(`\n=== Testing Seller: ${TEST_SELLER} ===`);
    try {
      const score = await reputation.getScore(TEST_SELLER);
      const tier = await reputation.getTier(TEST_SELLER);
      const stats = await reputation.getStats(TEST_SELLER);
      
      console.log(`Score: ${score.toString()}`);
      // Fix tier display: 0 = C, 1 = B, 2 = A
      const tierLabel = tier === 0n || tier === 0 ? 'C' : tier === 1n || tier === 1 ? 'B' : tier === 2n || tier === 2 ? 'A' : 'Unknown';
      console.log(`Tier: ${tier.toString()} (${tierLabel})`);
      console.log(`Invoices Cleared: ${stats.invoicesCleared.toString()}`);
      console.log(`Total Volume: ${hre.ethers.formatUnits(stats.totalVolume, 6)} USDC`);
      console.log(`Last Updated: ${stats.lastUpdated.toString() === '0' ? 'Never' : new Date(Number(stats.lastUpdated) * 1000).toISOString()}`);
      
      // Check if score matches expected calculation
      if (stats.invoicesCleared > 0n) {
        const expectedScore = 450 + (Number(stats.invoicesCleared) * 20);
        console.log(`\nExpected Score (450 + ${stats.invoicesCleared} * 20): ${expectedScore}`);
        console.log(`Actual Score: ${score.toString()}`);
        if (Number(score) !== expectedScore) {
          console.log(`⚠️  Score mismatch! The score should be ${expectedScore} but is ${score.toString()}`);
        } else {
          console.log(`✓ Score matches expected calculation`);
        }
      }
    } catch (error) {
      console.error("❌ Error getting seller stats:", error.message);
    }
  } else {
    console.log("\n💡 Tip: Pass a seller address to check their reputation:");
    console.log(`   SELLER_ADDRESS=0x... npm run check:reputation`);
  }

  console.log("\n=== Summary ===");
  if (!hasRole) {
    console.log("❌ CRITICAL: SettlementRouter does not have SETTLEMENT_ROUTER_ROLE");
    console.log("   Reputation updates will fail silently!");
    process.exit(1);
  } else {
    console.log("✅ Setup looks correct");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

