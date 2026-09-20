export default function InterestArtwork({ kind }: { kind: string }) {
  if (kind === 'hpc')
    return (
      <div className="compute-art" aria-hidden="true">
        <div className="chip-grid">
          {Array.from({ length: 25 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <span className="art-formula">parallel possibilities</span>
        <span className="art-cross">+</span>
      </div>
    );
  if (kind === 'science')
    return (
      <div className="science-art" aria-hidden="true">
        <svg viewBox="0 0 320 150">
          <defs>
            <linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#65afec" stopOpacity=".4" />
              <stop offset="100%" stopColor="#65afec" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M10 125C70 125 89 125 119 67S164 5 194 65s49 60 116 60v15H10Z"
            fill="url(#curve-fill)"
          />
          <path
            d="M10 125C70 125 89 125 119 67S164 5 194 65s49 60 116 60"
            fill="none"
            stroke="#5399d9"
            strokeWidth="2"
          />
          <path
            d="M20 126h285M160 20v120"
            stroke="#81aad0"
            strokeOpacity=".4"
            strokeDasharray="3 5"
          />
          <circle cx="158" cy="26" r="5" fill="#549ce0" />
          <circle cx="158" cy="26" r="10" fill="none" stroke="#549ce0" strokeOpacity=".2" />
        </svg>
        <span className="art-formula">a little closer to understanding</span>
      </div>
    );
  return (
    <div className="network-art" aria-hidden="true">
      <svg viewBox="0 0 320 155">
        <g fill="none" stroke="#89b2dc" strokeWidth="1" opacity=".55">
          {[43, 78, 113].flatMap((y, i) =>
            [30, 63, 96, 129].map((y2, j) => (
              <path key={`${i}-${j}`} d={`M91 ${y} 160 ${y2} 229 ${y}`} />
            )),
          )}
          {[30, 63, 96, 129].map((y, i) => (
            <path key={i} d={`M160 ${y} 229 78`} />
          ))}
        </g>
        {[43, 78, 113].map((y, i) => (
          <circle key={`a-${i}`} cx="91" cy={y} r="7" fill="#f5fbff" stroke="#7caee0" />
        ))}
        {[30, 63, 96, 129].map((y, i) => (
          <circle
            key={`b-${i}`}
            cx="160"
            cy={y}
            r="8"
            fill={i === 1 ? '#529bdf' : '#e0f0ff'}
            stroke="#72a9df"
          />
        ))}
        {[43, 78, 113].map((y, i) => (
          <circle key={`c-${i}`} cx="229" cy={y} r="7" fill="#f5fbff" stroke="#7caee0" />
        ))}
      </svg>
      <span className="art-formula">connect the dots</span>
    </div>
  );
}
