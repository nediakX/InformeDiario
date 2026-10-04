// Marco visual de las pantallas de acceso (diseño "PSINet · Panel de Terreno").
import type { ReactNode } from 'react';
import './auth.css';

export type IconName = 'badge' | 'mail' | 'pin' | 'lock' | 'eye' | 'eyeOff' | 'arrow' | 'user';

const iconPaths: Record<IconName, ReactNode> = {
  badge: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M5.5 16c.5-1.6 1.3-2.4 2.5-2.4s2 .8 2.5 2.4M13 10h5M13 14h4" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: (
    <path d="m3 3 18 18M10.6 6.2A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a17.8 17.8 0 0 1-2.2 2.9M6.2 6.2C3.4 8.1 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 3.9-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

export function Field({ id, label, icon, error, children }: {
  id: string;
  label: string;
  icon: IconName;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="field-shell">
        <span className="field-icon"><Icon name={icon} /></span>
        {children}
      </div>
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export default function AuthLayout({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="auth-card" aria-label={ariaLabel}>
        <div className="safety-stripe" />
        <div className="card-content">
          <header className="brand-header">
            <div className="brand-lockup" aria-label="PSINet Panel de Terreno">
              <div className="brand-mark">
                <span />
                <span />
                <span />
              </div>
              <div>
                <div className="brand-name">PSI<span>NET</span></div>
                <div className="brand-subtitle">PANEL DE TERRENO</div>
              </div>
            </div>
            <div className="security-tag">
              <span className="security-tag-dot" />
              ACCESO SEGURO
            </div>
          </header>
          {children}
        </div>
      </section>

      <footer className="page-footer">
        <div className="server-status"><span /> SISTEMA DE INFORMES DSAL</div>
        <p>PSINet Telecommunications © {new Date().getFullYear()} — Sistema de Registro Unificado</p>
      </footer>
    </main>
  );
}
