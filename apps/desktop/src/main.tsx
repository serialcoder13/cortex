import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable the default browser context menu in production.
document.addEventListener("contextmenu", (e) => e.preventDefault());

// Prevent default drop behavior (browser navigation) so in-app drag-drop works.
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
