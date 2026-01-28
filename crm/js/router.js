// ==========================================================================
// CRM Router (Simple Hash-based)
// ==========================================================================

class CRMRouter {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
    }

    /**
     * Register a route
     */
    on(path, handler) {
        this.routes[path] = handler;
    }

    /**
     * Navigate to a route
     */
    navigate(path) {
        window.location.hash = path;
    }

    /**
     * Get current path from hash
     */
    getCurrentPath() {
        const hash = window.location.hash || '#/';
        return hash.slice(1) || '/';
    }

    /**
     * Start listening for route changes
     */
    start() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }

    /**
     * Handle current route
     */
    async handleRoute() {
        const path = this.getCurrentPath();

        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            const route = link.getAttribute('data-route');
            if (path === '/' && route === 'dashboard') {
                link.classList.add('active');
            } else if (path.startsWith('/contacts') && route === 'contacts') {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Find matching route
        let handler = null;
        let params = {};

        // Check for exact match first
        if (this.routes[path]) {
            handler = this.routes[path];
        } else {
            // Check for parameterized routes (e.g., /contact/:id)
            for (const route in this.routes) {
                const routeParts = route.split('/');
                const pathParts = path.split('/');

                if (routeParts.length !== pathParts.length) continue;

                let match = true;
                const extractedParams = {};

                for (let i = 0; i < routeParts.length; i++) {
                    if (routeParts[i].startsWith(':')) {
                        extractedParams[routeParts[i].slice(1)] = pathParts[i];
                    } else if (routeParts[i] !== pathParts[i]) {
                        match = false;
                        break;
                    }
                }

                if (match) {
                    handler = this.routes[route];
                    params = extractedParams;
                    break;
                }
            }
        }

        // Execute handler or 404
        if (handler) {
            this.currentRoute = path;
            await handler(params);
        } else {
            // Default to dashboard
            this.navigate('/');
        }
    }
}

// Create global instance
window.crmRouter = new CRMRouter();
