import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { getNativeTargetForRuntime } from "./native-targets";

const require = createRequire(import.meta.url);

export interface SourceEntry {
  base: string;
  negated: boolean;
  pattern: string;
}

export interface ChangedContent {
  content?: string | null;
  extension: string;
  file?: string | null;
}

export interface GlobEntry {
  base: string;
  pattern: string;
}

export interface CandidateWithPosition {
  candidate: string;
  position: number;
}

export interface ScannerOptions {
  sources?: SourceEntry[];
}

interface ScannerHandle {
  readonly files: string[];
  getCandidatesWithPositions(input: ChangedContent): CandidateWithPosition[];
  readonly globs: GlobEntry[];
  readonly normalizedSources: GlobEntry[];
  scan(): string[];
  scanFiles(input: ChangedContent[]): string[];
}

interface NativeBinding {
  Scanner: new (opts: ScannerOptions) => ScannerHandle;
  twctxCreate: () => TailwindContextExternal;
  twctxIsDirty: (ctx: TailwindContextExternal) => boolean;
  twctxToJs: (
    ctx: TailwindContextExternal
  ) => Array<{ id: string; candidates: string[] }>;
}

export type TailwindContextExternal = unknown;

function isMusl() {
  let musl: boolean | null = null;

  try {
    musl = readFileSync("/usr/bin/ldd", "utf-8").includes("musl");
  } catch {}

  if (musl !== null) {
    return musl;
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

  try {
    return execSync("ldd --version", { encoding: "utf8" }).includes("musl");
  } catch {
    return false;
  }
}

function requireNativeBinding() {
  const config = getNativeTargetForRuntime(
    process.platform,
    process.arch,
    process.platform === "linux" ? (isMusl() ? "musl" : "glibc") : undefined
  );

  if (!config) {
    throw new Error(
      `Unsupported platform for tailwindcss bun plugin: ${process.platform}/${process.arch}`
    );
  }

  try {
    return require(config.packageName);
  } catch (error) {
    const sourcePath = fileURLToPath(
      new URL(`../binaries/${config.filename}`, import.meta.url)
    );
    if (
      existsSync(sourcePath) &&
      isMissingModuleError(error, config.packageName)
    ) {
      return require(sourcePath);
    }

    throw error;
  }
}

function isMissingModuleError(error: unknown, packageName: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : String(error);

  if (
    (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") &&
    message.includes(packageName)
  ) {
    return true;
  }

  return message.includes(packageName);
}

const nativeBinding = requireNativeBinding() as NativeBinding;

export const Scanner = nativeBinding.Scanner;
export const twctxCreate = nativeBinding.twctxCreate;
export const twctxIsDirty = nativeBinding.twctxIsDirty;
export const twctxToJs = nativeBinding.twctxToJs;
export const napiModule = nativeBinding as unknown;
