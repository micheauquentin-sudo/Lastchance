export function CartoonBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-visible">
      {/* Cartoon explosion elements */}
      <div className="animate-burst-circle absolute h-full w-full scale-0 rounded-full border-[16px] border-yellow-400 opacity-0" />
      <div className="animate-burst-circle-delay absolute h-full w-full scale-0 rounded-full border-[8px] border-pink-400 opacity-0" />

      {/* Small comic stars popping out */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * 360) / 8;
        const rad = (angle * Math.PI) / 180;
        const tx = Math.sin(rad) * 160;
        const ty = -Math.cos(rad) * 160;
        return (
          <div
            key={`star-${i}`}
            className="animate-burst-star absolute"
            style={
              {
                "--tx": `${tx}px`,
                "--ty": `${ty}px`,
                animationDelay: `${i * 0.05}s`,
              } as React.CSSProperties
            }
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              className="fill-yellow-300 stroke-black stroke-[2px]"
              aria-hidden
            >
              <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z" />
            </svg>
          </div>
        );
      })}

      {/* Small comic bubble pops */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * 360) / 6 + 30;
        const rad = (angle * Math.PI) / 180;
        const tx = Math.sin(rad) * 120;
        const ty = -Math.cos(rad) * 120;
        const colors = ["bg-pink-400", "bg-blue-400", "bg-emerald-400"];
        const colorClass = colors[i % colors.length];
        return (
          <div
            key={`bubble-${i}`}
            className={`animate-burst-bubble absolute h-5 w-5 rounded-full border-2 border-black ${colorClass}`}
            style={
              {
                "--tx": `${tx}px`,
                "--ty": `${ty}px`,
                animationDelay: `${i * 0.08 + 0.1}s`,
              } as React.CSSProperties
            }
            aria-hidden
          />
        );
      })}
    </div>
  );
}
