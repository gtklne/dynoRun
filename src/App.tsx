import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider } from './storage/db-context';
import { AppShell } from './ui/app-shell';
import { GarageScreen } from './ui/garage/garage-screen';
import { VehicleDetail } from './ui/garage/vehicle-detail';
import { FixtureReplayScreen } from './ui/fixture-replay/fixture-replay-screen';
import { CalibrationWizardScreen } from './ui/calibration/calibration-wizard-screen';
import { LiveRunScreen } from './ui/run/live-run-screen';
import { RunReviewScreen } from './ui/run/run-review-screen';
import { CompareScreen } from './ui/compare/compare-screen';

export default function App() {
  return (
    <DbProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<GarageScreen />} />
            <Route path="/vehicles/:id" element={<VehicleDetail />} />
            <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
            <Route path="/vehicles/:vehicleId/calibrations/:calibrationId/run" element={<LiveRunScreen />} />
            <Route path="/runs/:runId/review" element={<RunReviewScreen />} />
            <Route path="/replay" element={<FixtureReplayScreen />} />
            <Route path="/vehicles/:vehicleId/compare" element={<CompareScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DbProvider>
  );
}
