import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getNativeTargetByTriple } from "../src/native-targets";

const ROOT_DIR = import.meta.dir
  ? path.resolve(import.meta.dir, "..")
  : process.cwd();
const BINARIES_DIR = path.join(ROOT_DIR, "binaries");
const NATIVE_DIR = path.join(ROOT_DIR, "native");
const BUILD_DIR = path.join(ROOT_DIR, ".tmp-build-plugin");

function getArg(name: string) {
  const prefix = `${name}=`;
  return Bun.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function readPackageJson() {
  return JSON.parse(
    await Bun.file(path.join(ROOT_DIR, "package.json")).text()
  ) as {
    dependencies?: Record<string, string>;
  };
}

async function resolveOxideRef() {
  const packageJson = await readPackageJson();
  const oxideVersion = packageJson.dependencies?.tailwindcss;

  if (!(oxideVersion && /^\d+\.\d+\.\d+$/.test(oxideVersion))) {
    throw new Error(
      `Expected an exact tailwindcss version in package.json, got ${String(oxideVersion)}`
    );
  }

  return `v${oxideVersion}`;
}

async function assertNativeOxideRef(ref: string) {
  const manifest = await fs.readFile(
    path.join(NATIVE_DIR, "Cargo.toml"),
    "utf8"
  );

  if (!manifest.includes(`tag = "${ref}"`)) {
    throw new Error(`native/Cargo.toml must use tag = "${ref}"`);
  }
}

function pathExists(target: string) {
  return fs.access(target).then(
    () => true,
    () => false
  );
}

async function installLefthook() {
  if (process.env.CI) {
    return;
  }

  const hasGitMetadata = await pathExists(path.join(ROOT_DIR, ".git"));

  if (!hasGitMetadata) {
    return;
  }

  await Bun.$`bun x lefthook install --reset-hooks-path`.cwd(ROOT_DIR);
}

function isMusl() {
  if (process.platform !== "linux") {
    return false;
  }

  const report = process.report?.getReport?.() as
    | {
        header?: { glibcVersionRuntime?: string };
        sharedObjects?: string[];
      }
    | undefined;

  if (report?.header?.glibcVersionRuntime) {
    return false;
  }

  if (Array.isArray(report?.sharedObjects)) {
    return report.sharedObjects.some(
      (file: string) => file.includes("libc.musl-") || file.includes("ld-musl-")
    );
  }

  return os.release().toLowerCase().includes("musl");
}

function resolveCurrentTarget() {
  if (process.platform === "android" && process.arch === "arm64") {
    return "aarch64-linux-android";
  }

  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-apple-darwin";
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return "x86_64-apple-darwin";
  }

  if (process.platform === "linux" && process.arch === "arm64") {
    return isMusl()
      ? "aarch64-unknown-linux-musl"
      : "aarch64-unknown-linux-gnu";
  }

  if (process.platform === "linux" && process.arch === "x64") {
    return isMusl() ? "x86_64-unknown-linux-musl" : "x86_64-unknown-linux-gnu";
  }

  if (process.platform === "win32" && process.arch === "arm64") {
    return "aarch64-pc-windows-msvc";
  }

  if (process.platform === "win32" && process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }

  throw new Error(
    `Unsupported local platform: ${process.platform}/${process.arch}`
  );
}

async function findNodeBinary(dir: string): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await findNodeBinary(entryPath).catch(() => null);
      if (nested) return nested;
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".node")) {
      return entryPath;
    }
  }

  throw new Error(`No native binary produced in ${dir}`);
}

const target =
  getArg("--target") ?? process.env.NAPI_BUILD_TARGET ?? resolveCurrentTarget();
const config = getNativeTargetByTriple(target);

if (!config) {
  throw new Error(`Unsupported target: ${target}`);
}

await installLefthook();
await fs.mkdir(BINARIES_DIR, { recursive: true });

const oxideRef = await resolveOxideRef();
await assertNativeOxideRef(oxideRef);
const outputPath = path.join(BINARIES_DIR, config.filename);

await Bun.$`rustup target add ${target}`.nothrow();

const targetBuildDir = path.join(BUILD_DIR, target);
await fs.rm(targetBuildDir, { recursive: true, force: true });
await fs.mkdir(targetBuildDir, { recursive: true });

await Bun.$`bun x napi build --platform --release --target=${target} --output-dir ${targetBuildDir} --no-js`.cwd(
  NATIVE_DIR
);

const builtPath = await findNodeBinary(targetBuildDir);
await fs.copyFile(builtPath, outputPath);
console.log(`Prepared ${config.filename}`);
