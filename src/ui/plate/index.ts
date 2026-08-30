/**
 * The plate system: the complete component vocabulary for this product.
 *
 * Every screen composes from these. If a screen needs something that is not
 * here, that is a gap in the system, not a licence to invent a local primitive:
 * add it here so all three surfaces get it, or the product goes back to being
 * three products that merely share a repository.
 */
export { Plate, TitleBlock, Zone, PlanView, ProfileView, NotesBox, Advisory, RevisionBar } from './plate';
export { Readout, NoReading, ChannelStrip } from './readout';
export { PlateButton, PlateLink, PlateAnchor, PlateSegmented, PlateField } from './controls';
export { MinimaTable, Na } from './minima-table';
export type { MinimaColumn } from './minima-table';
export { CrossRefProvider, useCrossRef, CrossRefReadout } from './cross-reference';
export type { CrossRefPosition } from './cross-reference';
export { usePlateInk, readPlateInk, seriesInk, SERIES_DASH, hatchPattern } from './tokens';
export type { PlateInk } from './tokens';
