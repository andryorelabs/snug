import { Toaster } from "@workspace/ui/components/toast";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ThemeProvider } from "@/components/theme-provider";
import { applyDocumentLanguage } from "@/lib/document-language";
import { applyCachedTheme } from "@/lib/theme-cache";

import App from "./App";
import "./style.css";

applyCachedTheme();
applyDocumentLanguage();

const rootElement = document.querySelector("#root");
if (!rootElement) throw new Error("Root element #root not found");

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <Toaster>
        <App />
      </Toaster>
    </ThemeProvider>
  </StrictMode>,
);
