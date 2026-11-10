/**
 * jsdom's selector engine keeps the last focus event and the last matched
 * node for the life of the document. A focused row therefore retains its
 * whole ancestor list after unmount. Point both at the document so those
 * detached nodes can be collected.
 *
 * Test-only. Browsers do not keep that event after it finishes dispatching.
 */
export function releaseJsdomSelectorCache(): void {
  document.body?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  document.documentElement?.matches(':root');
}
