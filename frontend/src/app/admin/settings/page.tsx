'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { Save, Info, CheckCircle } from 'lucide-react';

interface Setting {
  key: string;
  value: string;
  isPublic: boolean;
  description?: string | null;
  updatedAt: string;
}

// Human-friendly labels for known settings keys. Anything not listed
// falls back to formatting the key itself.
const KEY_LABELS: Record<string, { title: string; helper: string; multiline: boolean; example?: string }> = {
  download_warning_macro: {
    title: 'Macro-enabled file warning',
    helper: 'Shown to clients on the download page for macro-enabled files (.xlsm, .xlsb, .docm, .pptm). Use this to explain how they unblock and run macros safely.',
    multiline: true,
    example: 'e.g. "This is a macro-enabled workbook. Right-click the downloaded file → Properties → tick Unblock → OK before opening."',
  },
};

export default function AdminSettingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get<Setting[]>('/settings')).data,
  });

  return (
    <div className="space-y-3">
      <section className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-stone-100">
          <h1 className="text-[15px] font-medium text-stone-900">Portal settings</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Edit messages and text that appear across the client-facing portal.
            Changes go live immediately after saving.
          </p>
        </header>

        <div className="p-5 space-y-6">
          {isLoading && <div className="text-sm text-stone-500">Loading…</div>}
          {data && data.length === 0 && (
            <div className="text-sm text-stone-500 text-center py-8">
              No editable settings yet.
            </div>
          )}
          {data && data.map((setting) => (
            <SettingEditor key={setting.key} setting={setting} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingEditor({ setting }: { setting: Setting }) {
  const qc = useQueryClient();
  const meta = KEY_LABELS[setting.key] ?? {
    title: setting.key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    helper: setting.description ?? '',
    multiline: true,
  };

  const [value, setValue] = useState(setting.value);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValue(setting.value), [setting.value]);

  const dirty = value !== setting.value;

  const save = useMutation({
    mutationFn: () => api.patch(`/settings/${setting.key}`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['public-settings'] });
      setSavedAt(new Date());
      setError(null);
    },
    onError: (e) => setError(getErrorMessage(e, 'Save failed')),
  });

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-stone-50/60 border-b border-stone-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-stone-900">{meta.title}</div>
            {meta.helper && (
              <p className="text-xs text-stone-500 mt-0.5">{meta.helper}</p>
            )}
          </div>
          <div className="text-[10px] text-stone-400 whitespace-nowrap">
            {setting.isPublic ? 'Visible to clients' : 'Admin only'}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {meta.multiline ? (
          <textarea
            rows={5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}

        {meta.example && (
          <p className="text-[11px] text-stone-500 flex items-start gap-1.5">
            <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-stone-400" />
            {meta.example}
          </p>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 text-xs rounded px-3 py-2">{error}</div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-stone-500">
            {savedAt ? (
              <span className="inline-flex items-center gap-1 text-green-700">
                <CheckCircle className="w-3 h-3" />
                Saved
              </span>
            ) : dirty ? (
              <span className="text-amber-700">Unsaved changes</span>
            ) : (
              <span>Last saved {new Date(setting.updatedAt).toLocaleString()}</span>
            )}
          </div>
          <button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
