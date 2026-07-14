'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import axios from 'axios';
import Link from 'next/link';
import { format } from 'date-fns';
import { formatBytes, getErrorMessage } from '@/lib/utils';
import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useCategoriesFlat } from '@/lib/categories';

type SortKey = 'name' | 'category' | 'updatedAt' | 'createdAt';

export default function AdminDatasetsPage() {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showCreate, setShowCreate] = useState(false);

  const categories = useCategoriesFlat();

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-datasets', search, statusFilter, categoryFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({ take: '100', sortBy, sortOrder });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      return (await api.get(`/datasets?${params}`)).data;
    },
  });

  const publish = useMutation({
    mutationFn: (id: string) => api.post(`/datasets/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-datasets'] }),
    onError: (e) => alert(getErrorMessage(e)),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.post(`/datasets/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-datasets'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/datasets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-datasets'] }),
  });

  function clickSort(key: SortKey) {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Datasets</h1>
          <p className="text-sm text-stone-500 mt-0.5">Manage the full data catalogue</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-brand-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-brand-600"
        >
          <Plus className="w-4 h-4" /> New dataset
        </button>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search datasets…"
          className="flex-1 max-w-md px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 flex flex-wrap gap-2 items-center">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
          >
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.path}</option>
            ))}
          </select>
          <span className="text-xs text-stone-500 ml-auto">
            {data?.total ?? 0} dataset{data?.total === 1 ? '' : 's'}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <SortableTh label="Name" sortKey="name" current={sortBy} order={sortOrder} onClick={clickSort} />
              <SortableTh label="Category" sortKey="category" current={sortBy} order={sortOrder} onClick={clickSort} />
              <Th>Status</Th>
              <Th>Versions</Th>
              <Th>Downloads</Th>
              <SortableTh label="Updated" sortKey="updatedAt" current={sortBy} order={sortOrder} onClick={clickSort} />
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-500">Loading…</td></tr>}
            {data?.items?.map((d: any) => (
              <tr key={d.id} className="hover:bg-stone-50">
                <Td>
                  <Link href={`/admin/datasets/${d.id}`} className="font-medium text-stone-900 hover:text-brand-600">
                    {d.name}
                  </Link>
                  <div className="text-xs text-stone-500">{d.fileType} · {d.currentVersion ? formatBytes(d.currentVersion.fileSizeBytes) : 'No file'}</div>
                </Td>
                <Td className="text-stone-500">{d.category?.name ?? '—'}</Td>
                <Td><StatusBadge status={d.status} /></Td>
                <Td className="text-stone-500">{d._count?.versions ?? 0}</Td>
                <Td className="text-stone-500">{d._count?.downloads ?? 0}</Td>
                <Td className="text-stone-500 text-xs">{format(new Date(d.updatedAt), 'd MMM yyyy')}</Td>
                <Td className="space-x-2 whitespace-nowrap">
  {d.status === 'DRAFT' && (
    <button onClick={() => publish.mutate(d.id)} className="text-xs text-brand-600 hover:underline">Publish</button>
  )}
  {d.status === 'PUBLISHED' && (
    <button onClick={() => archive.mutate(d.id)} className="text-xs text-amber-700 hover:underline">Archive</button>
  )}
  {d.status === 'ARCHIVED' && (
    <button onClick={() => publish.mutate(d.id)} className="text-xs text-green-700 hover:underline">Republish</button>
  )}
  <button
    onClick={() => { if (confirm(`Delete "${d.name}"? This removes all versions and files.`)) remove.mutate(d.id); }}
    className="text-xs text-red-600 hover:underline"
  >
    Delete
  </button>
</Td>
              </tr>
            ))}
            {data?.items?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-stone-500">No datasets match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateDatasetModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function SortableTh({ label, sortKey, current, order, onClick }: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  order: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-stone-900 transition ${active ? 'text-brand-600' : ''}`}
      >
        {label}
        {active && (order === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );
}

function CreateDatasetModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const categories = useCategoriesFlat();
  const [form, setForm] = useState({
    name: '', slug: '', description: '', categoryId: '', coverage: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('v1.0');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-generate slug from name
  const setName = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    setForm({ ...form, name, slug });
  };

  async function handleCreate() {
    setError(null);
    if (!form.name || !form.slug || !form.description) {
      return setError('Name, slug, and description are required');
    }
    setBusy(true);
    try {
      // Step 1 — create the dataset (always)
      setStage('Creating dataset…');
      const body: any = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        coverage: form.coverage || undefined,
      };
      if (form.categoryId) body.categoryId = form.categoryId;
      const { data: created } = await api.post('/datasets', body);

      // Step 2 — if a file was chosen, upload it and create v1
      if (file) {
        setStage('Requesting upload URL…');
        const { data: prep } = await api.post(`/datasets/${created.id}/upload-url`, {
          version,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
        });

        setStage('Uploading file…');
        await axios.put(prep.uploadUrl, file, {
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          transformRequest: [(data) => data],
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
          },
        });

        setStage('Finalising version…');
        await api.post(`/datasets/${created.id}/versions`, {
          version,
          fileKey: prep.fileKey,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          setCurrent: true,
        });
      }

      qc.invalidateQueries({ queryKey: ['admin-datasets'] });
      qc.invalidateQueries({ queryKey: ['admin-datasets-recent'] });
      onClose();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to create dataset'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <h2 className="text-base font-semibold">New dataset</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug (URL-friendly)</label>
            <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
              <option value="">— Select a category —</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.path}</option>
              ))}
            </select>
            <p className="text-xs text-stone-500 mt-1">
              <Link href="/admin/categories" className="text-brand-600 hover:underline">Manage categories →</Link>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Coverage (e.g. 2018–2026)</label>
            <input type="text" value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {/* Optional file upload */}
          <div className="pt-2 border-t border-stone-100">
            <label className="block text-sm font-medium mb-1">File (optional — you can upload later)</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-stone-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-stone-300 file:bg-white file:text-sm file:text-stone-700 hover:file:bg-stone-50"
            />
            {file && (
              <>
                <div className="text-xs text-stone-500 mt-1.5">
                  {file.name} · {formatBytes(file.size)}
                </div>
                <div className="mt-2">
                  <label className="block text-xs font-medium text-stone-700 mb-1">Version label</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="v1.0"
                    className="w-32 px-2.5 py-1.5 border border-stone-300 rounded text-xs"
                  />
                </div>
              </>
            )}
          </div>

          {busy && (
            <div>
              <div className="text-xs text-stone-600 mb-1">{stage} {file && progress > 0 ? `(${progress}%)` : ''}</div>
              <div className="w-full bg-stone-100 rounded-full h-1.5">
                <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${file ? progress : 50}%` }} />
              </div>
            </div>
          )}

          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-stone-50 border-t border-stone-200 rounded-b-xl">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 border border-stone-300 rounded-lg text-sm">Cancel</button>
          <button onClick={handleCreate} disabled={busy} className="px-4 py-2 bg-brand-500 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {busy ? 'Saving…' : (file ? 'Create & upload' : 'Create dataset')}
          </button>
        </div>
      </div>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wide">{children}</th>
);
const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-4 py-3 ${className}`}>{children}</td>
);
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PUBLISHED: 'bg-green-50 text-green-800',
    DRAFT: 'bg-amber-50 text-amber-800',
    ARCHIVED: 'bg-stone-100 text-stone-700',
  };
  return <span className={`inline-block px-2 py-0.5 text-xs rounded capitalize ${colors[status]}`}>{status.toLowerCase()}</span>;
}
