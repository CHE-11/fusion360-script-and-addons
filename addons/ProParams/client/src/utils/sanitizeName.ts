export function sanitizeName(name: string) {
  let s = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^\d/.test(s)) s = '_' + s;
  return s;
}
