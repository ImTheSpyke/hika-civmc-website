import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.js";
import { LanguageProvider } from "./i18n/context.js";
import { Nav } from "./components/Nav.js";
import { LoginPage } from "./pages/LoginPage.js";
import { GlobalNotesPage } from "./pages/GlobalNotesPage.js";
import { PlayerNotesPage } from "./pages/PlayerNotesPage.js";
import {
  NewspapersPage,
  NewspaperDetailPage,
  NewspaperManagePage,
} from "./pages/NewspapersPage.js";
import { EventsPage } from "./pages/EventsPage.js";
import { AdminPage } from "./pages/AdminPage.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-center">Loading…</div>;
  if (!user || user.status !== "approved") return <LoginPage />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user?.isAdmin) return <Navigate to="/" />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-center">Loading…</div>;
  if (!user || user.status !== "approved") return <LoginPage />;

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/notes" />} />
        <Route path="/notes" element={<RequireAuth><GlobalNotesPage /></RequireAuth>} />
        <Route path="/players" element={<RequireAuth><PlayerNotesPage /></RequireAuth>} />
        <Route path="/newspapers" element={<RequireAuth><NewspapersPage /></RequireAuth>} />
        <Route path="/newspapers/:id" element={<RequireAuth><NewspaperDetailPage /></RequireAuth>} />
        <Route path="/newspapers/:id/manage" element={<RequireAuth><NewspaperManagePage /></RequireAuth>} />
        <Route path="/events" element={<RequireAuth><EventsPage /></RequireAuth>} />
        <Route
          path="/admin/*"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
      </Routes>
    </>
  );
}

export function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
