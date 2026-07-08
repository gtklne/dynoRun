import { computeChannels } from './channels';
import { computeEnvelope } from './envelope';
import { computeLoad } from './load';
import { buildLaps } from './laps';
import { projectTrack } from './project';
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
  const envelope = computeEnvelope(channels, settings);
  const load = computeLoad(ch.t, channels.along, channels.alat);
  const laps = buildLaps(
    ch,
    { spdS: channels.spdS, leanS: channels.leanS, util: envelope.util, loadRate: load.loadRate },
    meta,
    settings,
  );
  const { px, py } = projectTrack(ch.lat, ch.lon);
  return { meta, n, ch, ...channels, ...envelope, ...load, px, py, laps };
}
