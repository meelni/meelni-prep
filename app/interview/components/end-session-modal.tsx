"use client";

import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface EndSessionModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function EndSessionModal({
  isOpen,
  isLoading = false,
  error,
  onClose,
  onConfirm,
}: EndSessionModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
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
            className="bg-background border-border fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-2xl"
          >
            <div className="mb-4 flex justify-center">
              <div className="bg-warning/10 rounded-full p-3">
                <AlertCircle className="text-warning h-8 w-8" />
              </div>
            </div>

            <DialogPrimitive.Title className="mb-2 text-center text-2xl font-bold">
              End Interview?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-muted-foreground mb-6 text-center">
              Your progress will be saved. We&apos;ll prepare feedback when
              enough interview activity was captured.
            </DialogPrimitive.Description>

            {error && (
              <div
                role="alert"
                className="border-destructive/20 bg-destructive/5 text-destructive mb-6 rounded-lg border p-3 text-sm"
              >
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                ref={cancelButtonRef}
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                Continue Interview
              </Button>
              <Button
                variant="destructive"
                onClick={onConfirm}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ending...
                  </>
                ) : error ? (
                  "Try Again"
                ) : (
                  "End Interview"
                )}
              </Button>
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
