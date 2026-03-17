import fs from "node:fs/promises";
import path from "node:path";
import { getNativeTargetByTriple } from "../src/native-targets";

const ROOT_DIR = import.meta.dir
  ? path.resolve(import.meta.dir, "..")
  : process.cwd();
const BINARIES_DIR = path.join(ROOT_DIR, "binaries");
const RELEASE_DIR = path.join(ROOT_DIR, ".tmp-release");

function getArg(name: string) {
  const prefix = `${name}=`;
  return Bun.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function readRootPackageJson() {
  return JSON.parse(
    await Bun.file(path.join(ROOT_DIR, "package.json")).text()
  ) as {
    version: string;
    license?: string;
  };
}

const target = getArg("--target") ?? process.env.NAPI_BUILD_TARGET;

if (!target) {
  throw new Error("Expected --target=<triple> or NAPI_BUILD_TARGET");
}

const config = getNativeTargetByTriple(target);

if (!config) {
  throw new Error(`Unsupported target: ${target}`);
}

const rootPackage = await readRootPackageJson();
const packageDir = path.join(RELEASE_DIR, config.id);
const sourceBinary = path.join(BINARIES_DIR, config.filename);
const packageJson = {
  name: config.packageName,
  version: rootPackage.version,
  description: `This is the ${config.id} binary for \`tailwindcss-bun-plugin\``,
  license: rootPackage.license ?? "Apache-2.0",
  os: config.os,
  cpu: config.cpu,
  ...(config.libc ? { libc: config.libc } : {}),
  main: config.filename,
  files: [config.filename],
  publishConfig: {
    access: "public",
  },
};

await fs.rm(packageDir, { recursive: true, force: true });
await fs.mkdir(packageDir, { recursive: true });
await fs.copyFile(sourceBinary, path.join(packageDir, config.filename));
await fs.writeFile(
  path.join(packageDir, "package.json"),
  `${JSON.stringify(packageJson, null, 2)}\n`
);

console.log(`Staged ${config.packageName} in ${packageDir}`);
