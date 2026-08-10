# Real RaceBox track sessions

Two 25 Hz RaceBox exports from the original Grip Utilization prototype, kept as
sanity material for the grip pipeline (`src/analysis/grip/`):

- `RaceBox Track Sessionon 06-06-2026 11-50.csv` (2.5 MB)
- `RaceBox Track Sessionon 22-06-2026 14-27.csv` (6.8 MB)

The CSVs are gitignored: multi-MB binaries don't belong in the repo, and they
can't be regenerated, so don't delete them either. The automated tests use the
synthetic generator in `tests/analysis/grip/synthetic.ts`; these files are for
manual checks: drop one on `/grip` and see whether laps, corners, and the
traction envelope come out plausible.
