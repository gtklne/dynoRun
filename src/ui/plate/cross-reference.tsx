import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The signature interaction of this world.
 *
 * On an approach plate the plan view and the profile view are two views of one
 * procedure, and a reader cross-references between them constantly. Here that
 * is literal: a cursor anywhere (track map, power curve, load timeline, delta
 * chart) publishes one position, and every other view in the plate reports the
 * same instant. One primitive, used identically by DynoRun and Grip, instead of
 * each chart owning a private hover state nothing else can read.
 *
 * `key` scopes a cross-reference group to one plate, so two plates on one route
 * (analyzer + a sibling preview) do not drive each other.
 */

export interface CrossRefPosition {
  /** Domain value on the shared axis: seconds, metres, or RPM. Chart-defined. */
  at: number;
  /** Which view published it, so a view can skip re-reading its own cursor. */
  source: string;
}

interface CrossRefValue {
  position: CrossRefPosition | null;
  setPosition: (p: CrossRefPosition | null) => void;
}

const Ctx = createContext<CrossRefValue>({ position: null, setPosition: () => {} });

export function CrossRefProvider({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState<CrossRefPosition | null>(null);
  const value = useMemo(() => ({ position, setPosition }), [position]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCrossRef(): CrossRefValue {
  return useContext(Ctx);
}

/**
 * Reports the cross-referenced instant as an aligned column of channel values.
 * This is the readout a plate shows while the cursor moves, and it is the same
 * component whether the channels are power/torque/rpm or lat g/long g/lean.
 */
export function CrossRefReadout({
  channels,
  axisLabel,
  axisValue,
  idle,
}: {
  channels: { name: string; value: ReactNode; unit?: string; color?: string }[];
  axisLabel: string;
  axisValue: ReactNode;
  idle?: string;
}) {
  const { position } = useCrossRef();

  if (!position) {
    return (
      <div className="px-3 py-2.5">
        <p className="t-annotation">{idle ?? 'Move across the plot to read every channel'}</p>
      </div>
    );
  }

  return (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-3 py-2.5">
      <div>
        <dt className="t-annotation">{axisLabel}</dt>
        <dd className="t-data mt-0.5 text-base">{axisValue}</dd>
      </div>
      {channels.map((c) => (
        <div key={c.name} className="flex items-baseline gap-2">
          {c.color && (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 self-center"
              style={{ background: c.color }}
            />
          )}
          <div>
            <dt className="t-annotation">{c.name}</dt>
            <dd className="t-data mt-0.5 text-base">
              {c.value}
              {c.unit && <span className="t-annotation ml-1">{c.unit}</span>}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
