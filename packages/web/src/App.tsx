import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.js";
import { LanguageProvider } from "./i18n/context.js";
import { Nav } from "./components/Nav.js";
import { LoginPage } from "./pages/LoginPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { NotesPage } from "./pages/NotesPage.js";
import {
  NewspapersPage,
  NewspaperDetailPage,
  NewspaperManagePage,
} from "./pages/NewspapersPage.js";
import { EventsPage } from "./pages/EventsPage.js";
import { AdminPage } from "./pages/AdminPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";

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

  // Onboarding gate: approved users with no Minecraft username are forced to the
  // onboarding page and cannot reach any other route until they set one.
  if (!user.mcUsername) return <OnboardingPage />;

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/notes" />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/players" element={<Navigate to="/notes" />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/newspapers" element={<NewspapersPage />} />
        <Route path="/newspapers/:id" element={<NewspaperDetailPage />} />
        <Route path="/newspapers/:id/manage" element={<NewspaperManagePage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route
          path="/admin/*"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
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
