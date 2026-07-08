import { Navigate, BrowserRouter, Routes, Route } from 'react-router-dom';
import { type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/auth-context';
import { UnitsProvider } from './app/units-context';
import { AppShell } from './ui/app-shell';
import { ErrorBoundary } from './ui/error-boundary';
import { ToastProvider } from './ui/components/toast';
import { LoginScreen } from './ui/auth/login-screen';
import { LandingScreen } from './ui/home/landing-screen';
import { SystemHome } from './ui/home/system-home';
import { GripHome } from './ui/grip/grip-home';
import { GripSessionScreen } from './ui/grip/grip-session-screen';
import { isNative } from './app/platform';
import { GarageScreen } from './ui/garage/garage-screen';
import { VehicleDetail } from './ui/garage/vehicle-detail';
import { ReplayLabIndex } from './ui/replay-lab/replay-lab-index';
import { ReplayLabPlayer } from './ui/replay-lab/replay-lab-player';
import { RecordingsScreen } from './ui/recordings/recordings-screen';
import { CalibrationWizardScreen } from './ui/calibration/calibration-wizard-screen';
import { LiveRunScreen } from './ui/run/live-run-screen';
import { SessionScreen } from './ui/session/session-screen';
import { RunReviewScreen } from './ui/run/run-review-screen';
import { CompareScreen } from './ui/compare/compare-screen';
import { SettingsScreen } from './ui/settings/settings-screen';
import { AllRunsScreen } from './ui/runs/all-runs-screen';
import { PublicShareScreen } from './ui/share/public-share-screen';
import { DemoRunScreen } from './ui/demo/demo-run-screen';
import { AdminScreen } from './ui/admin/admin-screen';
import { ImprintScreen } from './ui/legal/imprint-screen';
import { PrivacyScreen } from './ui/legal/privacy-screen';
import { CookieNotice } from './ui/components/cookie-notice';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Cosmetic guard only — the server 404s /api/admin/* for non-admins regardless.
function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

// The domain root: public marketing landing for logged-out web visitors; signed-in
// users skip it for the app home; native never shows marketing.
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>;
  if (user) return <Navigate to="/home" replace />;
  if (isNative()) return <Navigate to="/login" replace />;
  return <LandingScreen />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <UnitsProvider>
          <ToastProvider>
            <BrowserRouter>
              <CookieNotice />
              <Routes>
                <Route path="/" element={<RootRoute />} />
                <Route path="/login" element={<LoginScreen />} />
                <Route path="/share/:token" element={<PublicShareScreen />} />
                <Route path="/demo" element={<DemoRunScreen />} />
                <Route path="/imprint" element={<ImprintScreen />} />
                <Route path="/privacy" element={<PrivacyScreen />} />
                <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                  <Route path="/home" element={<SystemHome />} />
                  <Route path="/garage" element={<GarageScreen />} />
                  <Route path="/vehicles/:id" element={<VehicleDetail />} />
                  <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
                  <Route path="/vehicles/:vehicleId/calibrations/:calibrationId/run" element={<LiveRunScreen />} />
                  <Route path="/vehicles/:vehicleId/calibrations/:calibrationId/session" element={<SessionScreen />} />
                  <Route path="/runs" element={<AllRunsScreen />} />
                  <Route path="/runs/:runId/review" element={<RunReviewScreen />} />
                  <Route path="/recordings" element={<RecordingsScreen />} />
                  <Route path="/replay" element={<ReplayLabIndex />} />
                  <Route path="/replay/local" element={<ReplayLabPlayer />} />
                  <Route path="/replay/:recordingId" element={<ReplayLabPlayer />} />
                  <Route path="/vehicles/:vehicleId/compare" element={<CompareScreen />} />
                  <Route path="/grip" element={<GripHome />} />
                  <Route path="/grip/sessions/:sessionId" element={<GripSessionScreen />} />
                  <Route path="/settings" element={<SettingsScreen />} />
                  <Route path="/admin" element={<RequireAdmin><AdminScreen /></RequireAdmin>} />
                  <Route path="*" element={<Navigate to="/home" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </UnitsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
