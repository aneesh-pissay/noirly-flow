import type { MetadataRoute } from "next";

/** Makes Flow installable: home screen, dock or start menu, in its own window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/inbox",
    name: "Noirly Flow",
    short_name: "Flow",
    description: "Task and project management for the Noirly ecosystem",
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    background_color: "#0B0B0C",
    theme_color: "#0B0B0C",
    categories: ["productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
