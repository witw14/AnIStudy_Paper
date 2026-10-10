import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QuickNotes } from "./Notes";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import "./style.css";
import "./enhancements.css";
import "./customization.css";
import "./reading.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has("quick-notes") ? (
      <QuickNotes />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
