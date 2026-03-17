import fs from "node:fs/promises";
import path from "node:path";
import { NATIVE_TARGETS } from "../src/native-targets";

const ROOT_DIR = import.meta.dir
  ? path.resolve(import.meta.dir, "..")
  : process.cwd();
const RELEASE_DIR = path.join(ROOT_DIR, ".tmp-release", "root");

interface RootPackageJson {
  dependencies?: Record<string, string>;
  description?: string;
  engines?: Record<string, string>;
  exports?: Record<string, unknown>;
  files?: string[];
  keywords?: string[];
  license?: string;
  main?: string;
  name: string;
  publishConfig?: Record<string, unknown>;
  repository?: Record<string, unknown> | string;
  type?: string;
  types?: string;
  version: string;
}

async function readRootPackageJson() {
  return JSON.parse(
    await Bun.file(path.join(ROOT_DIR, "package.json")).text()
  ) as RootPackageJson;
}

const rootPackage = await readRootPackageJson();
const releasePackageJson = {
  name: rootPackage.name,
  version: rootPackage.version,
  description: rootPackage.description,
  type: rootPackage.type,
  license: rootPackage.license,
  keywords: rootPackage.keywords,
  files: rootPackage.files,
  main: rootPackage.main,
  types: rootPackage.types,
  exports: rootPackage.exports,
  engines: rootPackage.engines,
  publishConfig: rootPackage.publishConfig,
  repository: rootPackage.repository,
  dependencies: rootPackage.dependencies,
  optionalDependencies: Object.fromEntries(
    NATIVE_TARGETS.map((target) => [target.packageName, rootPackage.version])
  ),
};

await fs.rm(RELEASE_DIR, { recursive: true, force: true });
await fs.mkdir(RELEASE_DIR, { recursive: true });
await fs.cp(path.join(ROOT_DIR, "src"), path.join(RELEASE_DIR, "src"), {
  recursive: true,
});
await fs.copyFile(
  path.join(ROOT_DIR, "README.md"),
  path.join(RELEASE_DIR, "README.md")
);
await fs.copyFile(
  path.join(ROOT_DIR, "LICENSE"),
  path.join(RELEASE_DIR, "LICENSE")
);
await fs.writeFile(
  path.join(RELEASE_DIR, "package.json"),
  `${JSON.stringify(releasePackageJson, null, 2)}\n`
);

console.log(`Staged root package in ${RELEASE_DIR}`);
