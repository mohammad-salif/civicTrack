import React, { useMemo, useState } from 'react';
import { Download, Lock, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../components/StatusLabels';
import { usePortal } from '../context/PortalContext';
import { hasPermission } from '../lib/rbac';
import { exportToCsv } from '../utils/csvExport';

export const ActivityLogsPage: React.FC = () => {
  const { currentUser, activityLogs } = usePortal();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activityLogs.filter((l) => {
      if (roleFilter !== 'All' && l.actorRole !== roleFilter) return false;
      if (!q) return true;
      return (
        l.actorName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.complaintId && l.complaintId.toLowerCase().includes(q)) ||
        l.remarks.toLowerCase().includes(q)
      );
    });
  }, [activityLogs, search, roleFilter]);

  if (!currentUser || !hasPermission(currentUser.role, 'view_activity_logs')) {
    return (
      <div className="rounded-md border border-[#E5E7EB] bg-white p-8 text-center">
        <h2 className="text-sm font-semibold text-[#202938]">Access Restricted</h2>
        <p className="mt-1 text-xs text-[#687385]">
          You do not have permission to view administrative audit logs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1440px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#202938]">Administrative Activity Logs</h2>
          <p className="text-xs text-[#687385]">
            Immutable audit trail of official complaint reviews, assignments, escalations, and
            status transitions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-[11px] font-medium text-[#687385]">
            <Lock className="h-3 w-3" />
            <span>Read-Only Audit Trail</span>
          </span>
          {hasPermission(currentUser.role, 'export_reports') && (
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'civictrack-activity-logs.csv',
                  [
                    'Timestamp',
                    'Official',
                    'Role',
                    'Action',
                    'Complaint ID',
                    'Previous Status',
                    'New Status',
                    'Remarks',
                  ],
                  filteredLogs.map((l) => [
                    formatDateTime(l.timestamp),
                    l.actorName,
                    l.actorRole,
                    l.action,
                    l.complaintId || '—',
                    l.previousStatus || '—',
                    l.newStatus || '—',
                    l.remarks,
                  ])
                )
              }
              className="inline-flex items-center gap-1.5 rounded border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8]"
            >
              <Download className="h-3.5 w-3.5 text-[#687385]" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-3 rounded-md border border-[#E5E7EB] bg-white p-3.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#687385]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search official, action, complaint ID, or remarks..."
            className="w-full rounded border border-[#E5E7EB] bg-[#F9FAFB] py-1.5 pl-8 pr-3 text-xs text-[#202938] focus:border-[#2457C5] focus:bg-white focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by actor role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938]"
        >
          <option value="All">All Official Roles</option>
          <option value="Super Admin">Super Admin</option>
          <option value="State Admin">State Admin</option>
          <option value="District Admin">District Admin</option>
          <option value="Field Officer">Field Officer</option>
          <option value="Rescue / Response Team Member">Rescue / Response Team Member</option>
        </select>
      </section>

      {/* Audit Log Table */}
      <section className="rounded-md border border-[#E5E7EB] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                <th className="px-4 py-2.5 whitespace-nowrap">Date & Time</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Official</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Action Performed</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Affected Complaint</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Status Transition</th>
                <th className="px-4 py-2.5">Administrative Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#687385]">
                    No audit log entries match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-2.5 font-mono-tabular text-[11px] text-[#687385] whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-[#202938]">{log.actorName}</div>
                      <div className="text-[11px] text-[#687385]">{log.actorRole}</div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[#202938] whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 font-mono-tabular whitespace-nowrap">
                      {log.complaintId ? (
                        <Link
                          to={`/complaints/${log.complaintId}`}
                          className="font-semibold text-[#2457C5] hover:underline"
                        >
                          {log.complaintId}
                        </Link>
                      ) : (
                        <span className="text-[#687385]">System / Directory</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[#687385]">
                      {log.previousStatus && log.newStatus
                        ? `${log.previousStatus} → ${log.newStatus}`
                        : log.newStatus || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[#202938] max-w-md">{log.remarks}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
