import { Navigate, BrowserRouter, Routes, Route } from 'react-router-dom';
import { type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/auth-context';
import { UnitsProvider } from './app/units-context';
import { AppShell } from './ui/app-shell';
import { ErrorBoundary } from './ui/error-boundary';
import { ToastProvider } from './ui/components/toast';
import { LoginScreen } from './ui/auth/login-screen';
import { GarageScreen } from './ui/garage/garage-screen';
import { VehicleDetail } from './ui/garage/vehicle-detail';
import { FixtureReplayScreen } from './ui/fixture-replay/fixture-replay-screen';
import { RecordingsScreen } from './ui/recordings/recordings-screen';
import { CalibrationWizardScreen } from './ui/calibration/calibration-wizard-screen';
import { LiveRunScreen } from './ui/run/live-run-screen';
import { RunReviewScreen } from './ui/run/run-review-screen';
import { CompareScreen } from './ui/compare/compare-screen';
import { SettingsScreen } from './ui/settings/settings-screen';
import { AllRunsScreen } from './ui/runs/all-runs-screen';
import { PublicShareScreen } from './ui/share/public-share-screen';
import { DemoRunScreen } from './ui/demo/demo-run-screen';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <UnitsProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginScreen />} />
                <Route path="/share/:token" element={<PublicShareScreen />} />
                <Route path="/demo" element={<DemoRunScreen />} />
                <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                  <Route index element={<GarageScreen />} />
                  <Route path="/vehicles/:id" element={<VehicleDetail />} />
                  <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
                  <Route path="/vehicles/:vehicleId/calibrations/:calibrationId/run" element={<LiveRunScreen />} />
                  <Route path="/runs" element={<AllRunsScreen />} />
                  <Route path="/runs/:runId/review" element={<RunReviewScreen />} />
                  <Route path="/recordings" element={<RecordingsScreen />} />
                  <Route path="/replay" element={<FixtureReplayScreen />} />
                  <Route path="/vehicles/:vehicleId/compare" element={<CompareScreen />} />
                  <Route path="/settings" element={<SettingsScreen />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </UnitsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
