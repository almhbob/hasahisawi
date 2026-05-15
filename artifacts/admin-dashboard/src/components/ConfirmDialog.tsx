import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const [resolver, setResolver] = useState<Resolver | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => setResolver(() => resolve));
  }, []);

  const finish = (value: boolean) => {
    resolver?.(value);
    setResolver(null);
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => !o && finish(false)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title ?? "تأكيد"}</AlertDialogTitle>
            {opts.description && (
              <AlertDialogDescription className="whitespace-pre-line">
                {opts.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>
              {opts.cancelText ?? "إلغاء"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finish(true)}
              className={opts.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {opts.confirmText ?? "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
