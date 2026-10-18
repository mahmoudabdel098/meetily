import { invoke } from '@tauri-apps/api/core';

/**
 * Portable mode support.
 *
 * When the app runs in portable mode (a `portable.txt` file next to the
 * executable), settings stores must live in the portable data folder instead
 * of the system app data directory. The plugin store accepts absolute paths,
 * so in portable mode every store name is turned into an absolute path.
 */

let portableDataDirPromise: Promise<string | null> | null = null;

function getPortableDataDir(): Promise<string | null> {
  if (!portableDataDirPromise) {
    portableDataDirPromise = invoke<string | null>('get_portable_data_dir').catch(() => null);
  }
  return portableDataDirPromise;
}

let localOnlyPromise: Promise<boolean> | null = null;

/**
 * True for builds compiled with the `local-only` feature: meeting content and
 * usage data never leave the PC, so cloud providers and analytics are disabled.
 */
export function isLocalOnlyBuild(): Promise<boolean> {
  if (!localOnlyPromise) {
    localOnlyPromise = invoke<boolean>('is_local_only_build').catch(() => false);
  }
  return localOnlyPromise;
}

export async function isPortableMode(): Promise<boolean> {
  return (await getPortableDataDir()) !== null;
}

/** Path to pass to `load()` / `Store.load()` from `@tauri-apps/plugin-store`. */
export async function storePath(fileName: string): Promise<string> {
  const dataDir = await getPortableDataDir();
  if (!dataDir) {
    return fileName;
  }
  const separator = dataDir.includes('\\') ? '\\' : '/';
  return `${dataDir}${separator}${fileName}`;
}
