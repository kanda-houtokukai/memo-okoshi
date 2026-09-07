"use client";

// トースト（モックv6の toast() と同じ見た目・2.6秒で消える）

import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 2600);
  }, []);
  return { toast, msg, on };
}

export function Toast({ msg, on }: { msg: string; on: boolean }) {
  return <div className={"toast" + (on ? " on" : "")}>{msg}</div>;
}
