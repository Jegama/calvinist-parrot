"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";

type AutoGrowingTextareaOptions = {
  // Omit to use the textarea's responsive CSS minimum.
  minHeight?: number;
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
  const resizeFrameRef = useRef<number | null>(null);
  const cssMinimumRef = useRef<number | null>(null);

  const resizeTextarea = useCallback(
    (textarea: HTMLTextAreaElement | null = textareaRef.current) => {
      if (!enabled || !textarea) return;

      const viewportHeight =
        typeof window === "undefined" ? maxHeight : window.innerHeight;
      if (minHeight === undefined && cssMinimumRef.current === null) {
        cssMinimumRef.current = parseFloat(window.getComputedStyle(textarea).minHeight) || 0;
      }
      const minimum = minHeight ?? cssMinimumRef.current ?? 0;
      const responsiveMaximum = Math.max(
        minimum,
        Math.min(maxHeight, viewportHeight * maxViewportRatio),
      );

      textarea.style.height = "auto";
      const contentHeight = textarea.scrollHeight;
      const nextHeight = Math.min(
        Math.max(contentHeight, minimum),
        responsiveMaximum,
      );
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY =
        contentHeight > responsiveMaximum ? "auto" : "hidden";
    },
    [enabled, maxHeight, maxViewportRatio, minHeight],
  );

  const scheduleResize = useCallback(() => {
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      resizeTextarea();
    });
  }, [resizeTextarea]);

  useEffect(() => {
    scheduleResize();
  }, [scheduleResize, value]);

  useEffect(() => {
    // Breakpoint changes invalidate the CSS minimum; keystrokes only measure
    // content height and keep sharing the existing animation frame.
    const handleResize = () => {
      cssMinimumRef.current = null;
      scheduleResize();
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [scheduleResize]);

  // Input events and the controlled value effect share one measurement per frame.
  return { textareaRef, handleInput: scheduleResize };
}
