import { Navigate, BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/auth-context';
import { UnitsProvider } from './app/units-context';
import { AppShell } from './ui/app-shell';
import { ErrorBoundary } from './ui/error-boundary';
import { ToastProvider } from './ui/components/toast';
import { isNative } from './app/platform';
import { CookieNotice } from './ui/components/cookie-notice';

// Screens are intentionally loaded at the route boundary. The live-run, chart,
// replay, and Grip code is substantial; visitors should only download the tool
// they open instead of paying for the entire suite on first paint.
const LoginScreen = lazy(() => import('./ui/auth/login-screen').then(({ LoginScreen: Screen }) => ({ default: Screen })));
const LandingScreen = lazy(() => import('./ui/home/landing-screen').then(({ LandingScreen: Screen }) => ({ default: Screen })));
const SystemHome = lazy(() => import('./ui/home/system-home').then(({ SystemHome: Screen }) => ({ default: Screen })));
const GripHome = lazy(() => import('./ui/grip/grip-home').then(({ GripHome: Screen }) => ({ default: Screen })));
const GripCompareScreen = lazy(() => import('./ui/grip/grip-compare-screen').then(({ GripCompareScreen: Screen }) => ({ default: Screen })));
const GripSessionScreen = lazy(() => import('./ui/grip/grip-session-screen').then(({ GripSessionScreen: Screen }) => ({ default: Screen })));
const GarageScreen = lazy(() => import('./ui/garage/garage-screen').then(({ GarageScreen: Screen }) => ({ default: Screen })));
const VehicleDetail = lazy(() => import('./ui/garage/vehicle-detail').then(({ VehicleDetail: Screen }) => ({ default: Screen })));
const ReplayLabIndex = lazy(() => import('./ui/replay-lab/replay-lab-index').then(({ ReplayLabIndex: Screen }) => ({ default: Screen })));
const ReplayLabPlayer = lazy(() => import('./ui/replay-lab/replay-lab-player').then(({ ReplayLabPlayer: Screen }) => ({ default: Screen })));
const RecordingsScreen = lazy(() => import('./ui/recordings/recordings-screen').then(({ RecordingsScreen: Screen }) => ({ default: Screen })));
const CalibrationWizardScreen = lazy(() => import('./ui/calibration/calibration-wizard-screen').then(({ CalibrationWizardScreen: Screen }) => ({ default: Screen })));
const LiveRunScreen = lazy(() => import('./ui/run/live-run-screen').then(({ LiveRunScreen: Screen }) => ({ default: Screen })));
const SessionScreen = lazy(() => import('./ui/session/session-screen').then(({ SessionScreen: Screen }) => ({ default: Screen })));
const RunReviewScreen = lazy(() => import('./ui/run/run-review-screen').then(({ RunReviewScreen: Screen }) => ({ default: Screen })));
const CompareScreen = lazy(() => import('./ui/compare/compare-screen').then(({ CompareScreen: Screen }) => ({ default: Screen })));
const SettingsScreen = lazy(() => import('./ui/settings/settings-screen').then(({ SettingsScreen: Screen }) => ({ default: Screen })));
const AllRunsScreen = lazy(() => import('./ui/runs/all-runs-screen').then(({ AllRunsScreen: Screen }) => ({ default: Screen })));
const PublicShareScreen = lazy(() => import('./ui/share/public-share-screen').then(({ PublicShareScreen: Screen }) => ({ default: Screen })));
const DemoRunScreen = lazy(() => import('./ui/demo/demo-run-screen').then(({ DemoRunScreen: Screen }) => ({ default: Screen })));
const AdminScreen = lazy(() => import('./ui/admin/admin-screen').then(({ AdminScreen: Screen }) => ({ default: Screen })));
const ImprintScreen = lazy(() => import('./ui/legal/imprint-screen').then(({ ImprintScreen: Screen }) => ({ default: Screen })));
const PrivacyScreen = lazy(() => import('./ui/legal/privacy-screen').then(({ PrivacyScreen: Screen }) => ({ default: Screen })));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }
  return <>{children}</>;
}

// Cosmetic guard only: the server 404s /api/admin/* for non-admins regardless.
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

function ScreenLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-center" role="status">
      <div className="space-y-3">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" aria-hidden="true" />
        <p className="text-sm text-zinc-400">Loading DynoRun…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <UnitsProvider>
          <ToastProvider>
            <BrowserRouter>
              <CookieNotice />
              <Suspense fallback={<ScreenLoading />}>
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
                    <Route path="/grip/compare" element={<GripCompareScreen />} />
                    <Route path="/grip/sessions/:sessionId" element={<GripSessionScreen />} />
                    <Route path="/settings" element={<SettingsScreen />} />
                    <Route path="/admin" element={<RequireAdmin><AdminScreen /></RequireAdmin>} />
                    <Route path="*" element={<Navigate to="/home" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </UnitsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
