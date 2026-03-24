import { extname } from "node:path";

export function inferMediaType(filePath: string | undefined, explicit: string | undefined): string {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  const extension = extname(filePath ?? "").toLowerCase();
  switch (extension) {
    case ".md":
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
