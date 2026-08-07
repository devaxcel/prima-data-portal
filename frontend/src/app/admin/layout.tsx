'use client';

import { LayoutDashboard, Database, Users, FileText, Tags, Settings } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      allowedRoles={['ADMIN', 'DATA_MANAGER']}
      nav={[
        { href: '/admin', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
        { href: '/admin/datasets', label: 'Datasets', icon: <Database className="w-4 h-4" /> },
        { href: '/admin/categories', label: 'Categories', icon: <Tags className="w-4 h-4" /> },
        { href: '/admin/users', label: 'Users', icon: <Users className="w-4 h-4" /> },
        { href: '/admin/audit', label: 'Audit log', icon: <FileText className="w-4 h-4" /> },
        { href: '/admin/settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
