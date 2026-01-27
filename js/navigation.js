/* ==========================================================================
   Navigation Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  
  // Scroll behavior for sticky nav
  let lastScroll = 0;
  
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    // Add scrolled class for background change
    if (currentScroll > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    
    lastScroll = currentScroll;
  });
  
  // Mobile menu toggle
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('active');
      navLinks.classList.toggle('active');
      
      // Prevent body scroll when menu is open
      document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
    });
    
    // Close menu when clicking a link
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navLinks.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }
  
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      // Skip if it's just "#"
      if (href === '#') return;
      
      const target = document.querySelector(href);
      
      if (target) {
        e.preventDefault();
        
        const navHeight = nav ? nav.offsetHeight : 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
});
