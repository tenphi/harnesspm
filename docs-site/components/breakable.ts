/**
 * Escapes text for `set:html` and lets long paths wrap after each `/`, so
 * `node_modules/.harnesspm/pkgs/…` breaks between folders on a phone, not
 * inside a name.
 */
export function breakable(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\//g, '/<wbr>');
}
