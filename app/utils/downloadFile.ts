/**
 * Downloads a string as a file via anchor-click (browser default download folder).
 */
export function downloadFile(
  content: string,
  filename: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);
}
