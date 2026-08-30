import { useNavigate } from 'react-router-dom';
import type { Calibration } from '@/shared/types';
import { useReplayState, setPendingReplay } from '@/sensors/replay-state';
import { describeRecording } from '@/sensors/recording';
import { formatShortDateTime } from '@/shared/format-time';
import { NotesBox, PlateButton, RevisionBar, TitleBlock, Zone } from '@/ui/plate';

export function CalibrationStepConfirm({ calibration, onDone }: { calibration: Calibration; onDone: () => void }) {
  const navigate = useNavigate();
  const { last: lastRecording } = useReplayState();
  const recordingMatches = lastRecording?.kind === 'calibration' && lastRecording.meta.vehicle_id === calibration.vehicle_id;

  function downloadRecording() {
    if (!lastRecording) return;
    const blob = new Blob([JSON.stringify(lastRecording, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = lastRecording.recorded_at.replace(/[:.]/g, '-');
    a.download = `dynorun-${lastRecording.kind}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function useRecordingForReplay() {
    if (!lastRecording) return;
    setPendingReplay(lastRecording);
    navigate('/replay/local');
  }

  return (
    <>
      {/* The four numbers ARE the calibration, so they sit in the title block's
          own ruled meta row rather than in a panel below it: there is nothing
          else on this sheet to read first. */}
      <TitleBlock
        ident={`Gear ${calibration.gear_label} is ready for dyno runs`}
        title="Calibration saved"
        meta={[
          { label: 'Gear', value: calibration.gear_label },
          { label: 'RPM', value: calibration.rpm.toFixed(0) },
          { label: 'Speed', value: `${calibration.speed_kmh.toFixed(1)} km/h` },
          { label: 'Rollout', value: `${calibration.rollout_m_per_rev.toFixed(4)} m/rev` },
        ]}
      />

      <NotesBox title="What rollout is">
        Rollout bundles tyre circumference, gear ratio and final drive into one number, measured
        from a single steady hold. Every later run divides by it to get its RPM axis, so if the
        tyres, sprockets or wheel size change, calibrate that gear again.
      </NotesBox>

      {recordingMatches && lastRecording && (
        <Zone label="Raw sensor recording" note={describeRecording(lastRecording)}>
          <div className="grid grid-cols-2">
            <PlateButton onClick={downloadRecording} className="border-0">
              Download JSON
            </PlateButton>
            <PlateButton onClick={useRecordingForReplay} className="rule-l border-0">
              Use for replay
            </PlateButton>
          </div>
        </Zone>
      )}

      <div className="flex justify-end">
        <PlateButton variant="procedure" onClick={onDone} className="w-full lg:w-auto lg:px-10">
          Done
        </PlateButton>
      </div>

      <RevisionBar
        entries={[
          { label: 'Measured', value: formatShortDateTime(calibration.recorded_at) },
          { label: 'Method', value: 'GPS speed at a held RPM' },
        ]}
      />
    </>
  );
}
