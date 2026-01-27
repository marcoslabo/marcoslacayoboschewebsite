/* ==========================================================================
   Animations Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --------------------------------------------------------------------------
    // Fade-in on Scroll Animation
    // --------------------------------------------------------------------------

    const fadeElements = document.querySelectorAll('.fade-in');

    const fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Optionally unobserve after animation
                // fadeObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    fadeElements.forEach(el => fadeObserver.observe(el));

    // --------------------------------------------------------------------------
    // Count-up Animation for Stats
    // --------------------------------------------------------------------------

    const statNumbers = document.querySelectorAll('[data-count]');

    const countObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
                entry.target.classList.add('counted');
                animateCount(entry.target);
            }
        });
    }, {
        threshold: 0.5
    });

    statNumbers.forEach(el => countObserver.observe(el));

    function animateCount(element) {
        const target = parseFloat(element.dataset.count);
        const suffix = element.dataset.suffix || '';
        const prefix = element.dataset.prefix || '';
        const duration = 2000;
        const steps = 60;
        const stepDuration = duration / steps;

        let current = 0;
        const increment = target / steps;

        const timer = setInterval(() => {
            current += increment;

            if (current >= target) {
                current = target;
                clearInterval(timer);
            }

            // Format the number nicely
            let displayValue;
            if (target >= 1000) {
                displayValue = Math.floor(current).toLocaleString();
            } else if (Number.isInteger(target)) {
                displayValue = Math.floor(current);
            } else {
                displayValue = current.toFixed(1);
            }

            element.textContent = prefix + displayValue + suffix;
        }, stepDuration);
    }

    // --------------------------------------------------------------------------
    // Staggered Animation for Cards
    // --------------------------------------------------------------------------

    const cardGrids = document.querySelectorAll('.why-fail-grid, .how-work-grid, .nymbl-grid, .services-grid, .results-grid');

    cardGrids.forEach(grid => {
        const cards = grid.querySelectorAll('.card');

        const gridObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                cards.forEach((card, index) => {
                    setTimeout(() => {
                        card.classList.add('visible');
                    }, index * 100);
                });
                gridObserver.unobserve(grid);
            }
        }, {
            threshold: 0.2
        });

        // Add fade-in class to cards
        cards.forEach(card => {
            card.classList.add('fade-in');
        });

        gridObserver.observe(grid);
    });

    // --------------------------------------------------------------------------
    // Parallax Effect for Hero
    // --------------------------------------------------------------------------

    const heroVisual = document.querySelector('.hero-visual');

    if (heroVisual) {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const rate = scrolled * 0.3;

            if (scrolled < window.innerHeight) {
                heroVisual.style.transform = `translateY(${rate}px)`;
            }
        });
    }

    // --------------------------------------------------------------------------
    // Typing Effect for Hero Title (optional enhancement)
    // --------------------------------------------------------------------------

    // Disabled by default - uncomment to enable
    /*
    const heroTitle = document.querySelector('.hero-title');
    
    if (heroTitle && heroTitle.dataset.typed) {
      const text = heroTitle.dataset.typed;
      heroTitle.textContent = '';
      
      let i = 0;
      const typeWriter = () => {
        if (i < text.length) {
          heroTitle.textContent += text.charAt(i);
          i++;
          setTimeout(typeWriter, 50);
        }
      };
      
      setTimeout(typeWriter, 500);
    }
    */
});
