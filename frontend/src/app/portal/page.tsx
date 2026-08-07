'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import { formatBytes, getErrorMessage } from '@/lib/utils';
import { Filter, Search, Download, ArrowRight, X, ArrowUp, ArrowDown, ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { useCategoriesFlat } from '@/lib/categories';

type SortKey = 'name' | 'category' | 'updatedAt';

export default function PortalPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('category');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const categories = useCategoriesFlat();

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-datasets', search, categoryId, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({ take: '100', sortBy, sortOrder });
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      return (await api.get(`/datasets?${params}`)).data;
    },
  });

  const items = data?.items ?? [];
  const selected = items.find((d: any) => d.id === selectedId) ?? items[0];

  // Build a category tree matching the actual hierarchy the admin created,
  // and hang datasets at the exact category node they belong to.
  const tree = useMemo(() => {
    if (sortBy !== 'category' || items.length === 0) return null;
    if (!categories.data) return null;

    type Node = {
      id: string;
      name: string;
      parentId: string | null;
      children: Node[];
      datasets: any[];
      totalCount: number;
    };

    // Create a node for every category
    const nodesById = new Map<string, Node>();
    categories.data.forEach((c: any) => {
      nodesById.set(c.id, {
        id: c.id,
        name: c.name,
        parentId: c.parentId ?? null,
        children: [],
        datasets: [],
        totalCount: 0,
      });
    });

    // Link children to parents
    const roots: Node[] = [];
    nodesById.forEach((node) => {
      if (node.parentId && nodesById.has(node.parentId)) {
        nodesById.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Attach datasets to their exact category
    const uncategorised: any[] = [];
    for (const d of items) {
      const cid = d.category?.id;
      if (cid && nodesById.has(cid)) {
        nodesById.get(cid)!.datasets.push(d);
      } else {
        uncategorised.push(d);
      }
    }

    // Compute totalCount recursively (datasets in self + all descendants)
    const countDown = (n: Node): number => {
      let sum = n.datasets.length;
      for (const c of n.children) sum += countDown(c);
      n.totalCount = sum;
      return sum;
    };
    roots.forEach(countDown);

    // Prune branches that have no datasets anywhere in their subtree
    const prune = (nodes: Node[]): Node[] =>
      nodes
        .filter((n) => n.totalCount > 0)
        .map((n) => ({ ...n, children: prune(n.children) }));

    const prunedRoots = prune(roots);

    if (uncategorised.length > 0) {
      prunedRoots.push({
        id: '__uncategorised__',
        name: 'Uncategorised',
        parentId: null,
        children: [],
        datasets: uncategorised,
        totalCount: uncategorised.length,
      });
    }

    return prunedRoots;
  }, [items, sortBy, categories.data]);

  // Auto-expand every folder when search or filter is active so results are visible
  const forceExpandAll = Boolean(search || categoryId);
  const isExpanded = (nodeId: string) => forceExpandAll || expandedGroups.has(nodeId);
  const toggleGroup = (nodeId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const download = useMutation({
    mutationFn: async (id: string) => (await api.post(`/datasets/${id}/download`, {})).data,
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e) => alert(getErrorMessage(e)),
  });

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategoryId('');
    setShowFilters(false);
  };

  const activeFilterCount = (search ? 1 : 0) + (categoryId ? 1 : 0);

  function clickSort(key: SortKey) {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  }

  return (
    <div className="space-y-3">
      {/* Featured datasets card */}
      <section className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <header className="px-5 py-4 flex items-center justify-between border-b border-stone-100">
          <div>
            <h1 className="text-[15px] font-medium text-stone-900">Featured datasets</h1>
            <p className="text-xs text-stone-500 mt-0.5">
              {data ? `${data.total} dataset${data.total === 1 ? '' : 's'} available` : 'Loading…'}
            </p>
          </div>
          <Link href="/portal/downloads" className="text-xs text-brand-700 font-medium hover:underline inline-flex items-center gap-1">
            View downloads <ArrowRight className="w-3 h-3" />
          </Link>
        </header>

        <div className="px-5 py-3 flex items-center gap-2 border-b border-stone-100">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs transition ${
              showFilters || categoryId
                ? 'border-brand-300 bg-brand-50/40 text-brand-700'
                : 'border-stone-200 text-stone-700 hover:bg-stone-50'
            }`}
          >
            <Filter className="w-3 h-3" /> Filter
            {categoryId && <span className="ml-1 px-1.5 py-0.5 bg-brand-500 text-white text-[10px] rounded-full">1</span>}
          </button>
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 border border-stone-200 rounded-lg focus-within:border-brand-300 focus-within:ring-1 focus-within:ring-brand-300 transition">
            <Search className="w-3 h-3 text-stone-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search datasets"
              className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-stone-400"
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="text-stone-400 hover:text-stone-700">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-stone-500 hover:text-stone-900 px-2">
              Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="px-5 py-3 bg-stone-50/60 border-b border-stone-100 flex items-center gap-3 flex-wrap">
            <label className="text-xs text-stone-600 font-medium">Category:</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[200px]"
            >
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.path}</option>
              ))}
            </select>
            {sortBy !== 'category' && (
              <button
                onClick={() => clickSort('category')}
                className="text-xs text-brand-700 hover:underline"
              >
                Group by category
              </button>
            )}
          </div>
        )}

        <table className="w-full text-xs">
          <thead className="bg-stone-50">
            <tr>
              <SortableTh label="Name" sortKey="name" current={sortBy} order={sortOrder} onClick={clickSort} />
              <SortableTh label="Category" sortKey="category" current={sortBy} order={sortOrder} onClick={clickSort} />
              <Th>File type</Th>
              <SortableTh label="Updated" sortKey="updatedAt" current={sortBy} order={sortOrder} onClick={clickSort} />
              <th className="px-5 py-2.5 text-right text-[11px] font-medium text-stone-500 uppercase tracking-wider">Size</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-stone-500">Loading datasets…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-stone-500">
                {search || categoryId
                  ? 'No datasets match your filters.'
                  : 'No datasets available yet.'}
              </td></tr>
            )}

            {/* Tree view (sort by category) */}
            {tree && tree.map((node) => (
              <CategoryFolder
                key={node.id}
                node={node}
                depth={0}
                selected={selected}
                isExpanded={isExpanded}
                onToggle={toggleGroup}
                onSelect={setSelectedId}
              />
            ))}

            {/* Flat view (sort by name/updated) */}
            {!tree && items.map((d: any) => (
              <DatasetRow key={d.id} d={d} isSelected={selected?.id === d.id} onSelect={setSelectedId} depth={0} />
            ))}
          </tbody>
        </table>

        <footer className="px-5 py-2.5 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
          <span>{items.length} item{items.length === 1 ? '' : 's'} shown</span>
          {data && <span>1–{items.length} of {data.total}</span>}
        </footer>
      </section>

      {/* Preview card */}
      {selected && (
        <section className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="grid grid-cols-[1fr_240px] gap-6 items-center">
            <div>
              <div className="text-[10px] font-semibold text-brand-700 uppercase tracking-wider mb-1">
                Preview
              </div>
              <div className="text-base font-medium text-stone-900 mb-1">{selected.name}</div>
              <p className="text-xs text-stone-600 leading-relaxed line-clamp-3 max-w-xl">
                {selected.description || 'No description provided.'}
              </p>
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-stone-500">
                <span><span className="text-stone-400">Category:</span> <span className="text-stone-900">{selected.category?.name ?? '—'}</span></span>
                {selected.coverage && <span><span className="text-stone-400">Coverage:</span> <span className="text-stone-900">{selected.coverage}</span></span>}
                {selected.currentVersion && <span><span className="text-stone-400">Size:</span> <span className="text-stone-900">{formatBytes(selected.currentVersion.fileSizeBytes)}</span></span>}
                {selected.fileType && <span><span className="text-stone-400">Type:</span> <span className="text-stone-900">{selected.fileType}</span></span>}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Link
                href={`/portal/datasets/${selected.id}`}
                className="flex-1 text-center px-3 py-2 border border-stone-200 rounded-lg text-xs font-medium text-stone-900 hover:bg-stone-50"
              >
                Open details
              </Link>
              <button
                onClick={() => download.mutate(selected.id)}
                disabled={!selected.currentVersion || download.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                <Download className="w-3 h-3" />
                {download.isPending ? 'Preparing…' : 'Download'}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function CategoryFolder({ node, depth, selected, isExpanded, onToggle, onSelect }: {
  node: {
    id: string;
    name: string;
    children: any[];
    datasets: any[];
    totalCount: number;
  };
  depth: number;
  selected: any;
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const expanded = isExpanded(node.id);
  const hasChildren = node.children.length > 0;
  const hasDatasets = node.datasets.length > 0;

  return (
    <>
      <tr>
        <td
          colSpan={5}
          className="bg-stone-50/60 border-y border-stone-100 cursor-pointer select-none hover:bg-stone-100/70 transition"
          onClick={() => onToggle(node.id)}
          style={{ paddingLeft: `${20 + depth * 22}px` }}
        >
          <div className="flex items-center gap-2 py-2.5 pr-5">
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />}
            {expanded
              ? <FolderOpen className="w-4 h-4 text-brand-600 flex-shrink-0" />
              : <Folder className="w-4 h-4 text-brand-500 flex-shrink-0" />}
            <span className="text-[12px] font-semibold text-stone-800">{node.name}</span>
            <span className="text-[11px] text-stone-500 ml-1">
              {node.totalCount} dataset{node.totalCount === 1 ? '' : 's'}
            </span>
          </div>
        </td>
      </tr>

      {expanded && (
        <>
          {/* Direct datasets (files sitting in this folder itself) */}
          {hasDatasets && node.datasets.map((d: any) => (
            <DatasetRow
              key={d.id}
              d={d}
              isSelected={selected?.id === d.id}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}

          {/* Subfolders — render recursively */}
          {hasChildren && node.children.map((child: any) => (
            <CategoryFolder
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              isExpanded={isExpanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </>
  );
}

function DatasetRow({ d, isSelected, onSelect, depth = 0 }: { d: any; isSelected: boolean; onSelect: (id: string) => void; depth?: number }) {
  const indent = depth > 0 ? `${20 + depth * 22}px` : undefined;
  return (
    <tr
      onClick={() => onSelect(d.id)}
      className={`cursor-pointer transition border-t border-stone-100 ${
        isSelected
          ? 'bg-brand-50/60 border-l-2 border-l-brand-600'
          : 'border-l-2 border-l-transparent hover:bg-stone-50/60'
      }`}
    >
      <td className="py-3" style={{ paddingLeft: indent ?? '20px', paddingRight: '8px' }}>
        <Link
          href={`/portal/datasets/${d.id}`}
          className="font-medium text-stone-900 hover:text-brand-600"
          onClick={(e) => e.stopPropagation()}
        >
          {d.name}
        </Link>
      </td>
      <td className="px-2 py-3 text-stone-600">{d.category?.name ?? '—'}</td>
      <td className="px-2 py-3 text-stone-600">{d.fileType ?? '—'}</td>
      <td className="px-2 py-3 text-stone-500">{format(new Date(d.updatedAt), 'd MMM HH:mm')}</td>
      <td className="px-5 py-3 text-right text-stone-500">
        {d.currentVersion ? formatBytes(d.currentVersion.fileSizeBytes) : '—'}
      </td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2 py-2.5 text-left text-[11px] font-medium text-stone-500 uppercase tracking-wider first:px-5">
      {children}
    </th>
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
    <th className="px-2 py-2.5 text-left text-[11px] font-medium text-stone-500 uppercase tracking-wider first:px-5">
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
