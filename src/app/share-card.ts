import type { RpmPoint, RunConditions } from '@/shared/types';
import type { AccelTimes } from '@/analysis/accel-times';
import { convertPower, type PowerUnit } from '@/shared/format-power';

export interface ShareCardInput {
  vehicleName: string;
  gearLabel: string;
  title?: string;
  unit: PowerUnit;
  peakPowerKw: number | null;
  peakTorqueNm: number | null;
  peakPowerRpm: number | null;
  curvePoints: RpmPoint[];
  accelTimes: AccelTimes | null;
  conditions?: RunConditions;
}

function signedShareCardValue(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

function formatConditionsLine(c: RunConditions | undefined): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (typeof c.ambient_temp_c === 'number') parts.push(`${c.ambient_temp_c}°C`);
  if (typeof c.wind_kmh === 'number') {
    parts.push(`${signedShareCardValue(c.wind_kmh)} km/h`);
  }
  if (typeof c.road_slope_pct === 'number') {
    parts.push(`${signedShareCardValue(c.road_slope_pct)}% grade`);
  }
  if (c.surface) parts.push(c.surface);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const WIDTH = 1200;
const HEIGHT = 630;
const BG = '#09090b';
const PANEL = '#18181b';
const PANEL_BORDER = '#27272a';
const ACCENT = '#fbbf24';
const TEXT_PRIMARY = '#fafafa';
const TEXT_MUTED = '#a1a1aa';
const TEXT_SUBTLE = '#71717a';

const PAD_X = 64;
const PAD_TOP = 56;

function unitDecimals(unit: PowerUnit): number {
  return unit === 'kW' ? 1 : 0;
}

function formatPeakPower(kw: number | null, unit: PowerUnit): string {
  if (kw == null || !isFinite(kw)) return '—';
  return convertPower(kw, unit).toFixed(unitDecimals(unit));
}

function findInterval(accel: AccelTimes | null, from: number, to: number) {
  if (!accel) return null;
  return accel.intervals.find((i) => i.from_kmh === from && i.to_kmh === to) ?? null;
}

function drawCurve(ctx: CanvasRenderingContext2D, points: RpmPoint[], box: { x: number; y: number; w: number; h: number }) {
  if (points.length < 2) {
    ctx.fillStyle = TEXT_SUBTLE;
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No curve data', box.x + box.w / 2, box.y + box.h / 2);
    return;
  }

  const sorted = [...points].sort((a, b) => a.rpm - b.rpm);
  const xMin = sorted[0].rpm;
  const xMax = sorted[sorted.length - 1].rpm;
  const xSpan = xMax - xMin || 1;
  const yMax = sorted.reduce((m, p) => (p.wheel_power_kw > m ? p.wheel_power_kw : m), 0) || 1;

  const toX = (rpm: number): number => box.x + ((rpm - xMin) / xSpan) * box.w;
  const toY = (kw: number): number => box.y + box.h - (kw / yMax) * (box.h - 8);

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  // Gridlines: 4 horizontal divisions
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = box.y + (i / 4) * box.h;
    ctx.beginPath();
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
    ctx.stroke();
  }

  // Filled area under the curve.
  ctx.beginPath();
  ctx.moveTo(toX(sorted[0].rpm), box.y + box.h);
  for (const p of sorted) ctx.lineTo(toX(p.rpm), toY(p.wheel_power_kw));
  ctx.lineTo(toX(sorted[sorted.length - 1].rpm), box.y + box.h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  grad.addColorStop(0, 'rgba(251, 191, 36, 0.32)');
  grad.addColorStop(1, 'rgba(251, 191, 36, 0.02)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Stroke
  ctx.beginPath();
  ctx.moveTo(toX(sorted[0].rpm), toY(sorted[0].wheel_power_kw));
  for (const p of sorted) ctx.lineTo(toX(p.rpm), toY(p.wheel_power_kw));
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.restore();
}

function drawWordmark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Stylized gauge mark + "DYNORUN" — matches BrandLogo aesthetic loosely.
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + 18, y + 18, 16, Math.PI * 0.75, Math.PI * 2.25);
  ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(x + 18, y + 18, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 18, y + 18);
  ctx.lineTo(x + 26, y + 10);
  ctx.lineWidth = 3;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();

  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = '700 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('DYNORUN', x + 48, y + 18);
  ctx.restore();
}

function getOffscreenCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('renderShareCard requires a DOM environment');
  }
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob produced no blob'));
      }, type);
      return;
    }
    // jsdom: toDataURL is sometimes available; if not, fall back to an empty
    // PNG-typed blob so callers can still exercise the code path in tests.
    try {
      const dataUrl = canvas.toDataURL(type);
      const base64 = dataUrl.split(',')[1] ?? '';
      const binary = base64 ? atob(base64) : '';
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type }));
    } catch {
      resolve(new Blob([new Uint8Array([0])], { type }));
    }
  });
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = getOffscreenCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Headless / jsdom — return a tiny placeholder blob so the caller doesn't crash.
    return new Blob([new Uint8Array([0])], { type: 'image/png' });
  }

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle diagonal pattern in the bottom-right.
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1;
  for (let i = -HEIGHT; i < WIDTH; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, HEIGHT);
    ctx.lineTo(i + HEIGHT, 0);
    ctx.stroke();
  }
  ctx.restore();

  // Outer subtle border ring.
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);

  // Header row: wordmark + title
  drawWordmark(ctx, PAD_X, PAD_TOP);

  ctx.fillStyle = TEXT_MUTED;
  ctx.font = '500 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const headerRight = input.title || `${input.vehicleName} · ${input.gearLabel}`;
  ctx.fillText(headerRight, WIDTH - PAD_X, PAD_TOP + 18);

  // Vehicle / gear line (below wordmark).
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = '600 36px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(input.vehicleName, PAD_X, 130);

  ctx.fillStyle = TEXT_SUBTLE;
  ctx.font = '500 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Gear ${input.gearLabel}`, PAD_X, 178);

  // Hero stat — peak power
  const heroY = 240;
  ctx.fillStyle = TEXT_SUBTLE;
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('PEAK POWER', PAD_X, heroY);

  ctx.fillStyle = ACCENT;
  ctx.font = '800 124px system-ui, -apple-system, sans-serif';
  ctx.fillText(formatPeakPower(input.peakPowerKw, input.unit), PAD_X, heroY + 24);

  ctx.fillStyle = TEXT_MUTED;
  ctx.font = '600 32px system-ui, -apple-system, sans-serif';
  // Measure to align unit label right after the number.
  const heroNumber = formatPeakPower(input.peakPowerKw, input.unit);
  ctx.font = '800 124px system-ui, -apple-system, sans-serif';
  const heroNumberWidth = ctx.measureText(heroNumber).width;
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = '600 32px system-ui, -apple-system, sans-serif';
  ctx.fillText(input.unit, PAD_X + heroNumberWidth + 12, heroY + 96);

  if (input.peakPowerRpm != null) {
    ctx.fillStyle = TEXT_SUBTLE;
    ctx.font = '500 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(`@ ${Math.round(input.peakPowerRpm)} RPM`, PAD_X, heroY + 168);
  }

  // Secondary metrics row at the right of the hero area.
  const secX = 560;
  const secY = heroY;
  const cellW = 132;
  const cellGap = 14;
  const cells: Array<{ label: string; value: string; unit: string }> = [];
  if (input.peakTorqueNm != null) {
    cells.push({ label: 'TORQUE', value: input.peakTorqueNm.toFixed(0), unit: 'Nm' });
  }
  const zeroToHundred = findInterval(input.accelTimes, 0, 100);
  if (zeroToHundred) {
    cells.push({ label: '0–100', value: zeroToHundred.elapsed_s.toFixed(1), unit: 's' });
  }
  if (input.accelTimes?.quarter_mile) {
    cells.push({ label: '¼ MILE', value: input.accelTimes.quarter_mile.elapsed_s.toFixed(1), unit: 's' });
  }
  if (input.accelTimes && !zeroToHundred) {
    // Show top-speed instead of an unavailable 0-100.
    cells.push({
      label: 'PEAK',
      value: input.accelTimes.peak_speed_kmh.toFixed(0),
      unit: 'km/h',
    });
  }

  cells.forEach((cell, i) => {
    const x = secX + i * (cellW + cellGap);
    ctx.fillStyle = PANEL;
    ctx.strokeStyle = PANEL_BORDER;
    ctx.lineWidth = 1.5;
    const cellH = 132;
    roundRect(ctx, x, secY + 8, cellW, cellH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = TEXT_SUBTLE;
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(cell.label, x + 16, secY + 24);

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = '700 44px system-ui, -apple-system, sans-serif';
    ctx.fillText(cell.value, x + 16, secY + 52);

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '500 16px system-ui, -apple-system, sans-serif';
    ctx.fillText(cell.unit, x + 16, secY + 104);
  });

  const conditionsLine = formatConditionsLine(input.conditions);
  if (conditionsLine) {
    ctx.fillStyle = TEXT_SUBTLE;
    ctx.font = '500 18px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(conditionsLine, secX, secY + 156);
  }

  // Chart area — bottom strip.
  const chartBox = { x: PAD_X, y: 460, w: WIDTH - PAD_X * 2, h: 110 };
  ctx.fillStyle = PANEL;
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1.5;
  roundRect(ctx, chartBox.x, chartBox.y, chartBox.w, chartBox.h, 18);
  ctx.fill();
  ctx.stroke();
  drawCurve(ctx, input.curvePoints, {
    x: chartBox.x + 14,
    y: chartBox.y + 14,
    w: chartBox.w - 28,
    h: chartBox.h - 28,
  });

  // Footer
  ctx.fillStyle = TEXT_SUBTLE;
  ctx.font = '500 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('wasgoht.ch', PAD_X, HEIGHT - 36);

  ctx.fillStyle = TEXT_SUBTLE;
  ctx.font = '500 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Wheel power · GPS-derived', WIDTH - PAD_X, HEIGHT - 36);

  return canvasToBlob(canvas, 'image/png');
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
