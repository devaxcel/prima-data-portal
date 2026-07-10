'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Database, User, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface DatasetResult {
  id: string;
  name: string;
  category: { id: string; name: string; slug: string } | null;
  status: string;
  fileType: string | null;
}

interface UserResult {
  id: string;
  email: string;
  fullName: string;
  companyName: string | null;
  role: string;
  status: string;
}

interface SearchResponse {
  datasets: DatasetResult[];
  users: UserResult[];
  total: number;
}

export function GlobalSearch() {
  const router = useRouter();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // Debounced search
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await api.get<SearchResponse>(`/search?q=${encodeURIComponent(q)}`);
        setResults(res.data);
        setHighlight(0);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const flatResults: Array<{ kind: 'dataset' | 'user'; item: any }> = [];
  if (results) {
    results.datasets.forEach((d) => flatResults.push({ kind: 'dataset', item: d }));
    results.users.forEach((u) => flatResults.push({ kind: 'user', item: u }));
  }

  function selectResult(r: { kind: 'dataset' | 'user'; item: any }) {
    setOpen(false);
    setQ('');
    if (r.kind === 'dataset') {
      const path = user?.role === 'CLIENT' ? `/portal/datasets/${r.item.id}` : `/admin/datasets/${r.item.id}`;
      router.push(path);
    } else {
      router.push('/admin/users');
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && flatResults[highlight]) {
      e.preventDefault();
      selectResult(flatResults[highlight]);
    }
  }

  return (
    <div ref={containerRef} className="flex-1 relative">
      <div className="flex items-center gap-2 bg-stone-50 hover:bg-stone-100 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500 transition rounded-[10px] px-3.5 py-2">
        {loading ? (
          <Loader2 className="w-4 h-4 text-stone-400 animate-spin" />
        ) : (
          <Search className="w-4 h-4 text-stone-400" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search datasets, files, and resources"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-stone-400"
        />
        {q && (
          <button
            onClick={() => { setQ(''); setResults(null); inputRef.current?.focus(); }}
            className="text-stone-400 hover:text-stone-700 text-xs"
            aria-label="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-40 max-h-[480px] overflow-y-auto">
          {flatResults.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-sm text-stone-500">
              No results for &quot;{q}&quot;
            </div>
          )}

          {results && results.datasets.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-stone-50 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                Datasets
              </div>
              {results.datasets.map((d, i) => {
                const idx = i;
                const isHighlighted = highlight === idx;
                return (
                  <button
                    key={d.id}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => selectResult({ kind: 'dataset', item: d })}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                      isHighlighted ? 'bg-brand-50/60' : 'hover:bg-stone-50'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                      <Database className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-stone-900 truncate">{d.name}</div>
                      <div className="text-xs text-stone-500 truncate">
                        {d.category?.name ?? '—'} · {d.fileType ?? '—'} · {d.status.toLowerCase()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {results && results.users.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-stone-50 text-[10px] font-semibold text-stone-500 uppercase tracking-wider border-t border-stone-200">
                Users
              </div>
              {results.users.map((u, i) => {
                const idx = results.datasets.length + i;
                const isHighlighted = highlight === idx;
                return (
                  <button
                    key={u.id}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => selectResult({ kind: 'user', item: u })}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                      isHighlighted ? 'bg-brand-50/60' : 'hover:bg-stone-50'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-stone-900 truncate">
                        {u.fullName} <span className="text-stone-400">— {u.email}</span>
                      </div>
                      <div className="text-xs text-stone-500 truncate">
                        {u.companyName ? `${u.companyName} · ` : ''}{u.role.replace('_', ' ').toLowerCase()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}