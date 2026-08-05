/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Legacy short prefixes → unified *portal URLs
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
        source: "/patient",
        destination: "/patientportal/dashboard",
        permanent: false,
      },
      {
        source: "/patient/:path*",
        destination: "/patientportal/:path*",
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
