import { computeChannels } from './channels';
import { computeEnvelope } from './envelope';
import { computeLoad } from './load';
import { buildLaps } from './laps';
import { projectTrack } from './project';
import { assignTrackTurns } from './turns';
import type { GripAnalysis, ParsedGripSession } from './types';
import type { GripSettings } from './settings';

/**
 * The full derivation from a parsed session: g channels → traction envelope →
 * transient load → laps & corners → projected track. Pure; re-run whenever a
 * 'recompute'-class setting changes. The τ-dependent Dynamic-load channel is
 * NOT included — it's cheap and lives in computeCombined() so the UI can
 * re-mix it without re-deriving everything.
 */
export function analyzeGripSession(parsed: ParsedGripSession, settings: GripSettings): GripAnalysis {
  const { ch, meta, n } = parsed;
  const channels = computeChannels(ch, settings.speedSmooth);
  const envelope = computeEnvelope(channels, settings, ch.lap);
  const load = computeLoad(ch.t, channels.along, channels.alat);
  const laps = buildLaps(
    ch,
    { spdS: channels.spdS, leanS: channels.leanS, comb: channels.comb, loadRate: load.loadRate },
    meta,
    settings,
  );
  // Corner detection is per-lap and its index is not a turn id; pairing corners
  // across laps needs the whole session, so turns are assigned once here.
  const turnCount = assignTrackTurns(ch, laps);
  const { px, py } = projectTrack(ch.lat, ch.lon);
  return { meta, n, ch, ...channels, ...envelope, ...load, px, py, laps, turnCount };
}
