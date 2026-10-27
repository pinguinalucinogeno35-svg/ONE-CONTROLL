// Validação de arquivo por conteúdo real (assinatura/magic bytes), não só extensão.
export const ALLOWED_FILES: Record<string, { mime: string; check: (b: Uint8Array) => boolean }> = {
  pdf: { mime: "application/pdf", check: (b) => ascii(b, 0, 5) === "%PDF-" },
  png: { mime: "image/png", check: (b) => b[0] === 0x89 && ascii(b, 1, 3) === "PNG" },
  jpg: { mime: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mime: "image/webp", check: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", check: isZip },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", check: isZip },
  csv: { mime: "text/csv", check: (b) => !b.subarray(0, 4096).includes(0) },
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function ascii(b: Uint8Array, start: number, len: number) {
  return String.fromCharCode(...b.subarray(start, start + len));
}
function isZip(b: Uint8Array) {
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

export function detectFile(filename: string, bytes: Uint8Array): { ext: string; mime: string } | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const spec = ALLOWED_FILES[ext];
  if (!spec || !spec.check(bytes)) return null;
  return { ext: ext === "jpeg" ? "jpg" : ext, mime: spec.mime };
}

/** Nome exibido seguro (sem caminhos ou caracteres de controle). */
export function safeFilename(name: string): string {
  return name.replace(/[/\\\u0000-\u001f\u007f]/g, "_").replace(/\.{2,}/g, ".").slice(0, 200) || "arquivo";
}
