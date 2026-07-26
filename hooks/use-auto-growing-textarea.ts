"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
} from "react";

type AutoGrowingTextareaOptions = {
  minHeight: number;
  maxHeight: number;
  maxViewportRatio?: number;
  enabled?: boolean;
};

export function useAutoGrowingTextarea(
  value: string,
  {
    minHeight,
    maxHeight,
    maxViewportRatio = 0.6,
    enabled = true,
  }: AutoGrowingTextareaOptions,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(
    (textarea: HTMLTextAreaElement | null = textareaRef.current) => {
      if (!enabled || !textarea) return;

      const viewportHeight =
        typeof window === "undefined" ? maxHeight : window.innerHeight;
      const responsiveMaximum = Math.max(
        minHeight,
        Math.min(maxHeight, viewportHeight * maxViewportRatio),
      );

      textarea.style.height = "auto";
      const nextHeight = Math.min(
        Math.max(textarea.scrollHeight, minHeight),
        responsiveMaximum,
      );
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY =
        textarea.scrollHeight > responsiveMaximum ? "auto" : "hidden";
    },
    [enabled, maxHeight, maxViewportRatio, minHeight],
  );

  useEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, value]);

  useEffect(() => {
    const handleViewportChange = () => resizeTextarea();
    window.addEventListener("resize", handleViewportChange);
    return () => window.removeEventListener("resize", handleViewportChange);
  }, [resizeTextarea]);

  const handleInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      resizeTextarea(event.currentTarget);
    },
    [resizeTextarea],
  );

  return { textareaRef, handleInput };
}
