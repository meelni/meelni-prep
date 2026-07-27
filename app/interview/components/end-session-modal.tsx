"use client";

import { useRef, type RefObject } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, MotionConfig } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface EndSessionModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  error?: string | null;
  capturedAnswerCount?: number;
  onClose: () => void;
  onConfirm: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function EndSessionModal({
  isOpen,
  isLoading = false,
  error,
  capturedAnswerCount = 0,
  onClose,
  onConfirm,
  returnFocusRef,
}: EndSessionModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <MotionConfig reducedMotion="user">
      <DialogPrimitive.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && !isLoading) onClose();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay asChild>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-overlay/50 fixed inset-0 z-50 backdrop-blur-sm"
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content
            asChild
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelButtonRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              if (!returnFocusRef?.current) return;
              event.preventDefault();
              returnFocusRef.current.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (isLoading) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (isLoading) event.preventDefault();
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background border-border fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6"
            >
              <div className="mb-4 flex justify-center">
                <div className="bg-destructive/10 rounded-full p-3">
                  <AlertCircle
                    className="text-destructive h-8 w-8"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <DialogPrimitive.Title className="mb-2 text-center text-2xl font-bold">
                End interview?
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mb-6 text-center">
                Ending saves the transcript collected so far and closes this
                room.{" "}
                {capturedAnswerCount === 0
                  ? "No candidate answers are visible in the transcript yet."
                  : `${capturedAnswerCount} candidate ${
                      capturedAnswerCount === 1 ? "answer is" : "answers are"
                    } visible in the transcript.`}{" "}
                Feedback eligibility is checked after the room closes so an
                incomplete interview is never scored as complete.
              </DialogPrimitive.Description>

              {error && (
                <div
                  role="alert"
                  className="border-destructive/20 bg-destructive/5 text-destructive mb-6 rounded-lg border p-3 text-sm"
                >
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  ref={cancelButtonRef}
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                  className="min-h-11 w-full flex-1"
                >
                  Continue interview
                </Button>
                <Button
                  variant="destructive"
                  onClick={onConfirm}
                  disabled={isLoading}
                  className="min-h-11 w-full flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      Ending...
                    </>
                  ) : error ? (
                    "Try again"
                  ) : (
                    "End interview"
                  )}
                </Button>
              </div>
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </MotionConfig>
  );
}
