import { type Request, type Response, type NextFunction } from "express";

/**
 * Middleware to inject Vercel Analytics script into HTML responses
 * This enables web analytics tracking for any HTML pages served by the API
 */
export function injectAnalytics(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const originalSend = res.send;

  res.send = function (data: unknown): Response {
    // Only inject analytics if the response is HTML
    const contentType = res.get("Content-Type");
    if (
      contentType &&
      contentType.includes("text/html") &&
      typeof data === "string"
    ) {
      // Inject the Vercel Analytics script before </body>
      const analyticsScript = `
<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>`;

      // Inject the script before the closing body tag
      if (data.includes("</body>")) {
        data = data.replace("</body>", `${analyticsScript}\n</body>`);
      } else if (data.includes("</html>")) {
        // Fallback: inject before closing html tag if no body tag exists
        data = data.replace("</html>", `${analyticsScript}\n</html>`);
      }
    }

    return originalSend.call(this, data);
  };

  next();
}
