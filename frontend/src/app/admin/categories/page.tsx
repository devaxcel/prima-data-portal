'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCategoriesFlat, useCategoriesTree, type FlatCategory } from '@/lib/categories';
import { Plus, X, Pencil, Trash2, Folder, FolderOpen, FolderPlus } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';

export default function AdminCategoriesPage() {
  const tree = useCategoriesTree();
  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);
  const [editing, setEditing] = useState<FlatCategory | null>(null);

  return (
    <div className="space-y-3">
      <section className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <header className="px-5 py-4 flex items-center justify-between border-b border-stone-100">
          <div>
            <h1 className="text-[15px] font-medium text-stone-900">Categories</h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Organise datasets into folders and subfolders. Hover any row to add subcategories, edit, or delete.
            </p>
          </div>
          <button
            onClick={() => setCreating({})}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> New top-level category
          </button>
        </header>

        {/* Column headers */}
        <div className="px-4 py-2 bg-stone-50/60 border-b border-stone-200 grid grid-cols-[minmax(0,1fr)_140px_100px_200px] gap-3 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
          <span>Name</span>
          <span>Slug</span>
          <span className="text-right">Datasets</span>
          <span className="text-right pr-1">Actions</span>
        </div>

        <div className="p-2">
          {tree.isLoading && <div className="text-sm text-stone-500 py-6 text-center">Loading…</div>}
          {tree.data && tree.data.length === 0 && (
            <div className="text-sm text-stone-500 text-center py-8">
              No categories yet. Click &quot;New top-level category&quot; to add the first one.
            </div>
          )}
          {tree.data && tree.data.map((node) => (
            <CategoryRow
              key={node.id}
              node={node}
              depth={0}
              onAddChild={(parentId) => setCreating({ parentId })}
              onEdit={(n) => setEditing(n as any)}
            />
          ))}
        </div>
      </section>

      {creating && (
        <CategoryModal
          mode="create"
          parentId={creating.parentId}
          onClose={() => setCreating(null)}
        />
      )}
      {editing && (
        <CategoryModal
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  node: any;
  depth: number;
  onAddChild: (id: string) => void;
  onEdit: (n: any) => void;
}

function CategoryRow({ node, depth, onAddChild, onEdit }: RowProps) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.delete(`/categories/${node.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (e) => alert(getErrorMessage(e)),
  });

  const hasChildren = node.children && node.children.length > 0;
  const usageCount = node._count?.datasets ?? 0;

  return (
    <div>
      <div
        className="grid grid-cols-[minmax(0,1fr)_140px_100px_200px] gap-3 items-center px-2 py-2 rounded-lg hover:bg-stone-50/60 group transition"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {/* Name with folder icon */}
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren
            ? <FolderOpen className="w-4 h-4 text-brand-500 flex-shrink-0" />
            : <Folder className="w-4 h-4 text-stone-400 flex-shrink-0" />}
          <span className="text-sm font-medium text-stone-900 truncate">{node.name}</span>
        </div>

        {/* Slug */}
        <span className="text-[11px] text-stone-400 font-mono truncate">{node.slug}</span>

        {/* Dataset count */}
        <span className="text-[11px] text-stone-500 text-right">
          {usageCount} dataset{usageCount === 1 ? '' : 's'}
        </span>

        {/* Actions — always visible, subtle by default, brighter on hover */}
        <div className="flex items-center justify-end gap-1 pr-1">
          <button
            onClick={() => onAddChild(node.id)}
            className="inline-flex items-center gap-1 px-2 py-1 border border-stone-200 text-stone-600 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50/40 rounded text-[11px] font-medium transition"
            title="Add subcategory under this one"
          >
            <FolderPlus className="w-3 h-3" />
            Subcategory
          </button>
          <button
            onClick={() => onEdit(node)}
            className="p-1.5 text-stone-500 hover:bg-stone-100 hover:text-brand-700 rounded transition"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete category "${node.name}"?`)) remove.mutate();
            }}
            className="p-1.5 text-stone-500 hover:bg-stone-100 hover:text-red-600 rounded transition"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subcategories */}
      {hasChildren && node.children.map((child: any) => (
        <CategoryRow key={child.id} node={child} depth={depth + 1} onAddChild={onAddChild} onEdit={onEdit} />
      ))}
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────

interface ModalProps {
  mode: 'create' | 'edit';
  parentId?: string;
  existing?: FlatCategory;
  onClose: () => void;
}

function CategoryModal({ mode, parentId, existing, onClose }: ModalProps) {
  const qc = useQueryClient();
  const flat = useCategoriesFlat();

  const [name, setName] = useState(existing?.name ?? '');
  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [parent, setParent] = useState<string>(existing?.parentId ?? parentId ?? '');
  const [sortOrder, setSortOrder] = useState<number>(existing?.sortOrder ?? 0);
  const [error, setError] = useState<string | null>(null);

  const setNameAndSlug = (v: string) => {
    setName(v);
    if (mode === 'create') {
      setSlug(v.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        sortOrder,
      };
      // Only include parentId if it changed or is explicitly set
      if (mode === 'create') {
        body.parentId = parent || undefined;
      } else if (mode === 'edit') {
        body.parentId = parent || null;
      }

      if (mode === 'create') {
        return (await api.post('/categories', body)).data;
      } else {
        return (await api.patch(`/categories/${existing!.id}`, body)).data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['admin-datasets'] });
      onClose();
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  // Filter parents — for edit mode, exclude self and descendants
  const availableParents = (flat.data ?? []).filter((c) => {
    if (mode === 'create') return true;
    if (!existing) return true;
    if (c.id === existing.id) return false;
    // Walk up parents — if we ever reach existing.id, it's a descendant
    let cursor = c;
    while (cursor.parentId) {
      if (cursor.parentId === existing.id) return false;
      const next = flat.data?.find((x) => x.id === cursor.parentId);
      if (!next) break;
      cursor = next;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <h2 className="text-base font-semibold">
            {mode === 'create' ? 'New category' : 'Edit category'}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setNameAndSlug(e.target.value)}
              placeholder="e.g. Healthcare"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug (URL-friendly)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="healthcare"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-stone-500 mt-1">Used internally. Letters, numbers, and hyphens only.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Parent category</label>
            <select
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
            >
              <option value="">— None (top level) —</option>
              {availableParents.map((c) => (
                <option key={c.id} value={c.id}>{c.path}</option>
              ))}
            </select>
            <p className="text-xs text-stone-500 mt-1">Leave blank for a top-level category.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sort order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-32 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-stone-500 mt-1">Lower numbers appear first.</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-stone-50 border-t border-stone-200 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 rounded-lg text-sm">Cancel</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : (mode === 'create' ? 'Create' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
