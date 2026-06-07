/**
 * Robust file saver utility that dynamically loads the 'file-saver' library.
 * Provides a native HTML5 anchor download fallback in case of module resolution or environment failures.
 */
export async function saveAs(blob: Blob, filename: string) {
  try {
    const fileSaver = await import('file-saver');
    const save = fileSaver.saveAs || fileSaver.default?.saveAs || fileSaver.default;
    if (typeof save === 'function') {
      save(blob, filename);
      return;
    }
    console.warn('file-saver saveAs function not resolved, triggering fallback anchor download', fileSaver);
  } catch (err) {
    console.error('Failed to dynamically load file-saver, triggering fallback anchor download', err);
  }

  // Fallback: Native HTML5 anchor click download
  if (typeof window !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
