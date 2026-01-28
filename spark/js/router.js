// ==========================================================================
// Simple Router for Spark SPA
// ==========================================================================

class SparkRouter {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
    }

    /**
     * Register a route
     */
    on(path, handler) {
        this.routes[path] = handler;
        return this;
    }

    /**
     * Navigate to a path
     */
    navigate(path) {
        history.pushState(null, '', path);
        this.handleRoute();
    }

    /**
     * Handle current route
     */
    handleRoute() {
        const path = window.location.pathname;
        const hash = window.location.hash;

        // Check for hash-based routing (for simpler hosting)
        if (hash) {
            const hashPath = hash.replace('#', '');
            this.executeRoute(hashPath);
            return;
        }

        // Extract route from path
        let route = path.replace('/spark', '').replace('/spark/', '') || '/';
        if (!route.startsWith('/')) route = '/' + route;

        this.executeRoute(route);
    }

    /**
     * Execute route handler
     */
    executeRoute(route) {
        this.currentRoute = route;

        // Check for exact match
        if (this.routes[route]) {
            this.routes[route]();
            return;
        }

        // Check for parameterized routes
        for (const [pattern, handler] of Object.entries(this.routes)) {
            const params = this.matchRoute(pattern, route);
            if (params) {
                handler(params);
                return;
            }
        }

        // 404 - redirect to dashboard
        console.log('Route not found:', route);
        this.navigate('/spark/new');
    }

    /**
     * Match parameterized route
     */
    matchRoute(pattern, route) {
        // Convert pattern like /brief/:id to regex
        const paramNames = [];
        const regexPattern = pattern.replace(/:([^/]+)/g, (_, paramName) => {
            paramNames.push(paramName);
            return '([^/]+)';
        });

        const regex = new RegExp(`^${regexPattern}$`);
        const match = route.match(regex);

        if (match) {
            const params = {};
            paramNames.forEach((name, i) => {
                params[name] = match[i + 1];
            });
            return params;
        }

        return null;
    }

    /**
     * Initialize router
     */
    init() {
        // Handle browser back/forward
        window.addEventListener('popstate', () => this.handleRoute());

        // Check for stored route from redirect (e.g., /spark/new)
        const storedRoute = sessionStorage.getItem('sparkRoute');
        if (storedRoute) {
            sessionStorage.removeItem('sparkRoute');
            this.navigate(storedRoute);
            return;
        }

        // Handle initial route
        this.handleRoute();
    }
}

// Create global instance
window.sparkRouter = new SparkRouter();
