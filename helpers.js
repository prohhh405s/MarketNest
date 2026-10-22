/* MarketNest helpers: small pure functions (no DOM, no network) so they can be tested in Node too. */
(function (root) {
  "use strict";
  var MAX_IMAGE_BYTES = 2097152; // exactly 2 MiB (2 x 1024 x 1024)
  var ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
  var EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  var SAFE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function formatMoney(n) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n) || 0);
  }
  function validateEmail(email) {
    return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  // Returns an error message string, or "" if the password is acceptable.
  function validatePassword(pw) {
    if (typeof pw !== "string" || pw.length < 8) return "Password must be at least 8 characters.";
    if (pw.length > 72) return "Password must be 72 characters or fewer.";
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must include at least one letter and one number.";
    return "";
  }
  // Quick checks from the browser's own file info. NOT trusted alone: see detectImageType and the server limits.
  function validateImageBasics(file) {
    if (!file) return "";
    if (ALLOWED_MIME.indexOf(file.type) === -1) return "Unsupported file type. Please choose a JPEG, PNG or WebP image.";
    if (file.size === 0) return "That file is empty.";
    if (file.size > MAX_IMAGE_BYTES) return "That image is too large. The maximum size is 2 MB (2,097,152 bytes).";
    return "";
  }
  // Looks at the first bytes of the file ("magic numbers") to confirm it is really JPEG/PNG/WebP.
  function sniffImageType(bytes) {
    var b = bytes;
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    return null;
  }
  function detectImageType(file) {
    return file.slice(0, 16).arrayBuffer().then(function (buf) { return sniffImageType(new Uint8Array(buf)); });
  }
  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    var a = new Uint8Array(16); root.crypto.getRandomValues(a);
    a[6] = (a[6] & 15) | 64; a[8] = (a[8] & 63) | 128;
    var h = Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  // <user-id>/<unique-name>.<ext>: the user id MUST be the first folder (Storage policy checks it).
  function buildStoragePath(userId, mime) {
    return userId + "/" + uuid() + "." + EXT_BY_MIME[mime];
  }
  function isSafeImagePath(p) { return typeof p === "string" && SAFE_PATH.test(p); }
  // Reads #error=...&type=recovery etc. from a URL hash. Never returns or logs tokens.
  function parseAuthHash(hash) {
    var p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    return {
      type: p.get("type") || "",
      error: p.get("error") || "",
      errorCode: p.get("error_code") || "",
      errorDescription: p.get("error_description") || "",
      hasTokens: p.has("access_token")
    };
  }
  var api = { MAX_IMAGE_BYTES: MAX_IMAGE_BYTES, ALLOWED_MIME: ALLOWED_MIME, escapeHtml: escapeHtml, formatMoney: formatMoney,
    validateEmail: validateEmail, validatePassword: validatePassword, validateImageBasics: validateImageBasics,
    sniffImageType: sniffImageType, detectImageType: detectImageType, buildStoragePath: buildStoragePath,
    isSafeImagePath: isSafeImagePath, parseAuthHash: parseAuthHash };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MNHelpers = api;
})(typeof window !== "undefined" ? window : globalThis);
