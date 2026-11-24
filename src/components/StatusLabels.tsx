import React from 'react';
import type { ComplaintStatus, PriorityLevel } from '../types/civic';

const STATUS_STYLES: Record<ComplaintStatus, string> = {
  New: 'text-[#2457C5] bg-[#EFF4FF] border-[#C7D7FE]',
  Reviewed: 'text-[#202938] bg-[#F3F4F6] border-[#D1D5DB]',
  Pending: 'text-[#9A6700] bg-[#FEF7E6] border-[#F6D58E]',
  'In Progress': 'text-[#2457C5] bg-[#EFF4FF] border-[#BFD4FE]',
  'Resolution Submitted': 'text-[#7C4A03] bg-[#FFF8EB] border-[#F0C87A]',
  Resolved: 'text-[#1D6B4A] bg-[#ECF7F2] border-[#B7E1CE]',
  Escalated: 'text-[#B93838] bg-[#FEF0F0] border-[#F4C2C2]',
  Rejected: 'text-[#687385] bg-[#F3F4F6] border-[#D1D5DB]',
};

const PRIORITY_STYLES: Record<PriorityLevel, string> = {
  Critical: 'text-[#B93838] font-semibold',
  High: 'text-[#B37512] font-semibold',
  Medium: 'text-[#2457C5] font-medium',
  Low: 'text-[#687385] font-medium',
};

export const StatusLabel: React.FC<{ status: ComplaintStatus }> = ({ status }) => {
  return (
    <span
      className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
};

export const PriorityLabel: React.FC<{ priority: PriorityLevel }> = ({ priority }) => {
  return (
    <span className={`text-xs whitespace-nowrap ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  );
};

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
