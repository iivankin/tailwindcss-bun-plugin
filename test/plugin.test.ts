import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tempDirs: string[] = [];
const fixtureDir = path.join(import.meta.dir, "fixtures", "basic");
const pluginEntryUrl = pathToFileURL(
  path.join(process.cwd(), "src", "index.ts")
).href;

async function createOutdir() {
  const outdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "bun-tailwind-plugin-build-")
  );
  tempDirs.push(outdir);
  return outdir;
}

afterAll(async () => {
  await Promise.all(
    tempDirs.map((tempDir) => fs.rm(tempDir, { recursive: true, force: true }))
  );
});

describe("tailwindcss bun plugin", () => {
  test("generates utilities discovered from the Bun module graph", async () => {
    const outdir = await createOutdir();

    const script = `
      import path from "node:path";
      import tailwindcss from ${JSON.stringify(pluginEntryUrl)};

      const fixtureDir = ${JSON.stringify(fixtureDir)};
      const outdir = ${JSON.stringify(outdir)};
      const build = await Bun.build({
        entrypoints: [path.join(fixtureDir, "src", "entry.tsx")],
        outdir,
        root: fixtureDir,
        plugins: [tailwindcss],
        sourcemap: "none",
      });

      if (!build.success) {
        console.error(JSON.stringify(build.logs, null, 2));
        process.exit(1);
      }

      const cssOutput = build.outputs.find((output) => output.path.endsWith(".css"));
      if (!cssOutput) {
        console.error("Missing CSS output");
        process.exit(1);
      }

      process.stdout.write(await cssOutput.text());
    `;

    const processResult = Bun.spawnSync(["bun", "--eval", script], {
      cwd: process.cwd(),
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(processResult.exitCode).toBe(0);

    const stderr = new TextDecoder().decode(processResult.stderr).trim();
    expect(stderr).toBe("");

    const css = new TextDecoder().decode(processResult.stdout);
    expect(css).toContain(".text-red-500");
  });
});
