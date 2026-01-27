/* ==========================================================================
   Main Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --------------------------------------------------------------------------
    // Form Handling
    // --------------------------------------------------------------------------

    const contactForm = document.querySelector('#contact-form');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;

            // Show loading state
            submitButton.textContent = 'Sending...';
            submitButton.disabled = true;

            // Collect form data
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            try {
                // For now, log the data (replace with actual form submission)
                console.log('Form submitted:', data);

                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Show success message
                submitButton.textContent = 'Message Sent!';
                submitButton.style.background = 'var(--color-accent)';

                // Reset form
                contactForm.reset();

                // Reset button after delay
                setTimeout(() => {
                    submitButton.textContent = originalText;
                    submitButton.disabled = false;
                    submitButton.style.background = '';
                }, 3000);

            } catch (error) {
                console.error('Form submission error:', error);
                submitButton.textContent = 'Error - Try Again';
                submitButton.disabled = false;

                setTimeout(() => {
                    submitButton.textContent = originalText;
                }, 3000);
            }
        });
    }

    // --------------------------------------------------------------------------
    // External Link Handler
    // --------------------------------------------------------------------------

    document.querySelectorAll('a[href^="http"]').forEach(link => {
        // Don't modify links that already have target
        if (!link.hasAttribute('target')) {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        }
    });

    // --------------------------------------------------------------------------
    // Lazy Loading Images
    // --------------------------------------------------------------------------

    const lazyImages = document.querySelectorAll('img[data-src]');

    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px'
        });

        lazyImages.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for browsers without IntersectionObserver
        lazyImages.forEach(img => {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        });
    }

    // --------------------------------------------------------------------------
    // Keyboard Navigation Enhancement
    // --------------------------------------------------------------------------

    document.addEventListener('keydown', (e) => {
        // Escape key closes mobile menu
        if (e.key === 'Escape') {
            const navToggle = document.querySelector('.nav-toggle');
            const navLinks = document.querySelector('.nav-links');

            if (navLinks && navLinks.classList.contains('active')) {
                navToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    });

    // --------------------------------------------------------------------------
    // Analytics Helper (placeholder for future implementation)
    // --------------------------------------------------------------------------

    window.trackEvent = (category, action, label) => {
        // Placeholder for analytics tracking
        // Replace with actual analytics implementation (GA4, etc.)
        if (typeof gtag === 'function') {
            gtag('event', action, {
                'event_category': category,
                'event_label': label
            });
        }
        console.log('Track Event:', { category, action, label });
    };

    // Track CTA clicks
    document.querySelectorAll('.btn-primary').forEach(btn => {
        btn.addEventListener('click', () => {
            const label = btn.textContent.trim();
            window.trackEvent('CTA', 'click', label);
        });
    });
});
