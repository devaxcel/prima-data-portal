'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ArrowLeft, Download, Info } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { formatBytes, getErrorMessage } from '@/lib/utils';
import { DatasetPreviewTable } from '@/components/DatasetPreviewTable';

export default function ClientDatasetDetail() {
  const params = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['client-dataset', params.id],
    queryFn: async () => (await api.get(`/datasets/${params.id}`)).data,
  });

  const download = useMutation({
    mutationFn: async (versionId?: string) => {
      const res = await api.post(`/datasets/${params.id}/download`, { versionId });
      return res.data;
    },
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e) => alert(getErrorMessage(e)),
  });

  if (isLoading) return <div className="text-stone-500 text-sm">Loading…</div>;
  if (error) return <div className="text-red-600 text-sm">Failed to load dataset.</div>;
  if (!data) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft className="w-4 h-4" /> Back to datasets
      </Link>

      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-brand-600 font-semibold mb-1">{data.category?.name ?? '—'}</div>
            <h1 className="text-2xl font-semibold text-stone-900">{data.name}</h1>
            <p className="text-sm text-stone-600 mt-2 max-w-2xl">{data.description}</p>
          </div>
          <button
            onClick={() => download.mutate(undefined)}
            disabled={!data.currentVersion || download.isPending}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {download.isPending ? 'Preparing…' : 'Download latest'}
          </button>
        </div>

        {data.currentVersion && (
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-stone-200">
            <Meta label="Current version" value={data.currentVersion.version} />
            <Meta label="File size" value={formatBytes(data.currentVersion.fileSizeBytes)} />
            <Meta label="File type" value={data.fileType ?? '—'} />
            <Meta label="Coverage" value={data.coverage ?? '—'} />
          </div>
        )}

        {isMacroEnabled(data.currentVersion?.fileName ?? '') && (
          <div className="mt-4 border border-amber-200 bg-amber-50/60 rounded-lg p-3 flex gap-2.5">
            <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <div className="font-medium mb-0.5">Macros disabled by default after download</div>
              <p>
                This is a macro-enabled workbook (.xlsm). Windows and macOS block macros on files
                downloaded from the web. To enable them:
              </p>
              <ul className="list-disc ml-4 mt-1 space-y-0.5">
                <li><strong>Windows:</strong> Right-click the downloaded file → <em>Properties</em> → tick <em>Unblock</em> → OK → then open in Excel.</li>
                <li><strong>Excel prompt:</strong> If Excel shows a yellow &quot;Enable Content&quot; bar at the top when opening, click it.</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {data.currentVersion && (
        <section className="bg-white border border-stone-200 rounded-xl">
          <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Preview</h2>
              <p className="text-xs text-stone-500 mt-0.5">First rows of the current version — full data available on download.</p>
            </div>
          </div>
          <div className="p-5">
            <DatasetPreviewTable datasetId={params.id} />
          </div>
        </section>
      )}

      <div className="bg-white border border-stone-200 rounded-xl">
        <div className="px-5 py-3 border-b border-stone-200">
          <h2 className="text-sm font-semibold">Version history</h2>
        </div>
        <div className="divide-y divide-stone-200">
          {data.versions?.length === 0 && (
            <div className="px-5 py-8 text-sm text-stone-500 text-center">No versions yet</div>
          )}
          {data.versions?.map((v: any) => (
            <div key={v.id} className="px-5 py-3 flex items-center justify-between hover:bg-stone-50">
              <div>
                <div className="font-medium text-sm">{v.version}</div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {format(new Date(v.publishedAt), 'd MMM yyyy')} · {formatBytes(v.fileSizeBytes)}
                </div>
                {v.changelog && <div className="text-xs text-stone-600 mt-1">{v.changelog}</div>}
              </div>
              <button onClick={() => download.mutate(v.id)} disabled={download.isPending}
                className="text-xs text-brand-600 hover:underline disabled:opacity-50">Download</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-sm font-medium text-stone-900 mt-0.5">{value}</div>
    </div>
  );
}

function isMacroEnabled(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.xlsm') || lower.endsWith('.xlsb') || lower.endsWith('.docm') || lower.endsWith('.pptm');
}
