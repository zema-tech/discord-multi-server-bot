/** cn(): concatena classi, ignorando falsy (mini-clsx, zero dipendenze). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
