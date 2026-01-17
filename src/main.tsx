// Polyfill for Buffer (required for viem in browser)
import { Buffer } from 'buffer';
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
