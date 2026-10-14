/** Copy text to the clipboard, stripping ProParams `{{ }}` delimiters. */
export async function copyToClipboard(text: string): Promise<boolean> {
  const cleaned = text.replace(/{{/g, '').replace(/}}/g, '');

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(cleaned);
      return true;
    }
  } catch {
    // fall through to legacy copy
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = cleaned;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
