import logoMark from '../../assets/logo-mark.png';

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src={logoMark} alt="" className="h-8 w-8 select-none" draggable={false} />
      {!compact && <span className="text-h2 font-bold text-ink">Mendunia Workbase</span>}
    </span>
  );
}
