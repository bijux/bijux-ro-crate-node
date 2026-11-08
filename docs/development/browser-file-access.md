# Native browser file access

Browser qualification uses actual selected filesystem paths, including directory
uploads and reselecting the same files after editing a draft.

The locked Playwright WebKit implementation requests file read access from the
browser process and sends the upload request to the page process. Starting both
requests concurrently allows the upload to reach the page before access is
granted. The exact-version patch in `scripts/dependencies/patches/` waits for
permission before starting the upload and propagates a denied permission.

The private workspace applies the patch during installation. The published
crate packages contain no Playwright code. The regression invokes the installed
WebKit method with controlled protocol replies; it holds permission pending and
also rejects it. Both controls fail against the unpatched implementation. Actual
native uploads remain covered in Chromium, Firefox and WebKit.

Review the patch and its method boundary when changing Playwright. Preserve
native file and directory coverage in the browser qualification jobs.
