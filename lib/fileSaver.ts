/**
 * Robust file saver utility that utilizes the native HTML5 anchor download mechanism.
 * Completely bypasses the external 'file-saver' library to prevent SSR and bundler dynamic import issues.
 */
export async function saveAs(blob: Blob, filename: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Native HTML5 anchor download failed:', err);
      throw err;
    }
  } else {
    console.warn('saveAs called on server-side; download skipped.');
  }
}
