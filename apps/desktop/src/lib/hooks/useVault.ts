import { useState, useCallback, useEffect } from "react";
import { storage } from "../storage";

export interface UseVaultReturn {
  /** Whether the vault is currently unlocked and ready for reads/writes. */
  isUnlocked: boolean;
  /** Filesystem path of the open vault (null when no vault is active). */
  vaultPath: string | null;
  /** True while the initial unlock-check is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation. */
  error: string | null;
  /** Create a brand-new vault, returning the recovery key. */
  createVault: (path: string, password: string) => Promise<string | null>;
  /** Open an existing vault with a password. */
  openVault: (path: string, password: string) => Promise<boolean>;
  /** Lock the currently-open vault. */
  lockVault: () => Promise<void>;
}

/**
 * React hook that exposes vault lifecycle operations and keeps track of the
 * current lock/unlock state.
 */
export function useVault(): UseVaultReturn {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, check whether the backend already has an unlocked vault (e.g.
  // when the window is re-created while the app is still running).
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const unlocked = await storage.isUnlocked();
        if (!cancelled) {
          setIsUnlocked(unlocked);
        }
      } catch {
        // Backend not ready yet — treat as locked.
        if (!cancelled) {
          setIsUnlocked(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const createVault = useCallback(
    async (path: string, password: string): Promise<string | null> => {
      setError(null);
      setLoading(true);
      try {
        const { recovery_key } = await storage.createVault(path, password);
        setIsUnlocked(true);
        setVaultPath(path);
        return recovery_key;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create vault";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const openVault = useCallback(
    async (path: string, password: string): Promise<boolean> => {
      setError(null);
      setLoading(true);
      try {
        const ok = await storage.openVault(path, password);
        if (ok) {
          setIsUnlocked(true);
          setVaultPath(path);
        } else {
          setError("Incorrect password or corrupted vault");
        }
        return ok;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to open vault";
        setError(message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const lockVault = useCallback(async () => {
    setError(null);
    try {
      await storage.lockVault();
      setIsUnlocked(false);
      setVaultPath(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to lock vault";
      setError(message);
    }
  }, []);

  return { isUnlocked, vaultPath, loading, error, createVault, openVault, lockVault };
}
