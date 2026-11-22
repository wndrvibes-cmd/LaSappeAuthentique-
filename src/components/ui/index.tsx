/**
 * Primitives d'interface — La Sappe Authentique.
 * Composants partagés par la boutique et le back-office, pour garantir
 * une cohérence visuelle entre les deux (exigence du cahier des charges).
 */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes,
         type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ChevronDown, Info, Loader2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ────────────────────────────── Bouton ───────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brass';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-ivory hover:bg-ink-800 active:bg-ink-900 disabled:bg-ink-300',
  secondary: 'border border-ink/15 bg-transparent text-ink hover:border-ink/40 hover:bg-ink/[0.03]',
  ghost: 'text-ink-500 hover:bg-ink/[0.05] hover:text-ink',
  danger: 'bg-signal-danger text-white hover:bg-signal-danger/90',
  brass: 'bg-brass text-ink hover:bg-brass-light active:bg-brass-dark',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[0.8125rem]',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-7 text-[0.9375rem]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, fullWidth, className,
     children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded font-medium',
        'transition-all duration-200 ease-silk',
        'disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size],
        fullWidth && 'w-full', className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/** Lien stylé comme un bouton. */
export function ButtonLink({
  to, variant = 'primary', size = 'md', icon, fullWidth, className, children, ...rest
}: { to: string; variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode;
     fullWidth?: boolean; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded font-medium',
        'transition-all duration-200 ease-silk',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size],
        fullWidth && 'w-full', className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  );
}

/* ────────────────────────────── Champs ───────────────────────────────── */

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink-600">
          {label}
          {required && <span className="ml-0.5 text-signal-danger">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      {error && (
        <span className="mt-1 flex items-center gap-1 text-xs text-signal-danger">
          <XCircle className="h-3 w-3 shrink-0" aria-hidden />
          {error}
        </span>
      )}
    </label>
  );
}

const INPUT_BASE =
  'w-full rounded border border-ivory-400 bg-white px-3 py-2 text-sm text-ink ' +
  'placeholder:text-ink-300 transition-colors ' +
  'focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass ' +
  'disabled:bg-ivory-200 disabled:text-ink-400';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(INPUT_BASE, 'h-10', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(INPUT_BASE, 'resize-y', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(INPUT_BASE, 'h-10 appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ink-400" aria-hidden />
    </div>
  ),
);
Select.displayName = 'Select';

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-ink-600', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded-xs border-ivory-400 text-ink accent-ink focus:ring-brass"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

/* ────────────────────────────── Étiquettes ───────────────────────────── */

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brass';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ivory-200 text-ink-600 ring-ivory-400',
  success: 'bg-sage-soft text-signal-success ring-signal-success/25',
  warning: 'bg-brass-soft text-signal-warning ring-signal-warning/25',
  danger: 'bg-bordeaux-soft text-signal-danger ring-signal-danger/25',
  info: 'bg-blue-50 text-signal-info ring-signal-info/25',
  brass: 'bg-brass/15 text-brass-dark ring-brass/30',
};

export function Badge({ tone = 'neutral', children, className, icon }: {
  tone?: BadgeTone; children: ReactNode; className?: string; icon?: ReactNode;
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
      'uppercase tracking-wide ring-1 ring-inset', BADGE_TONES[tone], className,
    )}>
      {icon}
      {children}
    </span>
  );
}

/** Étiquette de statut de santé, commune à tous les modules Nexscope. */
export function StatusBadge({ status }: { status: 'healthy' | 'warning' | 'danger' | 'loss' }) {
  const map = {
    healthy: { tone: 'success' as BadgeTone, label: 'Sain' },
    warning: { tone: 'warning' as BadgeTone, label: 'À surveiller' },
    danger: { tone: 'danger' as BadgeTone, label: 'Critique' },
    loss: { tone: 'danger' as BadgeTone, label: 'À perte' },
  }[status];
  return <Badge tone={map.tone}>{map.label}</Badge>;
}

/* ────────────────────────────── Conteneurs ───────────────────────────── */

export function Card({ className, children, as: As = 'div' }: {
  className?: string; children: ReactNode; as?: 'div' | 'article' | 'section';
}) {
  return <As className={cn('card', className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, className }: {
  title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-ivory-300 px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-base text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[0.8125rem] text-ink-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ────────────────────────────── États ────────────────────────────────── */

export function EmptyState({ icon, title, description, action, className }: {
  icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 text-ink-300">{icon}</div>}
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-ink-400">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-ink-400', className)} aria-hidden />;
}

export function LoadingBlock({ label = 'Chargement…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-14 text-sm text-ink-400', className)}>
      <Spinner />
      {label}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

/** Message d'erreur honnête : on dit ce qui a échoué, pas « oups ». */
export function ErrorBlock({ title = 'Une erreur est survenue', message, onRetry, className }: {
  title?: string; message?: string | null; onRetry?: () => void; className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-signal-danger/25 bg-bordeaux-soft/50 p-5', className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-signal-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {message && <p className="mt-1 break-words text-[0.8125rem] text-ink-500">{message}</p>}
          {onRetry && (
            <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
              Réessayer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Encadrés ─────────────────────────────── */

type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

export function Notice({ tone = 'info', title, children, className }: {
  tone?: NoticeTone; title?: ReactNode; children?: ReactNode; className?: string;
}) {
  const styles: Record<NoticeTone, { box: string; icon: ReactNode }> = {
    info: { box: 'border-signal-info/25 bg-blue-50/60', icon: <Info className="h-4 w-4 text-signal-info" /> },
    warning: { box: 'border-signal-warning/30 bg-brass-soft/60', icon: <AlertTriangle className="h-4 w-4 text-signal-warning" /> },
    danger: { box: 'border-signal-danger/25 bg-bordeaux-soft/60', icon: <XCircle className="h-4 w-4 text-signal-danger" /> },
    success: { box: 'border-signal-success/25 bg-sage-soft/60', icon: <Check className="h-4 w-4 text-signal-success" /> },
  };
  return (
    <div className={cn('rounded border px-4 py-3', styles[tone].box, className)}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" aria-hidden>{styles[tone].icon}</span>
        <div className="min-w-0 text-[0.8125rem] leading-relaxed text-ink-600">
          {title && <p className="font-semibold text-ink">{title}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Tableau ──────────────────────────────── */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="-mx-px overflow-x-auto">
      <table className={cn('w-full min-w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function Th({ children, align = 'left', className }: {
  children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string;
}) {
  return (
    <th className={cn(
      'whitespace-nowrap border-b border-ivory-300 px-3 py-2.5',
      'text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-400',
      align === 'right' && 'text-right', align === 'center' && 'text-center',
      align === 'left' && 'text-left', className,
    )}>
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className }: {
  children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string;
}) {
  return (
    <td className={cn(
      'border-b border-ivory-200 px-3 py-2.5 text-ink-600',
      align === 'right' && 'text-right tabular', align === 'center' && 'text-center',
      className,
    )}>
      {children}
    </td>
  );
}

/* ────────────────────────────── Modale ───────────────────────────────── */

export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode;
  footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 animate-fade-in bg-ink/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={cn(
        'relative z-10 max-h-[92dvh] w-full overflow-hidden rounded-t-xl bg-white shadow-lift',
        'animate-fade-up sm:rounded-xl', widths[size],
      )}>
        <div className="flex items-center justify-between gap-4 border-b border-ivory-300 px-5 py-4">
          <h2 className="font-display text-lg text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded p-1 text-ink-400 transition-colors hover:bg-ivory-200 hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-ivory-300 bg-ivory-200/50 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
