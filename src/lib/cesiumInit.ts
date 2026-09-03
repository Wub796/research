// This file must be imported before any cesium/resium imports
import { pub } from "./paths";

if (typeof window !== 'undefined') {
    // Cesium reads this global lazily for every internal asset fetch (skybox
    // textures, terrain heights, IAU tables, credits), so it must lead with
    // the GitHub Pages subpath or every request 404s against the site root.
    (window as unknown as Record<string, unknown>).CESIUM_BASE_URL = pub('/cesium');
}
