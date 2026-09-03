// GitHub Pages serves this repo at https://Wub796.github.io/research/, so the
// app must be a static export and every asset URL must lead with /research.
// Keep this in sync with BASE_PATH in src/lib/paths.ts.
const basePath = '/research';

const nextConfig = {
  output: 'export',
  basePath,
  turbopack: {},
  eslint: {
    ignoreDuringBuilds: true, // ← add this
  },
  transpilePackages: ['resium'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'cesium', 'resium'];
    } else {
      // Cesium is loaded by the page before the client bundle mounts. Keep the
      // external global explicit so the bundle never evaluates `Cesium` as an
      // undeclared lexical reference during module initialization.
      config.externals = [...(config.externals || []), { cesium: 'window.Cesium' }];
    }

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      url: false,
    };

    return config;
  },
};

export default nextConfig;
