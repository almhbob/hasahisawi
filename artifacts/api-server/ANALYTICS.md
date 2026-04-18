# Vercel Web Analytics Setup

This API server has been configured with Vercel Web Analytics support.

## How It Works

The `@vercel/analytics` package has been installed and configured to automatically inject analytics tracking into any HTML responses served by this Express application.

### Middleware

The `injectAnalytics` middleware in `src/middlewares/analytics.ts` automatically:
- Detects HTML responses (by checking `Content-Type: text/html`)
- Injects the Vercel Analytics script before the closing `</body>` tag
- Falls back to injecting before `</html>` if no `</body>` tag is found

### Usage

The analytics tracking is automatically enabled for all HTML responses. No additional configuration is needed in individual routes.

If you serve HTML pages through this API server, they will automatically include analytics tracking when deployed to Vercel.

### Deployment

To enable analytics tracking in production:

1. Deploy this application to Vercel
2. Enable Web Analytics in your Vercel project dashboard
3. The analytics script will automatically be served from `/_vercel/insights/script.js`

### Local Development

During local development, the analytics script will be injected but won't send data unless you configure it to do so. This is by design to avoid polluting your production analytics with development data.

### Current Setup

This API server is primarily designed for API endpoints. The analytics middleware will only activate if you add routes that serve HTML content.

**Example use case:** If you add a route that serves an HTML landing page, dashboard, or documentation, those pages will automatically include analytics tracking.

## Documentation

For more information about Vercel Web Analytics, see:
- [Vercel Analytics Quickstart](https://vercel.com/docs/analytics/quickstart)
- [Advanced Analytics Configuration](https://vercel.com/docs/analytics/package)
