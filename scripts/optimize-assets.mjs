import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const masters = resolve(root, "assets", "masters");
const outputs = [];
async function encode(source, target, width) {
  await mkdir(dirname(target), { recursive: true });
  let pipeline = sharp(source);
  if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true });
  await pipeline.webp({ quality: 92, effort: 6 }).toFile(target);
  const metadata = await sharp(target).metadata();
  outputs.push({
    file: target.slice(root.length + 1).replaceAll("\\", "/"),
    width: metadata.width,
    height: metadata.height,
    bytes: (await stat(target)).size,
  });
}

for (const asset of [
  { name: "ruvora-flagship", folder: "hero", widths: [840, 1280] },
  { name: "ruvora-orb", folder: "orbs", widths: [640, 960] },
  { name: "ruvora-event", folder: "events", widths: [840, 1280] },
]) {
  const source = resolve(masters, asset.name + ".png");
  const destination = resolve(root, "public", "assets", asset.folder);
  await encode(source, resolve(destination, asset.name + ".webp"));
  for (const width of asset.widths)
    await encode(source, resolve(destination, `${asset.name}-${width}.webp`), width);
}

const sharePath = resolve(root, "public", "assets", "share", "ruvora-home.webp");
await mkdir(dirname(sharePath), { recursive: true });
await sharp(resolve(masters, "ruvora-flagship.png"))
  .resize(1200, 630, { fit: "cover", position: "centre" })
  .webp({ quality: 92, effort: 6 })
  .toFile(sharePath);
outputs.push({
  file: "public/assets/share/ruvora-home.webp",
  width: 1200,
  height: 630,
  bytes: (await stat(sharePath)).size,
});
console.log(JSON.stringify(outputs, null, 2));
