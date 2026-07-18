import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../../app/globals.css";
import "./styles.css";
import { BrowserQaScenario } from "./scenario-registry";
import { installSyntheticFetch } from "./synthetic-fetch";

installSyntheticFetch();

const scenario = new URLSearchParams(window.location.search).get("scenario");
const root = document.getElementById("root");

if (!root) throw new Error("Browser QA fixture root was not found");

createRoot(root).render(
  <StrictMode>
    <BrowserQaScenario scenario={scenario} />
  </StrictMode>
);
