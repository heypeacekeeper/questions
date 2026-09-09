(() => {
  function initNavigation() {
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
      document.body.classList.add('menu-open');
      menuButton.setAttribute('aria-expanded', 'true');
      menuButton.setAttribute('aria-label', 'Close menu');
    };
    const closeMenu = () => {
      navLinks.classList.remove('open');
      navScrim.classList.remove('open');
      document.body.classList.remove('menu-open');
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
        if (event.detail === 0) categoryMenu.querySelector('a')?.focus();
      }
    });
    categoryMenu.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
    navLinks.addEventListener('click', (event) => {
      if (event.target.closest('.nav-link') || event.target.closest('.submit-link')) closeMenu();
    });
    document.addEventListener('click', (event) => {
      if (categoriesOpen() && !categoryMenu.contains(event.target) && !categoryButton.contains(event.target)) {
        closeCategories();
      }
    });
    categoryMenu.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;
      if (next && !categoryMenu.contains(next) && next !== categoryButton) closeCategories();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (menuOpen()) {
        closeMenu();
        menuButton.focus();
      } else if (categoriesOpen()) {
        closeCategories();
        categoryButton.focus();
      }
    });
    window.matchMedia('(max-width: 800px)').addEventListener('change', (event) => {
      if (!event.matches) closeMenu();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation, { once: true });
  } else {
    initNavigation();
  }
})();
