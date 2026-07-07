'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import axios from 'axios';
import { ArrowLeft, Upload as UploadIcon } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { formatBytes, getErrorMessage } from '@/lib/utils';
import { DatasetPreviewTable } from '@/components/DatasetPreviewTable';

export default function AdminDatasetDetail() {
  const params = useParams<{ id: string }>();
  const [showUpload, setShowUpload] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-dataset', params.id],
    queryFn: async () => (await api.get(`/datasets/${params.id}`)).data,
  });

  if (isLoading) return <div className="text-stone-500 text-sm">Loading…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/admin/datasets" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft className="w-4 h-4" /> Back to datasets
      </Link>

      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-brand-600 font-semibold mb-1">{data.category?.name ?? '—'}</div>
            <h1 className="text-2xl font-semibold text-stone-900">{data.name}</h1>
            <p className="text-sm text-stone-600 mt-2 max-w-2xl">{data.description}</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600"
          >
            <UploadIcon className="w-4 h-4" /> Upload new version
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-stone-200 text-sm">
          <Meta label="Status" value={<span className="capitalize">{data.status.toLowerCase()}</span>} />
          <Meta label="Coverage" value={data.coverage || '—'} />
          <Meta label="Current version" value={data.currentVersion?.version || 'No file'} />
          <Meta label="File size" value={data.currentVersion ? formatBytes(data.currentVersion.fileSizeBytes) : '—'} />
        </div>
      </div>

      {data.currentVersion && (
        <section className="bg-white border border-stone-200 rounded-xl">
          <div className="px-5 py-3 border-b border-stone-200">
            <h2 className="text-sm font-semibold">Preview</h2>
            <p className="text-xs text-stone-500 mt-0.5">What clients will see when browsing this dataset.</p>
          </div>
          <div className="p-5">
            <DatasetPreviewTable datasetId={data.id} />
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
            <div key={v.id} className="px-5 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{v.version}{data.currentVersionId === v.id && <span className="ml-2 text-xs text-brand-600">(current)</span>}</div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {format(new Date(v.publishedAt), 'd MMM yyyy')} · {formatBytes(v.fileSizeBytes)}
                  </div>
                </div>
              </div>
              {v.changelog && <div className="text-xs text-stone-600 mt-1">{v.changelog}</div>}
            </div>
          ))}
        </div>
      </div>

      {showUpload && <UploadModal datasetId={params.id} datasetName={data.name} onClose={() => setShowUpload(false)} />}
    </div>
  );
}

function UploadModal({ datasetId, datasetName, onClose }: { datasetId: string; datasetName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [version, setVersion] = useState('v1.0');
  const [file, setFile] = useState<File | null>(null);
  const [changelog, setChangelog] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return setError('Choose a file first');
    setError(null);
    setUploading(true);

    try {
      // Step 1 — request presigned URL
      setStatus('Requesting upload URL…');
      const { data: prep } = await api.post(`/datasets/${datasetId}/upload-url`, {
        version, fileName: file.name, contentType: file.type || 'application/octet-stream',
      });

      // Step 2 — direct upload to S3 / Supabase Storage
      setStatus('Uploading file…');
   await axios.put(prep.uploadUrl, file, {
  headers: { 'Content-Type': file.type || 'application/octet-stream' },
  transformRequest: [(data) => data],
  onUploadProgress: (e) => {
    if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
  },
});

      // Step 3 — confirm version
      setStatus('Finalising…');
      await api.post(`/datasets/${datasetId}/versions`, {
        version, fileKey: prep.fileKey, fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        changelog: changelog || undefined,
        setCurrent: true,
      });

      qc.invalidateQueries({ queryKey: ['admin-dataset', datasetId] });
      qc.invalidateQueries({ queryKey: ['admin-datasets'] });
      onClose();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="px-6 py-4 border-b border-stone-200">
          <h2 className="text-base font-semibold">Upload new version</h2>
          <p className="text-xs text-stone-500 mt-0.5">{datasetName}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Version label</label>
            <input type="text" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. v1.0, 2026-Q1"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">File</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm" />
            {file && <div className="text-xs text-stone-500 mt-1">{file.name} · {formatBytes(file.size)}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Changelog (optional)</label>
            <textarea rows={2} value={changelog} onChange={(e) => setChangelog(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
          </div>

          {uploading && (
            <div>
              <div className="text-xs text-stone-600 mb-1">{status} ({progress}%)</div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-stone-50 border-t border-stone-200 rounded-b-xl">
          <button onClick={onClose} disabled={uploading} className="px-4 py-2 border border-stone-300 rounded-lg text-sm">Cancel</button>
          <button onClick={handleUpload} disabled={uploading || !file} className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
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
