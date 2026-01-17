import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { privyConfig } from "./lib/privy-config";
import { wagmiConfig } from "./lib/wagmi-config";
import NotFound from "./pages/NotFound";
import { AppLayout } from "./components/layout/AppLayout";
import Dashboard from "./pages/app/Dashboard";
import Invoices from "./pages/app/Invoices";
import InvoiceDetail from "./pages/app/InvoiceDetail";
import CreateInvoice from "./pages/app/CreateInvoice";
import Financing from "./pages/app/Financing";
import Vault from "./pages/app/Vault";
import Reputation from "./pages/app/Reputation";
import Proofs from "./pages/app/Proofs";
import Activity from "./pages/app/Activity";
import Settings from "./pages/app/Settings";
import PayInvoice from "./pages/PayInvoice";
import { PrivyErrorHandler } from "./components/PrivyErrorHandler";
import { PaymentPrivyProvider } from "./components/PaymentPrivyProvider";

const queryClient = new QueryClient();

// Check if Privy app ID is valid
const hasValidPrivyAppId = privyConfig.appId && privyConfig.appId.trim().length > 0;

// Main App Routes (uses main Privy app - for sellers/dashboard)
const MainAppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/app" replace />} />
    <Route path="/app" element={<AppLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="invoices" element={<Invoices />} />
      <Route path="invoices/:invoiceId" element={<InvoiceDetail />} />
      <Route path="invoices/new" element={<CreateInvoice />} />
      <Route path="financing" element={<Financing />} />
      <Route path="vault" element={<Vault />} />
      <Route path="reputation" element={<Reputation />} />
      <Route path="proofs" element={<Proofs />} />
      <Route path="activity" element={<Activity />} />
      <Route path="settings" element={<Settings />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
);

// Payment Page Routes (uses separate Privy app - for buyers)
const PaymentRoutes = () => (
  <PaymentPrivyProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        <Route path="/pay/:chainId/:invoiceId" element={<PayInvoice />} />
        <Route path="/pay/:invoiceId" element={<PayInvoice />} />
      </Routes>
    </TooltipProvider>
  </PaymentPrivyProvider>
);

// Router component that determines which provider to use based on path
const AppRouter = () => {
  // Check if current path is a payment path
  const isPaymentPath = window.location.pathname.startsWith('/pay');

  if (isPaymentPath) {
    // Payment pages use separate Privy provider for buyers
    return <PaymentRoutes />;
  }

  // Main app uses the main Privy provider for sellers
  // IMPORTANT: QueryClientProvider must wrap PrivyProvider and WagmiProvider
  // because @privy-io/wagmi internally uses react-query hooks
  if (hasValidPrivyAppId) {
    return (
      <QueryClientProvider client={queryClient}>
        <PrivyProvider
          appId={privyConfig.appId}
          config={privyConfig.config}
        >
          <PrivyErrorHandler />
          <WagmiProvider config={wagmiConfig}>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <MainAppRoutes />
            </TooltipProvider>
          </WagmiProvider>
        </PrivyProvider>
      </QueryClientProvider>
    );
  }

  // Fallback without Privy
  console.warn('Privy app ID is missing. Some wallet features may not work.');
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <MainAppRoutes />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
};

export default App;
