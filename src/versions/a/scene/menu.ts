/**
 * Compact-screen navigation menu. Without JS the links stay visible; with JS they collapse
 * behind the menu button (the `a-js` class switches the CSS over).
 */
export function initMenu(): void {
  document.documentElement.classList.add('a-js');
  const button = document.querySelector<HTMLButtonElement>('.a-menu-btn');
  const menu = document.getElementById('a-menu');
  if (!button || !menu) return;

  const set = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.classList.toggle('is-open', open);
  };
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';

  button.addEventListener('click', () => set(!isOpen()));
  menu.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      set(false);
      button.focus();
    }
  });
}
