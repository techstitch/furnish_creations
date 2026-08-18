// Photo/video storage backed by the site's own web hosting.
//
// Uploads POST to api/upload.php, which writes them into Assets/uploads/ on the same
// server that serves the site. A photo is therefore live the moment the upload
// finishes — there is no publish step to wait for and no third-party host involved.
//
// Authorisation is the admin's session cookie, the same as every other admin endpoint.
// Published photos are plain "Assets/uploads/…" paths, so the public site needs no
// credential of any kind to display them.

import { apiFetch } from "./api.js";
import { csrfHeader } from "./auth.js";

const ENDPOINT = "../api/upload.php";

/* ---------------- image compression ---------------- */

const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.82;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

// Phone photos are frequently 4-6 MB, which would fill the hosting quota and slow the
// site. Anything oversized is redrawn to a sane width and re-encoded; formats that must
// stay byte-exact (GIF) are passed through untouched.
async function compressImage(file) {
  if (!file.type.startsWith("image/") || /gif/i.test(file.type)) return { blob: file, ext: null };

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // iPhone photos are often HEIC, which most browsers can't decode and none display.
    // Uploading one would put a permanently broken image on the site, so stop here.
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      throw new Error(
        `"${file.name}" is an iPhone HEIC photo, which browsers can't show. Re-save or export it as JPEG and upload again.`
      );
    }
    return { blob: file, ext: null };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 400 * 1024) {
    bitmap.close?.();
    return { blob: file, ext: null };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  // Never let "optimisation" make a file bigger than the original.
  if (!blob || blob.size >= file.size) return { blob: file, ext: null };
  return { blob, ext: "jpg" };
}

// The server names the stored file, but it takes the extension from what we send, so a
// re-encoded photo must arrive as .jpg rather than keeping its original .png name.
function outgoingName(file, ext) {
  return ext ? file.name.replace(/\.[^.]+$/, "") + "." + ext : file.name;
}

/* ---------------- public API ---------------- */

export async function uploadMedia(file, onProgress) {
  if (file.type.startsWith("video/") && file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `Video is ${(file.size / 1024 / 1024).toFixed(0)} MB. Please keep videos under 25 MB.`
    );
  }

  onProgress?.(5);
  const { blob, ext } = await compressImage(file);
  onProgress?.(20);

  const form = new FormData();
  form.append("file", blob, outgoingName(file, ext));

  // XHR rather than apiFetch: it reports upload progress, and on a phone connection a
  // multi-MB photo otherwise sits at "20%" for the whole transfer.
  const body = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ENDPOINT);
    xhr.withCredentials = true; // send the session cookie
    for (const [k, v] of Object.entries(csrfHeader())) xhr.setRequestHeader(k, v);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress?.(20 + Math.round((e.loaded / e.total) * 75));
    });
    xhr.addEventListener("load", () => {
      let parsed = null;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        /* server returned something that was not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && parsed?.ok) return resolve(parsed);
      reject(new Error(parsed?.error || `The server returned ${xhr.status}.`));
    });
    xhr.addEventListener("error", () =>
      reject(new Error("Connection lost during upload — please try again."))
    );
    xhr.send(form);
  });

  onProgress?.(100);
  return { url: body.path, storagePath: body.path };
}

export async function deleteMedia(storagePath) {
  if (!storagePath || !storagePath.startsWith("Assets/uploads/")) return; // never touch original Assets/
  const form = new FormData();
  form.append("action", "delete");
  form.append("path", storagePath);
  await apiFetch("upload.php", { method: "POST", body: form });
}

export async function listMedia() {
  const body = await apiFetch("upload.php?action=list");
  return (body.files || []).map((f) => ({
    name: f.name,
    storagePath: f.path,
    url: f.path,
  }));
}
