/**
 * Dispatches to the right format-specific generator. Each generator is imported
 * statically here but the generators themselves dynamic-import their heavy
 * third-party libs (pdfmake / xlsx / docx) so the initial chat bundle stays light.
 */
import { generatePdf } from './pdf';
import { generateXlsx } from './xlsx';
import { generateDocx } from './docx';

export async function generateReport(format, spec, sourceBlocks) {
  switch (format) {
    case 'pdf':  return generatePdf(spec, sourceBlocks);
    case 'xlsx': return generateXlsx(spec, sourceBlocks);
    case 'docx': return generateDocx(spec, sourceBlocks);
    default: throw new Error(`unknown format: ${format}`);
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function filenameFor(spec, format) {
  const safe = (spec.title || 'report').replace(/[^\w\s\-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
  return `${safe}.${format}`;
}
