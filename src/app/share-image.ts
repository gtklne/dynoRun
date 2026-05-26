import { renderShareCard, type ShareCardInput } from './share-card';

export interface ShareRunInput {
  title: string;
  text: string;
}

export async function shareRun(input: ShareRunInput, fallback: () => void): Promise<void> {
  try {
    const navAny = navigator as unknown as { share?: (data: ShareData) => Promise<void> };
    if (typeof navAny.share === 'function') {
      await navAny.share({ title: input.title, text: input.text, url: window.location.href });
      return;
    }
  } catch {
    // user dismissed or share failed — fall through to fallback
  }
  fallback();
}

export interface ShareRunCardInput extends ShareCardInput {
  title: string;
  text: string;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(input: string): string {
  return input.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'dynorun-run';
}

export async function shareRunCard(input: ShareRunCardInput, textFallback?: () => void): Promise<void> {
  const blob = await renderShareCard(input);
  const filename = `${slugify(input.title)}.png`;

  // Web Share Level 2: navigator.canShare({ files }) gates file support.
  // Many desktop browsers expose share() but reject files; canShare lets us check first.
  const navAny = navigator as unknown as {
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
  };
  const file = (() => {
    try {
      return new File([blob], filename, { type: 'image/png' });
    } catch {
      return null;
    }
  })();

  if (file && typeof navAny.share === 'function' && typeof navAny.canShare === 'function') {
    const payload = { files: [file], title: input.title, text: input.text };
    try {
      if (navAny.canShare(payload)) {
        await navAny.share(payload);
        return;
      }
    } catch {
      // user dismissed or platform rejected — fall through
    }
  }

  // Text-only share (no files) if the platform supports share() at all.
  if (typeof navAny.share === 'function') {
    try {
      await navAny.share({ title: input.title, text: input.text, url: window.location.href });
      // Still drop the PNG so the user has the artifact in hand.
      downloadBlob(blob, filename);
      return;
    } catch {
      // fall through to download
    }
  }

  downloadBlob(blob, filename);
  textFallback?.();
}
