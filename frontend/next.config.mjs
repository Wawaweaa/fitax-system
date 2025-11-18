/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverExternalPackages: ['duckdb', '@mapbox/node-pre-gyp'],
    serverComponentsExternalPackages: ['duckdb', '@mapbox/node-pre-gyp'],
  },
  turbo: {
    enabled: false,
  },
  webpack: (config, { isServer }) => {
    // 添加.html文件处理
    config.module.rules.push({
      test: /\.html$/i,
      type: 'asset/source'
    });

    // 确保在服务器端正确处理duckdb
    if (isServer) {
      config.externals = [...(config.externals || [])];
      config.externals.push({ duckdb: 'commonjs duckdb' });
    }

    return config;
  }
}

export default nextConfig
