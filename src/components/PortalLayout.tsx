import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ClipboardList,
  FileText,
  Gauge,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext';
import { hasPermission } from '../lib/rbac';
import { formatShortDate } from './StatusLabels';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
  badge?: number;
  badgeTone?: 'neutral' | 'critical';
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

export const PortalLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUser,
    directoryAccounts,
    complaints,
    notifications,
    settings,
    globalSearch,
    setGlobalSearch,
    toasts,
    dismissToast,
    signInAs,
    logout,
    markAllNotificationsRead,
  } = usePortal();

  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const counts = useMemo(() => {
    return {
      allCount: complaints.length,
      newCount: complaints.filter((c) => c.status === 'New' || c.status === 'Reviewed').length,
      pendingCount: complaints.filter((c) => c.status === 'Pending').length,
      inProgressCount: complaints.filter(
        (c) => c.status === 'In Progress' || c.status === 'Resolution Submitted'
      ).length,
      escalatedCount: complaints.filter((c) => c.status === 'Escalated').length,
    };
  }, [complaints]);

  const navGroups: NavGroup[] = useMemo(() => {
    if (!currentUser) return [];
    const role = currentUser.role;
    const isAdminOrSupervisory =
      role === 'Super Admin' || role === 'State Admin' || role === 'District Admin';

    const groups: NavGroup[] = [
      {
        heading: 'Overview',
        items: [
          {
            label: 'Dashboard',
            to: '/',
            icon: LayoutDashboard,
            visible: hasPermission(role, 'view_dashboard'),
          },
        ],
      },
      {
        heading: 'Complaint Management',
        items: [
          {
            label: 'All Complaints',
            to: '/complaints',
            icon: FileText,
            visible: true,
            badge: counts.allCount,
            badgeTone: 'neutral',
          },
          {
            label: 'New Complaints',
            to: '/complaints/new',
            icon: Inbox,
            visible: isAdminOrSupervisory,
            badge: counts.newCount > 0 ? counts.newCount : undefined,
            badgeTone: 'neutral',
          },
          {
            label: 'Pending',
            to: '/complaints/pending',
            icon: Clock,
            visible: true,
            badge: counts.pendingCount > 0 ? counts.pendingCount : undefined,
            badgeTone: 'neutral',
          },
          {
            label: 'In Progress',
            to: '/complaints/in-progress',
            icon: ClipboardList,
            visible: true,
            badge: counts.inProgressCount > 0 ? counts.inProgressCount : undefined,
            badgeTone: 'neutral',
          },
          {
            label: 'Resolved',
            to: '/complaints/resolved',
            icon: CheckCircle2,
            visible: true,
          },
          {
            label: 'Escalated & SLA',
            to: '/complaints/escalated',
            icon: AlertTriangle,
            visible: true,
            badge: counts.escalatedCount > 0 ? counts.escalatedCount : undefined,
            badgeTone: 'critical',
          },
          {
            label: 'Assign Complaints',
            to: '/assign',
            icon: UserCheck,
            visible: hasPermission(role, 'assign_complaint'),
          },
        ],
      },
      {
        heading: 'Operations',
        items: [
          {
            label: 'Live Issues Map',
            to: '/map',
            icon: MapIcon,
            visible: hasPermission(role, 'view_live_map'),
          },
          {
            label: 'Departments',
            to: '/departments',
            icon: Building2,
            visible: hasPermission(role, 'view_departments'),
          },
          {
            label: 'Officers & Staff',
            to: '/staff',
            icon: Users,
            visible: hasPermission(role, 'view_staff'),
          },
        ],
      },
      {
        heading: 'Monitoring',
        items: [
          {
            label: 'Analytics & Reports',
            to: '/analytics',
            icon: BarChart3,
            visible: hasPermission(role, 'view_analytics'),
          },
          {
            label: 'Performance',
            to: '/performance',
            icon: Gauge,
            visible: hasPermission(role, 'view_performance'),
          },
          {
            label: 'Activity Logs',
            to: '/activity-logs',
            icon: Activity,
            visible: hasPermission(role, 'view_activity_logs'),
          },
        ],
      },
      {
        heading: 'Administration',
        items: [
          {
            label: 'User Management',
            to: '/users',
            icon: ShieldAlert,
            visible: hasPermission(role, 'manage_users'),
          },
          {
            label: 'System Settings',
            to: '/settings',
            icon: Settings,
            visible: hasPermission(role, 'manage_settings'),
          },
        ],
      },
    ];

    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => i.visible),
      }))
      .filter((g) => g.items.length > 0);
  }, [currentUser, counts]);

  const routeMeta = useMemo(() => {
    const p = location.pathname;
    if (p === '/') return { title: 'Dashboard', crumbs: ['Overview', 'Dashboard'] };
    if (p === '/complaints')
      return { title: 'All Complaints', crumbs: ['Complaint Management', 'All Complaints'] };
    if (p === '/complaints/new')
      return { title: 'New Complaints', crumbs: ['Complaint Management', 'New Complaints'] };
    if (p === '/complaints/pending')
      return { title: 'Pending Complaints', crumbs: ['Complaint Management', 'Pending'] };
    if (p === '/complaints/in-progress')
      return { title: 'In Progress Complaints', crumbs: ['Complaint Management', 'In Progress'] };
    if (p === '/complaints/resolved')
      return { title: 'Resolved Complaints', crumbs: ['Complaint Management', 'Resolved'] };
    if (p === '/complaints/escalated')
      return {
        title: 'Priority & Escalation Management',
        crumbs: ['Complaint Management', 'Escalated & SLA'],
      };
    if (p.startsWith('/complaints/')) {
      const id = p.replace('/complaints/', '');
      return {
        title: `Complaint ${id}`,
        crumbs: ['Complaint Management', 'All Complaints', id],
      };
    }
    if (p === '/assign')
      return { title: 'Complaint Assignment', crumbs: ['Complaint Management', 'Assign Complaints'] };
    if (p === '/map') return { title: 'Live Issues Map', crumbs: ['Operations', 'Live Map'] };
    if (p === '/departments')
      return { title: 'Departments', crumbs: ['Operations', 'Departments'] };
    if (p === '/staff')
      return { title: 'Officers & Staff', crumbs: ['Operations', 'Officers & Staff'] };
    if (p === '/analytics')
      return { title: 'Analytics & Reports', crumbs: ['Monitoring', 'Analytics & Reports'] };
    if (p === '/performance')
      return { title: 'Performance Monitoring', crumbs: ['Monitoring', 'Performance'] };
    if (p === '/activity-logs')
      return { title: 'Activity Logs', crumbs: ['Monitoring', 'Activity Logs'] };
    if (p === '/users')
      return { title: 'User Management', crumbs: ['Administration', 'User Management'] };
    if (p === '/settings')
      return { title: 'System Settings', crumbs: ['Administration', 'System Settings'] };
    return { title: 'CivicTrack Portal', crumbs: ['Portal'] };
  }, [location.pathname]);

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.pathname.startsWith('/complaints')) {
      navigate('/complaints');
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-[#E5E7EB]">
      {/* Brand Block */}
      <div className="flex h-14 items-center justify-between border-b border-[#E5E7EB] px-4 shrink-0">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#2457C5] text-white shrink-0">
            <Landmark className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-[#202938] leading-none">
              CivicTrack
            </div>
            <div className="mt-1 text-[11px] font-medium text-[#687385] leading-none">
              Government Portal
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded p-1 text-[#687385] hover:bg-[#F5F6F8] lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Portal Navigation">
        {navGroups.map((group, idx) => (
          <div key={group.heading} className={idx > 0 ? 'border-t border-[#F1F3F5] pt-4' : ''}>
            <div className="px-2.5 pb-2 text-[11px] font-semibold tracking-wide text-[#687385]">
              {group.heading}
            </div>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/' || item.to === '/complaints'}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between rounded px-2.5 py-2 text-[13px] transition-colors ${
                          isActive
                            ? 'bg-[#EFF4FF] font-semibold text-[#2457C5]'
                            : 'font-medium text-[#374151] hover:bg-[#F5F6F8] hover:text-[#202938]'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`h-4 w-4 shrink-0 ${
                                isActive ? 'text-[#2457C5]' : 'text-[#687385]'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </span>
                          {item.badge !== undefined && (
                            <span
                              className={`ml-2 font-mono-tabular text-[11px] font-medium px-1.5 py-0.5 rounded-sm ${
                                item.badgeTone === 'critical'
                                  ? 'bg-[#FEF0F0] text-[#D94B4B]'
                                  : isActive
                                  ? 'bg-white text-[#2457C5]'
                                  : 'bg-[#F5F6F8] text-[#687385]'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom Official Profile & Logout */}
      {currentUser && (
        <div className="border-t border-[#E5E7EB] p-3.5 bg-[#FAFBFC] shrink-0">
          <div className="mb-3 flex items-start gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#2457C5] text-xs font-semibold text-white shrink-0">
              {currentUser.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#202938] truncate">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-[#687385] truncate">{currentUser.designation}</div>
              <div className="text-[11px] text-[#687385] truncate">{currentUser.departmentName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8] hover:text-[#D94B4B] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F5F6F8] text-[#202938]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block lg:w-60 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#202938]/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 w-64 max-w-[80vw] h-full">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-[#E5E7EB] bg-white px-4 sm:px-6">
          <div className="flex w-full items-center justify-between gap-4">
            {/* Left: Menu button + Page Title & Breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded border border-[#E5E7EB] p-1.5 text-[#202938] hover:bg-[#F5F6F8] lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[11px] text-[#687385] leading-none">
                  <span>CivicTrack</span>
                  {routeMeta.crumbs.map((crumb) => (
                    <React.Fragment key={crumb}>
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">{crumb}</span>
                    </React.Fragment>
                  ))}
                </div>
                <h1 className="mt-1 text-sm font-semibold text-[#202938] leading-none truncate">
                  {routeMeta.title}
                </h1>
              </div>
            </div>

            {/* Right: Search, Admin Area, Notifications, Profile Dropdown */}
            <div className="flex items-center gap-3 shrink-0">
              <form onSubmit={handleGlobalSearchSubmit} className="hidden md:block relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#687385]" />
                <input
                  type="search"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search ID, ward, or issue..."
                  aria-label="Global complaint search"
                  className="w-52 lg:w-64 rounded border border-[#E5E7EB] bg-[#F9FAFB] py-1.5 pl-8 pr-3 text-xs text-[#202938] placeholder:text-[#687385] focus:border-[#2457C5] focus:bg-white focus:outline-none"
                />
              </form>

              <div className="hidden xl:flex flex-col items-end border-r border-[#E5E7EB] pr-3 text-right leading-tight">
                <span className="text-[10px] font-medium text-[#687385]">Jurisdiction</span>
                <span className="text-xs font-medium text-[#202938]">
                  {currentUser?.jurisdiction || settings.administrativeRegion}
                </span>
              </div>

              {/* Notifications Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    setProfileOpen(false);
                  }}
                  className="relative flex h-8 w-8 items-center justify-center rounded border border-[#E5E7EB] bg-white text-[#202938] hover:bg-[#F5F6F8]"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded bg-[#D94B4B] px-1 font-mono-tabular text-[10px] font-semibold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-md border border-[#E5E7EB] bg-white shadow-lg z-40">
                    <div className="flex items-center justify-between border-b border-[#E5E7EB] px-3.5 py-2.5">
                      <span className="text-xs font-semibold text-[#202938]">
                        Operational Notifications
                      </span>
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-[11px] font-medium text-[#2457C5] hover:underline"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-72 divide-y divide-[#E5E7EB] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-[#687385]">
                          No active notifications for your scope.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setNotifOpen(false);
                              if (n.complaintId) navigate(`/complaints/${n.complaintId}`);
                            }}
                            className={`block w-full px-3.5 py-2.5 text-left hover:bg-[#F5F6F8] ${
                              !n.read ? 'bg-[#F8FAFF]' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-medium ${
                                  n.severity === 'critical'
                                    ? 'text-[#D94B4B]'
                                    : n.severity === 'warning'
                                    ? 'text-[#B37512]'
                                    : 'text-[#202938]'
                                }`}
                              >
                                {n.title}
                              </span>
                              <span className="text-[10px] text-[#687385] whitespace-nowrap">
                                {formatShortDate(n.createdAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#687385] line-clamp-2">
                              {n.detail}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Official Profile Dropdown & RBAC Role Switcher */}
              {currentUser && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen((v) => !v);
                      setNotifOpen(false);
                    }}
                    className="flex items-center gap-2 rounded border border-[#E5E7EB] bg-white px-2.5 py-1 text-left hover:bg-[#F5F6F8]"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-[#2457C5] text-[11px] font-semibold text-white shrink-0">
                      {currentUser.name
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <div className="hidden sm:block leading-tight">
                      <div className="text-xs font-medium text-[#202938] whitespace-nowrap">
                        {currentUser.name}
                      </div>
                      <div className="text-[10px] text-[#687385] whitespace-nowrap">
                        {currentUser.role}
                      </div>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-[#687385]" />
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 mt-2 w-72 rounded-md border border-[#E5E7EB] bg-white shadow-lg z-40">
                      <div className="border-b border-[#E5E7EB] px-3.5 py-2.5">
                        <div className="text-xs font-semibold text-[#202938]">
                          {currentUser.name}
                        </div>
                        <div className="text-[11px] text-[#687385]">
                          {currentUser.employeeId} · {currentUser.role}
                        </div>
                        <div className="text-[11px] text-[#687385]">{currentUser.email}</div>
                      </div>

                      <div className="border-b border-[#E5E7EB] px-3.5 py-2">
                        <div className="mb-1.5 text-[11px] font-semibold text-[#687385]">
                          Switch Active Official Role
                        </div>
                        <div className="space-y-1">
                          {directoryAccounts.map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => {
                                setProfileOpen(false);
                                signInAs(acc.id);
                                navigate('/');
                              }}
                              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                                acc.id === currentUser.id
                                  ? 'bg-[#EFF4FF] font-medium text-[#2457C5]'
                                  : 'text-[#202938] hover:bg-[#F5F6F8]'
                              }`}
                            >
                              <span className="truncate">{acc.role}</span>
                              <span className="ml-2 text-[10px] text-[#687385] truncate">
                                {acc.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-2">
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            logout();
                          }}
                          className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-[#D94B4B] hover:bg-[#FEF0F0]"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Sign Out of Portal</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-5 sm:p-6">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start justify-between gap-2 rounded border bg-white p-3 shadow-md ${
                t.type === 'error'
                  ? 'border-[#F4C2C2]'
                  : t.type === 'success'
                  ? 'border-[#B7E1CE]'
                  : 'border-[#C7D7FE]'
              }`}
            >
              <div className="min-w-0">
                <div
                  className={`text-xs font-semibold ${
                    t.type === 'error'
                      ? 'text-[#D94B4B]'
                      : t.type === 'success'
                      ? 'text-[#23845B]'
                      : 'text-[#2457C5]'
                  }`}
                >
                  {t.title}
                </div>
                {t.message && <p className="mt-0.5 text-[11px] text-[#687385]">{t.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-[#687385] hover:text-[#202938]"
                aria-label="Dismiss message"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
