/** Deployment root — MUST mirror `basePath` in next.config.mjs. GitHub Pages
 *  serves this repository at https://Wub796.github.io/research/, so every
 *  runtime URL (fetch, <script>, <link>, <img>, <audio>, font url()) has to
 *  lead with the subpath or it 404s against the site root. */
export const BASE_PATH = '/research';

/** Prefix an absolute public URL (e.g. '/figures/x.png') with the deployment
 *  root so it resolves under the GitHub Pages subpath. */
export const pub = (p: string): string => `${BASE_PATH}${p}`;
