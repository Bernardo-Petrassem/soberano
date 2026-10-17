import { useEffect, useRef, useState } from "react";

export function formatWatch(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Count-up clock. Pauses while `running` is false and keeps the elapsed time. */
export function useStopwatch(running: boolean) {
  const [ms, setMs] = useState(0);
  const acc = useRef(0);
  const stamp = useRef(0);

  useEffect(() => {
    if (!running) return;
    stamp.current = performance.now();
    const id = window.setInterval(() => {
      setMs(acc.current + (performance.now() - stamp.current));
    }, 200);
    return () => {
      acc.current += performance.now() - stamp.current;
      setMs(acc.current);
      window.clearInterval(id);
    };
  }, [running]);

  function reset() {
    acc.current = 0;
    stamp.current = performance.now();
    setMs(0);
  }

  return { ms, reset };
}
