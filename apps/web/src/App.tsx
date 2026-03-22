import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { CalendarView } from "./pages/CalendarView";
import { DocumentPage } from "./pages/DocumentPage";
import { TodosPage } from "./pages/TodosPage";
import { SettingsPage } from "./pages/SettingsPage";

function GoogleDriveBanner() {
  return (
    <div className="flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 p-6">
      <p className="text-sm text-neutral-400">
        Connect Google Drive to get started
      </p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-neutral-950 text-neutral-100">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <GoogleDriveBanner />
          </div>
          <Routes>
            <Route path="/" element={<CalendarView />} />
            <Route path="/doc/*" element={<DocumentPage />} />
            <Route path="/todos" element={<TodosPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
