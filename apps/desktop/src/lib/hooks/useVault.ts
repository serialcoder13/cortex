import { useState, useCallback, useEffect } from "react";
import { useSettingsStore } from "@cortex/store";
import { storage } from "../storage";

export interface UseVaultReturn {
  /** Whether the vault is currently unlocked and ready for reads/writes. */
  isUnlocked: boolean;
  /** Filesystem path of the open vault (null when no vault is active). */
  vaultPath: string | null;
  /** Last used vault path from settings (for pre-filling the form). */
  lastVaultPath: string | null;
  /** True while the initial unlock-check is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation. */
  error: string | null;
  /** Create a brand-new vault, returning the recovery key. Does NOT unlock — call completeCreation after. */
  createVault: (path: string, password: string) => Promise<string | null>;
  /** Mark the vault as unlocked after the user has acknowledged the recovery key. */
  completeCreation: () => void;
  /** Open an existing vault with a password. */
  openVault: (path: string, password: string) => Promise<boolean>;
  /** Open an existing vault with a recovery key. */
  openVaultWithRecovery: (path: string, recoveryKey: string) => Promise<boolean>;
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

  const lastVaultPath = useSettingsStore((s) => s.vaultPath);
  const persistVaultPath = useSettingsStore((s) => s.setVaultPath);

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
        // Don't set isUnlocked yet — the caller must show the recovery key
        // first and then call openVault (or completeCreation) to unlock.
        setVaultPath(path);
        persistVaultPath(path);
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
    [persistVaultPath],
  );

  /** Mark vault as unlocked after the recovery key has been acknowledged. */
  const completeCreation = useCallback(() => {
    setIsUnlocked(true);
  }, []);

  const openVault = useCallback(
    async (path: string, password: string): Promise<boolean> => {
      setError(null);
      setLoading(true);
      try {
        const ok = await storage.openVault(path, password);
        if (ok) {
          setIsUnlocked(true);
          setVaultPath(path);
          persistVaultPath(path);
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
    [persistVaultPath],
  );

  const openVaultWithRecovery = useCallback(
    async (path: string, recoveryKey: string): Promise<boolean> => {
      setError(null);
      setLoading(true);
      try {
        const ok = await storage.openVaultWithRecovery(path, recoveryKey);
        if (ok) {
          // Do NOT set isUnlocked — the caller must show the password reset
          // screen first, then call completeCreation to unlock.
          setVaultPath(path);
          persistVaultPath(path);
        } else {
          setError("Invalid recovery key or corrupted vault");
        }
        return ok;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to open vault with recovery key";
        setError(message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [persistVaultPath],
  );

  const lockVault = useCallback(async () => {
    setError(null);
    try {
      await storage.lockVault();
      setIsUnlocked(false);
      setVaultPath(null);
      // Don't clear persistedVaultPath — we want to remember it for next open
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to lock vault";
      setError(message);
    }
  }, []);

  return { isUnlocked, vaultPath, lastVaultPath, loading, error, createVault, completeCreation, openVault, openVaultWithRecovery, lockVault };
}
