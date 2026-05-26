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
