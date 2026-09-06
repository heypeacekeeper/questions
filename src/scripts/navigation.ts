/**
 * Header navigation behaviour: mobile menu, categories dropdown, Escape and
 * outside-click handling. Idempotent; safe to call once per page load.
 */
export function initNavigation(): void {
  const menuButton = document.getElementById('menu-button');
  const navLinks = document.getElementById('nav-links');
  const navScrim = document.getElementById('nav-scrim');
  const categoryButton = document.getElementById('category-button');
  const categoryMenu = document.getElementById('category-menu');
  if (!menuButton || !navLinks || !navScrim || !categoryButton || !categoryMenu) return;
  if (menuButton.dataset.ready === '1') return;
  menuButton.dataset.ready = '1';

  const menuOpen = () => navLinks.classList.contains('open');
  const categoriesOpen = () => categoryButton.getAttribute('aria-expanded') === 'true';

  const openCategories = () => {
    categoryMenu.hidden = false;
    categoryButton.setAttribute('aria-expanded', 'true');
  };
  const closeCategories = () => {
    categoryMenu.hidden = true;
    categoryButton.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    navLinks.classList.add('open');
    navScrim.classList.add('open');
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Close menu');
  };
  const closeMenu = () => {
    navLinks.classList.remove('open');
    navScrim.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open menu');
    closeCategories();
  };

  menuButton.addEventListener('click', () => (menuOpen() ? closeMenu() : openMenu()));
  navScrim.addEventListener('click', closeMenu);

  categoryButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (categoriesOpen()) closeCategories();
    else {
      openCategories();
      // Move focus into the menu for keyboard users.
      const first = categoryMenu.querySelector<HTMLAnchorElement>('a');
      if (event.detail === 0) first?.focus();
    }
  });

  categoryMenu.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) {
      closeCategories();
      if (menuOpen()) closeMenu();
    }
  });

  navLinks.addEventListener('click', (event) => {
    const t = event.target as Element;
    if (t.closest('.nav-link') || t.closest('.submit-link')) closeMenu();
  });

  document.addEventListener('click', (event) => {
    const t = event.target as Node;
    if (categoriesOpen() && !categoryMenu.contains(t) && !categoryButton.contains(t)) closeCategories();
  });

  // Close dropdown when focus leaves it (keyboard tabbing away).
  categoryMenu.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (next && !categoryMenu.contains(next) && next !== categoryButton) closeCategories();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (categoriesOpen()) {
      closeCategories();
      categoryButton.focus();
      return;
    }
    if (menuOpen()) {
      closeMenu();
      menuButton.focus();
    }
  });

  // Reset state if the viewport crosses the mobile breakpoint.
  const mq = window.matchMedia('(max-width: 800px)');
  mq.addEventListener('change', () => {
    if (!mq.matches) closeMenu();
  });
}
