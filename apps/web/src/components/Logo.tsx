/** Concentric-circles logo: black outer ring, red inner ring, black pupil. */
export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden>
      <i><b /></i>
    </span>
  );
}

export function LogoBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <div className="logo-row">
        <LogoMark />
        <div className="logo" style={compact ? { fontSize: 24 } : undefined}>
          EYE <span className="fat">ON FAT</span>
        </div>
      </div>
      <div className="tagline" style={compact ? { fontSize: 9, letterSpacing: '.16em' } : undefined}>
        Sustained Systemic Savings
      </div>
    </div>
  );
}
