import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePortal } from '../context/PortalContext';
import { hasPermission, isComplaintOverdue } from '../lib/rbac';

const REFERENCE_NOW = new Date('2026-11-24T09:15:00Z').getTime();

export const PerformancePage: React.FC = () => {
  const { currentUser, complaints, departments, officers } = usePortal();

  const metrics = useMemo(() => {
    const resolvedItems = complaints.filter((c) => c.status === 'Resolved' && c.resolvedAt);
    const avgResolutionHours =
      resolvedItems.length > 0
        ? Math.round(
            resolvedItems.reduce((sum, c) => {
              const start = new Date(c.reportedAt).getTime();
              const end = new Date(c.resolvedAt!).getTime();
              return sum + Math.max(1, (end - start) / (1000 * 60 * 60));
            }, 0) / resolvedItems.length
          )
        : 0;

    const total = complaints.length || 1;
    const resolutionRate = Math.round((resolvedItems.length / total) * 100);
    const overdueCount = complaints.filter((c) => isComplaintOverdue(c, REFERENCE_NOW)).length;
    const overduePct = Math.round((overdueCount / total) * 100);
    const slaCompliance = Math.max(0, 100 - overduePct);

    return { avgResolutionHours, resolutionRate, slaCompliance, overduePct };
  }, [complaints]);

  const deptPerformance = useMemo(() => {
    return departments.map((d) => {
      const items = complaints.filter((c) => c.assignedDepartmentId === d.id);
      const resolved = items.filter((c) => c.status === 'Resolved').length;
      const overdue = items.filter((c) => isComplaintOverdue(c, REFERENCE_NOW)).length;
      const rate = items.length > 0 ? Math.round((resolved / items.length) * 100) : 0;
      const sla =
        items.length > 0 ? Math.round(((items.length - overdue) / items.length) * 100) : 100;
      return {
        name: d.name,
        code: d.code,
        assigned: items.length,
        resolved,
        overdue,
        resolutionRate: rate,
        slaCompliance: sla,
      };
    });
  }, [departments, complaints]);

  const officerPerformance = useMemo(() => {
    return officers.map((o) => {
      const active = complaints.filter(
        (c) => c.assignedOfficerId === o.id && c.status !== 'Resolved' && c.status !== 'Rejected'
      ).length;
      return {
        ...o,
        active,
        deptName: departments.find((d) => d.id === o.departmentId)?.name || '—',
      };
    });
  }, [officers, complaints, departments]);

  if (!currentUser || !hasPermission(currentUser.role, 'view_performance')) {
    return (
      <div className="rounded-md border border-[#E5E7EB] bg-white p-8 text-center">
        <h2 className="text-sm font-semibold text-[#202938]">Access Restricted</h2>
        <p className="mt-1 text-xs text-[#687385]">
          Performance monitoring is restricted to administrative and supervisory staff.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1440px]">
      <div>
        <h2 className="text-lg font-semibold text-[#202938]">Performance Monitoring</h2>
        <p className="text-xs text-[#687385]">
          Resolution turnaround benchmarks, SLA compliance rates, and officer caseload efficiency
        </p>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#E5E7EB] rounded-md border border-[#E5E7EB] bg-white">
        <div className="px-4 py-3.5">
          <div className="text-xs text-[#687385]">Avg. Resolution Time</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#202938]">
            {metrics.avgResolutionHours} hrs
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="text-xs text-[#687385]">Department Resolution Rate</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#2457C5]">
            {metrics.resolutionRate}%
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="text-xs text-[#687385]">SLA Compliance</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#23845B]">
            {metrics.slaCompliance}%
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="text-xs text-[#687385]">Overdue Complaint Rate</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#D94B4B]">
            {metrics.overduePct}%
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="rounded-md border border-[#E5E7EB] bg-white p-4 lg:col-span-6">
          <h3 className="text-sm font-semibold text-[#202938]">SLA Compliance by Department (%)</h3>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptPerformance} margin={{ top: 8, right: 12, left: -16, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#687385' }}
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#687385' }} />
                <Tooltip />
                <Bar dataKey="slaCompliance" name="SLA Compliance %" fill="#23845B" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-md border border-[#E5E7EB] bg-white lg:col-span-6">
          <div className="border-b border-[#E5E7EB] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#202938]">Department SLA Scorecard</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5 text-right">Assigned</th>
                  <th className="px-4 py-2.5 text-right">Resolved</th>
                  <th className="px-4 py-2.5 text-right">Overdue</th>
                  <th className="px-4 py-2.5 text-right">SLA %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs">
                {deptPerformance.map((d) => (
                  <tr key={d.code} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-2.5 font-medium text-[#202938]">{d.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular">{d.assigned}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular text-[#23845B]">
                      {d.resolved}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular text-[#D94B4B]">
                      {d.overdue}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold text-[#202938]">
                      {d.slaCompliance}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Officer Workload Table */}
      <section className="rounded-md border border-[#E5E7EB] bg-white">
        <div className="border-b border-[#E5E7EB] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#202938]">Officer Workload & Completions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                <th className="px-4 py-2.5">Officer</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5">Ward</th>
                <th className="px-4 py-2.5 text-right">Active Cases</th>
                <th className="px-4 py-2.5 text-right">Completed</th>
                <th className="px-4 py-2.5">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-xs">
              {officerPerformance.map((o) => (
                <tr key={o.id} className="hover:bg-[#F9FAFB]">
                  <td className="px-4 py-2.5 font-medium text-[#202938]">
                    {o.name}{' '}
                    <span className="font-mono-tabular text-[11px] text-[#687385]">
                      ({o.employeeId})
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[#687385]">{o.deptName}</td>
                  <td className="px-4 py-2.5 text-[#687385]">{o.wardJurisdiction}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular text-[#2457C5]">
                    {o.active}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular text-[#23845B]">
                    {o.completedComplaints}
                  </td>
                  <td className="px-4 py-2.5 text-[#202938]">{o.availability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
