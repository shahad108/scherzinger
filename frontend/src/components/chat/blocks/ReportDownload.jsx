import { useState, useMemo } from 'react';
import { Download, ChevronDown, FileText, FileSpreadsheet, FileType, Loader, ExternalLink } from 'lucide-react';
import { generateReport, downloadBlob, filenameFor } from '../../../utils/reportExport';
import { flattenConversation } from '../../../utils/reportExport/shared';

const FORMAT_META = {
  pdf:  { label: 'PDF',  icon: FileText },
  xlsx: { label: 'Excel', icon: FileSpreadsheet },
  docx: { label: 'Word', icon: FileType },
};

export default function ReportDownload({ spec, messageBlocks = [], conversationMessages = [] }) {
  const [open, setOpen] = useState(false);
  const [busyFormat, setBusyFormat] = useState(null); // null | 'pdf' | 'xlsx' | 'docx' | 'preview'
  const busy = busyFormat !== null;
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  const sourceBlocks = useMemo(() => {
    if (spec.scope === 'conversation') return flattenConversation(conversationMessages);
    return messageBlocks.filter(b => b?.type !== 'report_download');
  }, [spec.scope, messageBlocks, conversationMessages]);

  const doDownload = async (format) => {
    setBusyFormat(format); setError(null); setOpen(false);
    try {
      const blob = await generateReport(format, spec, sourceBlocks);
      downloadBlob(blob, filenameFor(spec, format));
    } catch (e) {
      setError(e.message || 'Report generation failed.');
    } finally {
      setBusyFormat(null);
    }
  };

  const doPreview = async () => {
    setBusyFormat('preview'); setError(null);
    try {
      const blob = await generateReport('pdf', spec, sourceBlocks);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message || 'Preview failed.');
    } finally {
      setBusyFormat(null);
    }
  };

  const PrimaryIcon = FORMAT_META[spec.defaultFormat]?.icon || FileText;
  const altFormats = ['pdf', 'xlsx', 'docx'].filter(f => f !== spec.defaultFormat);

  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white p-4 relative overflow-hidden">
      {busy && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-100 overflow-hidden">
          <div className="h-full w-1/3 bg-blue-600 animate-report-progress" />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          {busy ? <Loader className="w-5 h-5 text-blue-700 animate-spin" /> : <PrimaryIcon className="w-5 h-5 text-blue-700" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{spec.title}</div>
          {spec.subtitle && <div className="text-xs text-slate-500 truncate">{spec.subtitle}</div>}
          {spec.audience && <div className="text-xs text-slate-400">Audience: {spec.audience}</div>}
          {busy && (
            <div className="mt-1 flex items-center gap-2 text-xs text-blue-700">
              <Loader className="w-3 h-3 animate-spin" />
              Generating {busyFormat === 'preview' ? 'PDF preview' : FORMAT_META[busyFormat]?.label || busyFormat}… this can take a few seconds.
            </div>
          )}
          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        </div>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => doDownload(spec.defaultFormat)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait"
          >
            {busy ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {busy && busyFormat === spec.defaultFormat
              ? `Generating ${FORMAT_META[spec.defaultFormat]?.label}…`
              : `Download ${FORMAT_META[spec.defaultFormat]?.label}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center text-xs px-1.5 py-1.5 rounded-lg ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            aria-label="More formats"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {spec.defaultFormat === 'pdf' && (
            <button
              type="button"
              disabled={busy}
              onClick={doPreview}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-1"
              aria-label="Preview PDF"
            >
              <ExternalLink className="w-3.5 h-3.5" /> preview
            </button>
          )}
          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white ring-1 ring-slate-200 rounded-lg shadow-md overflow-hidden z-10">
              {altFormats.map(f => {
                const Icon = FORMAT_META[f].icon;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => doDownload(f)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Icon className="w-3.5 h-3.5" /> Download {FORMAT_META[f].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {previewUrl && (
        <div className="mt-3 fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>
          <div className="bg-white rounded-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{spec.title} — preview</div>
              <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="text-xs text-slate-500 hover:text-slate-700">Close</button>
            </div>
            <iframe src={previewUrl} title="PDF preview" className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
