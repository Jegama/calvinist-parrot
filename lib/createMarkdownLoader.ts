import path from "node:path";
import { readFile } from "node:fs/promises";
import { cache } from "react";

/**
 * Returns a cached async reader for a markdown file located under the `content` directory.
 */
export function createMarkdownLoader(relativePath: string) {
  return cache(async () => {
    const filePath = path.join(process.cwd(), "content", relativePath);
    return readFile(filePath, "utf8");
  });
}
