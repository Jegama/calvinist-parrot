const REDOC_VERSION = "2.5.2";
const REDOC_URL = `https://cdn.jsdelivr.net/npm/redoc@${REDOC_VERSION}/bundles/redoc.standalone.js`;
const REDOC_INTEGRITY =
  "sha384-70P5pmIdaQdVbxvjhrcTDv1uKcKqalZ3OHi7S2J+uzDl0PW8dO6L+pHOpm9EEjGJ";

export function GET() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Calvinist Parrot API Reference</title>
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url="/api/v1/openapi.json"></redoc>
    <script src="${REDOC_URL}" integrity="${REDOC_INTEGRITY}" crossorigin="anonymous"></script>
  </body>
</html>
`;

  return new Response(html, {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Security-Policy":
        "default-src 'none'; connect-src 'self'; font-src data:; img-src data: https:; script-src https://cdn.jsdelivr.net; style-src 'unsafe-inline'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
