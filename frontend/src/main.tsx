import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles/index.scss";

const container = document.getElementById("root");
if (!container) throw new Error("Application root is missing");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
