import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findEvent: vi.fn(), isDevelopment: vi.fn(), getEntry: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { event: { findUnique: mocks.findEvent } } }));
vi.mock("@/server/environment", () => ({ isDevelopment: mocks.isDevelopment }));
vi.mock("@/server/attribution", () => ({ getEventEntry: mocks.getEntry }));
vi.mock("@/components/public-pages", () => ({ EventPage: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
import Event, { generateMetadata } from "../../src/app/events/[slug]/page";
const event = {
  slug: "private-launch",
  title: "Unannounced sponsor launch",
  description: "Private campaign announcement",
  state: "ACTIVE",
  visibility: "PUBLIC",
  isDemo: false,
  reviewReason: "Private operational review",
  reviewedById: "private-reviewer",
  approvedSnapshot: { internal: "private-snapshot" },
};
const context = () => ({ params: Promise.resolve({ slug: event.slug }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDevelopment.mockReturnValue(true);
  mocks.findEvent.mockResolvedValue({ ...event });
});
describe("Event metadata publication boundary", () => {
  it.each(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "CANCELLED"])(
    "does not disclose %s content in metadata or a public page",
    async (state) => {
      mocks.findEvent.mockResolvedValue({ ...event, state });
      const metadata = await generateMetadata(context());
      expect(metadata).toMatchObject({ title: "Ruvora", robots: { index: false, follow: false } });
      expect(metadata).not.toHaveProperty("description");
      expect(metadata).not.toHaveProperty("openGraph");
      expect(metadata).not.toHaveProperty("twitter");
      expect(JSON.stringify(metadata)).not.toContain(event.title);
      await expect(Event(context())).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mocks.getEntry).not.toHaveBeenCalled();
    },
  );
  it("handles missing records without publishing share metadata", async () => {
    mocks.findEvent.mockResolvedValue(null);
    const metadata = await generateMetadata(context());
    expect(metadata).not.toHaveProperty("openGraph");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    await expect(Event(context())).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("does not disclose development events outside development", async () => {
    mocks.isDevelopment.mockReturnValue(false);
    mocks.findEvent.mockResolvedValue({ ...event, isDemo: true });
    const metadata = await generateMetadata(context());
    expect(metadata.title).toBe("Ruvora");
    expect(metadata).not.toHaveProperty("description");
    expect(metadata).not.toHaveProperty("openGraph");
    await expect(Event(context())).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("marks a published unlisted event as non-indexable", async () => {
    mocks.findEvent.mockResolvedValue({ ...event, visibility: "UNLISTED" });
    const metadata = await generateMetadata(context());
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe(event.title);
  });
  it("keeps a published public non-demo event indexable outside development", async () => {
    mocks.isDevelopment.mockReturnValue(false);
    mocks.findEvent.mockResolvedValue({ ...event, visibility: "PUBLIC", isDemo: false });
    const metadata = await generateMetadata(context());
    expect(metadata.title).toBe(event.title);
    expect(metadata.description).toBe(event.description);
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates).toMatchObject({ canonical: "/events/private-launch" });
    expect(metadata.openGraph).toMatchObject({ title: event.title, url: "/events/private-launch" });
  });
  it("emits public share content without operational review fields", async () => {
    const metadata = await generateMetadata(context());
    expect(metadata.title).toBe(event.title);
    expect(metadata.description).toBe(event.description);
    expect(metadata.openGraph).toMatchObject({ title: event.title, url: "/events/private-launch" });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain(event.reviewReason);
    expect(serialized).not.toContain(event.reviewedById);
    expect(serialized).not.toContain("private-snapshot");
  });
});
