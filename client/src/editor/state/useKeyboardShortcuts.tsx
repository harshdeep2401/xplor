import { useEffect } from "react";

interface ShortcutOptions {
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;

  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onMoveObject?: (
    direction: "up" | "down" | "left" | "right",
    e: KeyboardEvent,
  ) => void;
}

export function useKeyboardShortcuts({
  onUndo,
  onRedo,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  onMoveObject,
}: ShortcutOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isCtrlOrCmd && key === "z") {
        e.preventDefault();
        onUndo();
      }

      if (isCtrlOrCmd && key === "y") {
        e.preventDefault();
        onRedo();
      }

      if (isCtrlOrCmd && key === "c" && onCopy) {
        e.preventDefault();
        onCopy();
      }

      if (isCtrlOrCmd && key === "x" && onCut) {
        e.preventDefault();
        onCut();
      }

      if (isCtrlOrCmd && key === "v" && onPaste) {
        e.preventDefault();
        onPaste();
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDelete();
      }

      if (onMoveObject) {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onMoveObject("up", e);
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onMoveObject("down", e);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onMoveObject("left", e);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onMoveObject("right", e);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onUndo, onRedo, onDelete, onCopy, onCut, onPaste, onMoveObject]);
}
