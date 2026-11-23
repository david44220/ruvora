import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ruvora — Social Promotion & Creator Economy",
    short_name: "Ruvora",
    description:
      "Turn your social presence into a transparent creator economy from follower #10. Ready-to-post links, QR story cards, and reviewed advertising campaigns.",
    start_url: "/app/promote",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0b0a09",
    theme_color: "#0b0a09",
    categories: ["social", "business", "marketing"],
    icons: [
      {
        src: "/assets/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Promote Studio",
        short_name: "Promote",
        url: "/app/promote",
        icons: [{ src: "/assets/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Explore Offers",
        short_name: "Explore",
        url: "/explore",
        icons: [{ src: "/assets/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Wallet",
        short_name: "Wallet",
        url: "/app/wallet",
        icons: [{ src: "/assets/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
