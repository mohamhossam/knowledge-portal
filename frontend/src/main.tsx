import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// One family in two widths (Archivo's width axis sets the condensed table
// numbers), and Noto Sans Arabic for Arabic content. Self-hosted: the portal
// runs offline and behind a strict Content-Security-Policy.
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/noto-sans-arabic/arabic-400.css";
import "@fontsource/noto-sans-arabic/arabic-600.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/timetable.css";
import "./styles/library.css";
import "./styles/catalogue.css";
import "./styles/squads.css";
import "./styles/explorer.css";
import "./styles/knowledge.css";

import { ApiError } from "./api/errors";
import { App } from "./app/App";
import { AuthProvider } from "./auth/AuthProvider";
import { Gate } from "./auth/Gate";
import { BASE } from "./auth/paths";
import { ReaderApp } from "./explorer/ReaderApp";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Retry what retrying can fix: the network and the server, never a refusal.
      retry: (failures, error) => {
        if (failures >= 2) return false;
        const status = error instanceof ApiError ? error.status : 0;
        return status === 0 || status >= 500;
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Gate
          readers={
            <BrowserRouter basename={BASE || "/"}>
              <ReaderApp />
            </BrowserRouter>
          }
        >
          <BrowserRouter basename={BASE || "/"}>
            <App />
          </BrowserRouter>
        </Gate>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
