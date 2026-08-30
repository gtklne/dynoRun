import type { ReactNode } from 'react';

/**
 * The minima table: the boxed decision table on the sheet. Corner tables, run
 * lists, calibration candidates and lap pickers are all this one component, so
 * a reader learns one table and can read every screen.
 *
 * Rules separate rows; there are no zebra fills, no rounded corners and no
 * per-row cards. A selected row is tinted with procedure ink because selection
 * is the one thing on this table that changes what you are looking at.
 */

export interface MinimaColumn<Row> {
  key: string;
  head: string;
  /** Right-aligns and forces tabular figures. Use for every measurement. */
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
}

export function MinimaTable<Row>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onSelect,
  empty,
  caption,
}: {
  columns: MinimaColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  selectedKey?: string | null;
  onSelect?: (row: Row) => void;
  empty?: ReactNode;
  caption?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="hatch px-3 py-6 text-center">
        <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
          {empty ?? 'No entries'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="minima">
        {caption && <caption className="t-annotation px-3 py-2 text-left">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? 'num' : undefined} scope="col">
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey === key;
            return (
              <tr
                key={key}
                data-selected={selected || undefined}
                onClick={onSelect ? () => onSelect(row) : undefined}
                className={onSelect ? 'cursor-pointer' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A measurement that does not exist for this row. Set in the annotation
 * register so it can never be scanned as a number, and never a dash glyph.
 */
export function Na({ title }: { title?: string }) {
  return (
    <span className="na" title={title}>
      n/a
    </span>
  );
}
