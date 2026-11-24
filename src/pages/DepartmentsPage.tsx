import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { hasPermission, isComplaintOverdue } from '../lib/rbac';
import type { Department } from '../types/civic';

const REFERENCE_NOW = new Date('2026-11-24T09:15:00Z').getTime();

export const DepartmentsPage: React.FC = () => {
  const { currentUser, departments, complaints, officers, createDepartment, updateDepartment } =
    usePortal();

  const canManage = currentUser ? hasPermission(currentUser.role, 'manage_departments') : false;

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [perfDept, setPerfDept] = useState<Department | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [headName, setHeadName] = useState('');
  const [headEmployeeId, setHeadEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [slaTargetHours, setSlaTargetHours] = useState(48);

  const deptStats = useMemo(() => {
    return departments.map((dept) => {
      const assigned = complaints.filter((c) => c.assignedDepartmentId === dept.id);
      const pending = assigned.filter((c) => c.status === 'Pending' || c.status === 'New').length;
      const inProgress = assigned.filter(
        (c) => c.status === 'In Progress' || c.status === 'Resolution Submitted'
      ).length;
      const resolved = assigned.filter((c) => c.status === 'Resolved').length;
      const overdue = assigned.filter((c) => isComplaintOverdue(c, REFERENCE_NOW)).length;
      const deptOfficers = officers.filter((o) => o.departmentId === dept.id);
      const slaPct =
        assigned.length > 0
          ? Math.round(((assigned.length - overdue) / assigned.length) * 100)
          : 100;
      return {
        dept,
        total: assigned.length,
        pending,
        inProgress,
        resolved,
        overdue,
        officerCount: deptOfficers.length,
        slaPct,
      };
    });
  }, [departments, complaints, officers]);

  const openCreateModal = () => {
    setEditingDept(null);
    setCode('');
    setName('');
    setHeadName('');
    setHeadEmployeeId('');
    setEmail('');
    setPhone('');
    setSlaTargetHours(48);
    setModalMode('create');
  };

  const openEditModal = (d: Department) => {
    setEditingDept(d);
    setCode(d.code);
    setName(d.name);
    setHeadName(d.headName);
    setHeadEmployeeId(d.headEmployeeId);
    setEmail(d.email);
    setPhone(d.phone);
    setSlaTargetHours(d.slaTargetHours);
    setModalMode('edit');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'create') {
      const ok = await createDepartment({
        code,
        name,
        headName,
        headEmployeeId,
        email,
        phone,
        slaTargetHours,
      });
      if (ok) setModalMode(null);
    } else if (modalMode === 'edit' && editingDept) {
      const ok = await updateDepartment(editingDept.id, {
        code,
        name,
        headName,
        headEmployeeId,
        email,
        phone,
        slaTargetHours,
      });
      if (ok) setModalMode(null);
    }
  };

  return (
    <div className="space-y-4 max-w-[1440px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#202938]">Department Management</h2>
          <p className="text-xs text-[#687385]">
            Municipal operating departments, leadership assignments, and caseload metrics
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded bg-[#2457C5] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Department</span>
          </button>
        )}
      </div>

      {/* Department Table */}
      <section className="rounded-md border border-[#E5E7EB] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#687385]">
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Department Name</th>
                <th className="px-4 py-2.5">Department Head</th>
                <th className="px-4 py-2.5 text-right">Staff</th>
                <th className="px-4 py-2.5 text-right">Assigned</th>
                <th className="px-4 py-2.5 text-right">Pending</th>
                <th className="px-4 py-2.5 text-right">In Progress</th>
                <th className="px-4 py-2.5 text-right">Resolved</th>
                <th className="px-4 py-2.5 text-right">Overdue</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-xs">
              {deptStats.map((row) => (
                <tr key={row.dept.id} className="hover:bg-[#F9FAFB]">
                  <td className="px-4 py-3 font-mono-tabular font-semibold text-[#2457C5]">
                    {row.dept.code}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#202938]">{row.dept.name}</div>
                    <div className="text-[11px] text-[#687385]">
                      {row.dept.email} · Target SLA {row.dept.slaTargetHours}h
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[#202938]">{row.dept.headName}</div>
                    <div className="font-mono-tabular text-[11px] text-[#687385]">
                      {row.dept.headEmployeeId}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular text-[#202938]">
                    {row.officerCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-medium text-[#202938]">
                    {row.total}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular text-[#D99A32]">
                    {row.pending}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular text-[#2457C5]">
                    {row.inProgress}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular text-[#23845B]">
                    {row.resolved}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono-tabular ${
                      row.overdue > 0 ? 'font-semibold text-[#D94B4B]' : 'text-[#687385]'
                    }`}
                  >
                    {row.overdue}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                    <button
                      type="button"
                      onClick={() => setPerfDept(row.dept)}
                      className="text-xs font-medium text-[#2457C5] hover:underline"
                    >
                      Performance
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openEditModal(row.dept)}
                        className="text-xs font-medium text-[#202938] hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Department Performance Summary Panel */}
      {perfDept && (
        <section className="rounded-md border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#202938]">
                {perfDept.name} ({perfDept.code}) — Operational Breakdown
              </h3>
              <p className="text-xs text-[#687385]">
                Department Head: {perfDept.headName} · Contact: {perfDept.phone}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPerfDept(null)}
              className="rounded p-1 text-[#687385] hover:bg-[#F5F6F8]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
            <div className="rounded border border-[#E5E7EB] p-3">
              <div className="text-[#687385]">Assigned Field Staff</div>
              <div className="mt-1 font-mono-tabular text-lg font-semibold text-[#202938]">
                {officers.filter((o) => o.departmentId === perfDept.id).length} officer(s)
              </div>
            </div>
            <div className="rounded border border-[#E5E7EB] p-3">
              <div className="text-[#687385]">Standard SLA Window</div>
              <div className="mt-1 font-mono-tabular text-lg font-semibold text-[#2457C5]">
                {perfDept.slaTargetHours} hours
              </div>
            </div>
            <div className="rounded border border-[#E5E7EB] p-3">
              <div className="text-[#687385]">Covered Wards</div>
              <div className="mt-1 text-xs font-medium text-[#202938]">
                {perfDept.activeWards.join(', ')}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Add / Edit Department Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#202938]/40 p-4">
          <div className="w-full max-w-md rounded-md border border-[#E5E7EB] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3.5">
              <h3 className="text-sm font-semibold text-[#202938]">
                {modalMode === 'create' ? 'Add Municipal Department' : 'Edit Department & Head'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-[#687385] hover:text-[#202938]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-[#202938] mb-1">Dept Code</label>
                  <input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. TRF-SIG"
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-medium text-[#202938] mb-1">Department Name</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Traffic Signals"
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#202938] mb-1">Department Head</label>
                  <input
                    required
                    value={headName}
                    onChange={(e) => setHeadName(e.target.value)}
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#202938] mb-1">Head Employee ID</label>
                  <input
                    value={headEmployeeId}
                    onChange={(e) => setHeadEmployeeId(e.target.value)}
                    placeholder="EMP-1050"
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#202938] mb-1">Official Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#202938] mb-1">SLA Target (Hours)</label>
                  <input
                    type="number"
                    min={4}
                    max={240}
                    value={slaTargetHours}
                    onChange={(e) => setSlaTargetHours(Number(e.target.value))}
                    className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-3">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded border border-[#E5E7EB] bg-white px-3 py-1.5 font-medium text-[#202938]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#2457C5] px-3.5 py-1.5 font-medium text-white hover:bg-[#1D46A3]"
                >
                  {modalMode === 'create' ? 'Create Department' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
