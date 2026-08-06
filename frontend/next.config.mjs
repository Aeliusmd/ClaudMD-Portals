/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Legacy short employer prefix → unified employerportal URLs
      {
        source: "/employer",
        destination: "/employerportal/dashboard",
        permanent: false,
      },
      {
        source: "/employer/:path*",
        destination: "/employerportal/:path*",
        permanent: false,
      },
      {
        source: "/authentication/login",
        destination: "/employerportal/authentication/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
