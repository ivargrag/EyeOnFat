'use client';
/**
 * App shell (F1.2): beige sidebar with concentric-circles logo + tagline,
 * value-stream navigation with stage numbers, top bar with breadcrumb,
 * currency selector and user menu — per prototype.
 */
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth, useCurrency } from '@/lib/store';
import { LogoBlock } from '@/components/Logo';

const NAV: Array<{ href: string; stage: string; label: string; group?: string }> = [
  { href: '/dashboard', stage: '◉', label: 'Dashboard' },
  { href: '/data', stage: '00', label: 'Connectors & Data', group: 'Value stream' },
  { href: '/tree', stage: '01', label: 'Spend Tree' },
  { href: '/should-cost', stage: '02', label: 'Should-Cost / ZBC' },
  { href: '/ffg', stage: '03', label: 'Fuel for Growth' },
  { href: '/levers', stage: '04', label: '7 Levers & Sourcing' },
  { href: '/projects', stage: '05', label: 'Projects', group: 'Deliver' },
  { href: '/projects/add', stage: '＋', label: 'Add Project' },
  { href: '/reports', stage: '▤', label: 'Reports' },
  { href: '/agents', stage: '✦', label: 'Agent Crew', group: 'System' },
  { href: '/admin', stage: '⚙', label: 'Admin' },
];

const CRUMBS: Record<string, string> = {
  '/dashboard': 'Dashboard', '/data': 'Connectors & Data', '/tree': 'Spend Tree',
  '/should-cost': 'Should-Cost / ZBC', '/ffg': 'Fuel for Growth', '/levers': '7 Levers & Sourcing',
  '/projects': 'Projects', '/projects/add': 'Add Project', '/reports': 'Reports',
  '/agents': 'Agent Crew', '/admin': 'Admin',
};

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant, ready, logout } = useAuth();
  const { currency, setCurrency, asOf } = useCurrency();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready) return <div style={{ padding: 40 }}><span className="spin" /> Loading…</div>;
  if (!user) return null;

  const crumb = CRUMBS[pathname] ?? (pathname.startsWith('/projects') ? 'Projects' : 'Eye on Fat');

  return (
    <div className="shell">
      <aside>
        <div className="side-logo">
          <LogoBlock compact />
          <div className="tenant">Tenant · {tenant?.name ?? '—'}</div>
        </div>
        <nav className="snav">
          {NAV.map((n) => (
            <span key={n.href}>
              {n.group && <div className="grp">{n.group}</div>}
              <Link href={n.href} style={{ textDecoration: 'none' }}>
                <button className={pathname === n.href ? 'on' : ''} type="button">
                  <span className="stg">{n.stage}</span>{n.label}
                </button>
              </Link>
            </span>
          ))}
        </nav>
        <div className="side-foot">
          Grounding · Refusal · Human-in-the-loop<br />FY 2026–27 · v1.0{asOf ? ` · FX as-of ${asOf}` : ''}
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <span id="crumb">{crumb}</span>
          <span className="sp" />
          <div className="cursel">
            <label htmlFor="curSel">Currency</label>
            <select id="curSel" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">$ USD (base)</option><option value="EUR">€ EUR</option>
              <option value="GBP">£ GBP</option><option value="AED">AED</option>
              <option value="SAR">SAR</option><option value="INR">₹ INR</option>
            </select>
          </div>
          <div className="user">
            <span>{user.name} · {user.roles.join(', ')}</span>
            <div className="avatar" title="Sign out" style={{ cursor: 'pointer' }}
              onClick={() => { void logout().then(() => router.replace('/login')); }}>
              {user.name.charAt(0)}
            </div>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
