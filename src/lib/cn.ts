/** Une clases de Tailwind de forma segura y tipada. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}