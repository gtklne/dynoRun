import { Navigate, BrowserRouter, Routes, Route } from 'react-router-dom';
import { type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/auth-context';
import { AppShell } from './ui/app-shell';
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

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<GarageScreen />} />
            <Route path="/vehicles/:id" element={<VehicleDetail />} />
            <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
            <Route path="/vehicles/:vehicleId/calibrations/:calibrationId/run" element={<LiveRunScreen />} />
            <Route path="/runs/:runId/review" element={<RunReviewScreen />} />
            <Route path="/recordings" element={<RecordingsScreen />} />
            <Route path="/replay" element={<FixtureReplayScreen />} />
            <Route path="/vehicles/:vehicleId/compare" element={<CompareScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
