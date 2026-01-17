import { motion } from "framer-motion"
import { ArrowRight, Zap, Shield, TrendingUp, Play, Link2, Layers, Lock, PieChart } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { WaterfallAnimation } from "@/components/features/WaterfallAnimation"

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/monar.png" alt="Monaris" className="h-8 w-auto" />
          </Link>
          
          <nav className="hidden items-center gap-8 md:flex">
            <Link to="/product" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Product
            </Link>
            <Link to="/how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              How It Works
            </Link>
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </Link>
            <Link to="/docs" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Docs
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Button variant="hero" asChild>
              <Link to="/app">
                Go to App
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-accent/10 blur-3xl" />
        
        <div className="container relative mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-4xl"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
              <Zap className="h-4 w-4" />
              Powered by Arbitrum
            </div>
            
            <h1 className="mb-6 text-4xl sm:text-5xl font-bold leading-tight tracking-tight md:text-7xl lg:text-8xl">
              Get paid instantly. Finance tomorrow's
              <br />
              <span className="gradient-text"> cashflow today.</span>
            </h1>
            
            <p className="mx-auto mb-10 max-w-2xl text-xl text-muted-foreground md:text-2xl">
              Stripe for receivables: tokenized invoice links → instant stablecoin settlement with built-in financing. Buyer pays once, advances auto-repays, seller settles instantly—building zk-reputation and higher limits over time.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button variant="hero" size="xl" asChild>
                <Link to="/app">
                  Start Creating Invoices
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button variant="hero-outline" size="xl" asChild>
                <Link to="/how-it-works">
                  <Play className="h-5 w-5" />
                  See How It Works
                </Link>
              </Button>
            </div>
          </motion.div>

          {/* Waterfall Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-20"
          >
            <WaterfallAnimation />
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <div className="mb-4 inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
              Real-World Asset Tokenization
            </div>
            <h2 className="mb-4 text-7xl font-bold md:text-4xl">
            Everything you need to scale your global business
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Monaris eliminates B2B payment friction with Stripe-like UX and DeFi rails. 
Every invoice becomes a tokenized asset—instantly settleable, financeable, 
and tradeable on secondary markets.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Link2}
              title="Instant Settlements"
              description="Every invoice automatically becomes an ERC721 NFT, representing a tokenized real-world receivable asset."
              delay={0}
              signature
            />
            <FeatureCard
              icon={Zap}
              title="Seller Financing"
              description="Unlock up to 90% of your invoice value instantly with our DeFi-backed vault."
              delay={0.1}
            />
            <FeatureCard
              icon={Layers}
              title="Settlement Waterfall"
              description="When the buyer pays, funds route in one transaction: fee → repay LP vault → seller remainder."
              delay={0.2}
              signature
            />
            <FeatureCard
              icon={TrendingUp}
              title="On-Chain Reputation"
              description="Every cleared invoice updates your verifiable history and unlocks better terms over time."
              delay={0.3}
            />
            <FeatureCard
              icon={Lock}
              title="zkTLS Verified Proofs (Privacy)"
              description="Verify cashflow/income/invoice proofs without exposing PII on-chain."
              delay={0.4}
            />
            <FeatureCard
              icon={PieChart}
              title="Funding Pool"
              description="Deposit liquidity, see utilization/APR, and get repaid automatically as invoices clear."
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary to-accent p-12 text-center md:p-20">
            <div className="absolute inset-0 bg-primary/10 opacity-50" />
            
            <div className="relative">
              <h2 className="mb-4 text-3xl font-bold text-primary-foreground md:text-5xl">
                Ready to get started?
              </h2>
              <p className="mx-auto mb-8 max-w-xl text-lg text-primary-foreground/80">
                Create your first invoice in under a minute. No credit checks, no paperwork.
              </p>
              <Button variant="glass" size="xl" asChild>
                <Link to="/app">
                  Launch App
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <img src="/monar.png" alt="Monaris" className="h-6 w-auto" />
            </div>
            
            <nav className="flex gap-8 text-sm text-muted-foreground">
              <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground">Terms</Link>
              <Link to="/docs" className="hover:text-foreground">Documentation</Link>
            </nav>
            
            <p className="text-sm text-muted-foreground">
              © 2025 Monaris. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ 
  icon: Icon, 
  title, 
  description, 
  delay,
  signature = false
}: { 
  icon: React.ElementType
  title: string
  description: string
  delay: number
  signature?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      viewport={{ once: true }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-md transition-all duration-300 hover:shadow-lg hover:border-primary/20"
    >
      {signature && (
        <div className="absolute top-4 right-4 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Signature
        </div>
      )}
      <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-xl font-semibold">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </motion.div>
  )
}
