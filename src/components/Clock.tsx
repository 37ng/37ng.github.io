import { useEffect, useState } from "react";

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Renders a placeholder until mount so SSR output and the first client render match,
// then ticks every second off a real Date.
export function Clock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    setTime(formatTime(new Date()));
    const id = setInterval(() => setTime(formatTime(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="site-nav-fg font-mono text-xs tabular-nums">
      {time ?? "--:--:--"}
    </p>
  );
}
