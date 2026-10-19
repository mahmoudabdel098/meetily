import { useEffect, useState } from 'react';
import { isLocalOnlyBuild } from '@/lib/portable';

/** True in local-only (fully offline) builds: no cloud providers, no model downloads. */
export function useLocalOnly(): boolean {
  const [localOnly, setLocalOnly] = useState(false);
  useEffect(() => {
    isLocalOnlyBuild().then(setLocalOnly);
  }, []);
  return localOnly;
}

export const OFFLINE_MODELS_NOTE =
  'Versione offline: sono disponibili solo i modelli inclusi. Il download di altri modelli è disattivato.';
