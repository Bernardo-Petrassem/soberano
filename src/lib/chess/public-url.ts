import { previewPathPrefix } from "@/lib/preview-path-prefix";

/** Static files keep the preview prefix when the host serves the app under /hds-… */
export function publicUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
  return `${prefix ?? ""}${path}`;
}
